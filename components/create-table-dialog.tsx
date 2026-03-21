"use client";
import React from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, X } from "lucide-react";

const GEOM_TYPES = ["Point", "MultiPoint", "LineString", "MultiLineString", "Polygon", "MultiPolygon"];

// ---- ArcGIS import helpers ----

interface ArcGISField { name: string; type: string; alias: string; }

const SKIP_FIELD_TYPES = new Set([
  "esriFieldTypeOID", "esriFieldTypeGeometry",
  "esriFieldTypeBlob", "esriFieldTypeRaster", "esriFieldTypeXML",
]);

function arcgisTypeToPostgres(type: string): "text" | "numeric" {
  return (
    type === "esriFieldTypeInteger" || type === "esriFieldTypeSmallInteger" ||
    type === "esriFieldTypeDouble"  || type === "esriFieldTypeSingle"
  ) ? "numeric" : "text";
}

const RESERVED_NAMES = new Set(["id", "geom", "created_at", "last_updated"]);

function sanitizeFieldName(name: string): string {
  let s = name.toLowerCase().replace(/[^a-z0-9_]/g, "_");
  if (/^[0-9]/.test(s)) s = "_" + s;
  if (RESERVED_NAMES.has(s)) s = "f_" + s;
  return s;
}

function normalizeLayerUrl(input: string): string {
  let url = input.trim().replace(/\/+$/, "");
  if (url.toLowerCase().endsWith("/query")) url = url.slice(0, -6);
  return url;
}

async function arcFetch(url: string): Promise<any> {
  const res = await fetch("/api/arcgis/proxy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Proxy error");
  return data;
}

function mapGeomType(esriType: string): string {
  if (esriType === "esriGeometryPoint") return "Point";
  if (esriType === "esriGeometryMultipoint") return "MultiPoint";
  return "Geometry";
}

function suggestTableName(layerName: string): string {
  return layerName.toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^[0-9]/, (c) => "_" + c)
    .replace(/^_+|_+$/g, "")
    .slice(0, 63) || "imported_layer";
}

interface ArcGISMeta {
  name: string;
  geometryType: string;
  fields: ArcGISField[];
  maxRecordCount: number;
  count: number;
}

type ImportPhase = "idle" | "loading-meta" | "ready" | "importing" | "done" | "error";

// ---- GeoPackage helpers ----

// GPKG binary geometry header → strip it, return the raw WKB bytes
function gpkgGeomToWkb(data: Uint8Array): Uint8Array | null {
  if (data.length < 8 || data[0] !== 0x47 || data[1] !== 0x50) return null; // not GPKG magic
  const flags = data[3];
  const envelopeType = (flags >> 1) & 0x07;
  const envBytes = [0, 32, 48, 48, 64][Math.min(envelopeType, 4)];
  return data.slice(8 + envBytes);
}

// Minimal WKB → GeoJSON (Point, LineString, Polygon, Multi*, GeometryCollection)
function wkbToGeoJSON(buf: Uint8Array): object | null {
  let pos = 0;

  function u8(): number { return buf[pos++]; }
  function i32(le: boolean): number {
    const v = le
      ? buf[pos] | (buf[pos+1]<<8) | (buf[pos+2]<<16) | (buf[pos+3]<<24)
      : (buf[pos]<<24) | (buf[pos+1]<<16) | (buf[pos+2]<<8) | buf[pos+3];
    pos += 4; return v >>> 0;
  }
  function f64(le: boolean): number {
    const dv = new DataView(buf.buffer, buf.byteOffset + pos, 8);
    pos += 8; return dv.getFloat64(0, le);
  }
  function pt(le: boolean): number[] { return [f64(le), f64(le)]; }
  function ring(le: boolean): number[][] {
    const n = i32(le); const c: number[][] = [];
    for (let i = 0; i < n; i++) c.push(pt(le));
    return c;
  }

  function geom(): object | null {
    const le = u8() === 1;
    const t = i32(le) & 0xFFFF;
    const base = t > 1000 ? t - 1000 : t;
    if (base === 1) return { type: "Point", coordinates: pt(le) };
    if (base === 2) return { type: "LineString", coordinates: ring(le) };
    if (base === 3) {
      const nr = i32(le); const rings: number[][][] = [];
      for (let i = 0; i < nr; i++) rings.push(ring(le));
      return { type: "Polygon", coordinates: rings };
    }
    if (base === 4) {
      const n = i32(le);
      return { type: "MultiPoint", coordinates: Array.from({length: n}, () => (geom() as any)?.coordinates) };
    }
    if (base === 5) {
      const n = i32(le);
      return { type: "MultiLineString", coordinates: Array.from({length: n}, () => (geom() as any)?.coordinates) };
    }
    if (base === 6) {
      const n = i32(le);
      return { type: "MultiPolygon", coordinates: Array.from({length: n}, () => (geom() as any)?.coordinates) };
    }
    if (base === 7) {
      const n = i32(le);
      return { type: "GeometryCollection", geometries: Array.from({length: n}, geom) };
    }
    return null;
  }

  try { return geom(); } catch { return null; }
}

interface GpkgLayer {
  tableName: string;
  geomColumn: string;
  geomType: string;
  srid: number;
  count: number;
}

interface GpkgColMapping {
  origName: string;
  pgName: string;
  type: "text" | "numeric";
  include: boolean;
}

function buildColMappings(db: any, layer: GpkgLayer): GpkgColMapping[] {
  const colInfoRows = db.exec(`PRAGMA table_info("${layer.tableName}")`);
  const SKIP = new Set([layer.geomColumn.toLowerCase(), "fid"]);
  return ((colInfoRows[0]?.values ?? []) as any[][])
    .filter((r) => !SKIP.has(String(r[1]).toLowerCase()))
    .map((r) => {
      const origName = String(r[1]);
      const sqlType = String(r[2]).toLowerCase();
      const isNumeric = ["int", "real", "float", "double", "num"].some((t) => sqlType.includes(t));
      let pgName = sanitizeFieldName(origName);
      // f_id is the reserved-name escape for source columns named "id" — rename to source_id for clarity
      if (pgName === "f_id") pgName = "source_id";
      return { origName, pgName, type: isNumeric ? "numeric" : "text", include: true };
    });
}

const VALID_IDENT_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

type GpkgPhase = "idle" | "parsing" | "ready" | "importing" | "done" | "error";

interface UserColumn {
  id: string;
  name: string;
  type: "text" | "numeric";
  notNull: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dsn: string;
  onCreated: () => void;
}

export function CreateTableDialog({ open, onOpenChange, dsn, onCreated }: Props) {
  const [activeTab, setActiveTab] = React.useState("blank");

  // ---- Blank table state ----
  const [schema, setSchema] = React.useState("public");
  const [tableName, setTableName] = React.useState("");
  const [geomType, setGeomType] = React.useState("Point");
  const [srid, setSrid] = React.useState("4326");
  const [columns, setColumns] = React.useState<UserColumn[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // ---- GeoPackage state ----
  const [gpkgPhase, setGpkgPhase] = React.useState<GpkgPhase>("idle");
  const [gpkgLayers, setGpkgLayers] = React.useState<GpkgLayer[]>([]);
  const [gpkgSelectedLayer, setGpkgSelectedLayer] = React.useState<GpkgLayer | null>(null);
  const [gpkgColMappings, setGpkgColMappings] = React.useState<GpkgColMapping[]>([]);
  const [gpkgSchema, setGpkgSchema] = React.useState("public");
  const [gpkgTable, setGpkgTable] = React.useState("");
  const [gpkgProgress, setGpkgProgress] = React.useState({ done: 0, total: 0 });
  const [gpkgError, setGpkgError] = React.useState("");
  const gpkgDbRef = React.useRef<any>(null);

  // ---- ArcGIS import state ----
  const [arcUrl, setArcUrl] = React.useState("");
  const [arcPhase, setArcPhase] = React.useState<ImportPhase>("idle");
  const [arcMeta, setArcMeta] = React.useState<ArcGISMeta | null>(null);
  const [arcColMappings, setArcColMappings] = React.useState<GpkgColMapping[]>([]);
  const [arcSchema, setArcSchema] = React.useState("public");
  const [arcTable, setArcTable] = React.useState("");
  const [arcProgress, setArcProgress] = React.useState({ done: 0, total: 0 });
  const [arcError, setArcError] = React.useState("");
  const abortRef = React.useRef(false);

  function reset() {
    setTableName("");
    setSchema("public");
    setGeomType("Point");
    setSrid("4326");
    setColumns([]);
    setError(null);
    setActiveTab("blank");
    setArcUrl("");
    setArcPhase("idle");
    setArcMeta(null);
    setArcColMappings([]);
    setArcSchema("public");
    setArcTable("");
    setArcProgress({ done: 0, total: 0 });
    setArcError("");
    abortRef.current = false;
    setGpkgPhase("idle");
    setGpkgLayers([]);
    setGpkgSelectedLayer(null);
    setGpkgColMappings([]);
    setGpkgSchema("public");
    setGpkgTable("");
    setGpkgProgress({ done: 0, total: 0 });
    setGpkgError("");
    gpkgDbRef.current = null;
  }

  React.useEffect(() => {
    if (open) setError(null);
    else reset();
  }, [open]);

  function addColumn() {
    setColumns((prev) => [...prev, { id: crypto.randomUUID(), name: "", type: "text", notNull: false }]);
  }

  function updateColumn(id: string, patch: Partial<UserColumn>) {
    setColumns((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  function removeColumn(id: string) {
    setColumns((prev) => prev.filter((c) => c.id !== id));
  }

  async function handleCreate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/pg/create-table", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dsn, schema, table: tableName, geomType, srid, columns }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onCreated();
      onOpenChange(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  // ---- ArcGIS import functions ----

  async function loadArcMeta() {
    const layerUrl = normalizeLayerUrl(arcUrl);
    if (!layerUrl) return;
    setArcPhase("loading-meta");
    setArcError("");
    try {
      const metaJson = await arcFetch(`${layerUrl}?f=json`);
      if (metaJson.error) throw new Error(metaJson.error.message ?? "ArcGIS metadata error");

      let count = 0;
      try {
        const countJson = await arcFetch(`${layerUrl}/query?where=1%3D1&returnCountOnly=true&f=json`);
        count = countJson.count ?? 0;
      } catch { count = 0; }

      const fields: ArcGISField[] = (metaJson.fields ?? []).filter((f: ArcGISField) => !SKIP_FIELD_TYPES.has(f.type));
      setArcMeta({
        name: metaJson.name ?? "Layer",
        geometryType: metaJson.geometryType ?? "",
        fields,
        maxRecordCount: metaJson.maxRecordCount ?? 1000,
        count,
      });
      setArcColMappings(fields.map((f) => {
        let pgName = sanitizeFieldName(f.name);
        if (pgName === "f_id") pgName = "source_id";
        return { origName: f.name, pgName, type: arcgisTypeToPostgres(f.type), include: true };
      }));
      setArcTable(suggestTableName(metaJson.name ?? "layer"));
      setArcPhase("ready");
    } catch (e: any) {
      setArcError(e.message ?? "Failed to load metadata");
      setArcPhase("error");
    }
  }

  async function startArcImport() {
    if (!arcMeta) return;
    abortRef.current = false;
    setArcPhase("importing");
    setArcProgress({ done: 0, total: arcMeta.count });

    const includedCols = arcColMappings.filter((c) => c.include);
    const columns = includedCols.map((c) => ({ name: c.pgName, type: c.type }));

    const createRes = await fetch("/api/pg/create-table", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dsn, schema: arcSchema, table: arcTable,
        geomType: mapGeomType(arcMeta.geometryType),
        srid: 4326, columns,
      }),
    });
    const createData = await createRes.json();
    if (!createRes.ok) { setArcError(createData.error ?? "Failed to create table"); setArcPhase("error"); return; }

    const layerUrl = normalizeLayerUrl(arcUrl);

    // returnIdsOnly bypasses maxRecordCount and returns all IDs in one call
    let allIds: number[] = [];
    try {
      const j = await arcFetch(`${layerUrl}/query?where=1%3D1&returnIdsOnly=true&f=json`);
      if (j.error) throw new Error(j.error.message ?? "Failed to fetch object IDs");
      allIds = j.objectIds ?? [];
    } catch (e: any) { setArcError(e.message ?? "Failed to fetch object IDs"); setArcPhase("error"); return; }

    setArcProgress({ done: 0, total: allIds.length });

    const batchSize = Math.min(arcMeta.maxRecordCount, 500);
    for (let i = 0; i < allIds.length; i += batchSize) {
      if (abortRef.current) { setArcError("Import cancelled."); setArcPhase("error"); return; }

      const batchIds = allIds.slice(i, i + batchSize);
      let features: any[];
      try {
        const geoJson = await arcFetch(
          `${layerUrl}/query?objectIds=${batchIds.join(",")}&outFields=*&f=geojson`
        );
        if (geoJson.error) throw new Error(geoJson.error.message ?? "ArcGIS query error");
        features = geoJson.features ?? [];
      } catch (e: any) { setArcError(e.message ?? "Failed to fetch features"); setArcPhase("error"); return; }

      const rows = features
        .filter((f: any) => f.geometry != null)
        .map((f: any) => {
          const attrs: Record<string, any> = {};
          for (const col of includedCols) {
            const val = f.properties?.[col.origName];
            attrs[col.pgName] = val == null ? null : String(val);
          }
          return { geomJson: JSON.stringify(f.geometry), attrs };
        });

      if (rows.length > 0) {
        const insertRes = await fetch("/api/pg/bulk-insert", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dsn, schema: arcSchema, table: arcTable, rows }),
        });
        const insertData = await insertRes.json();
        if (!insertRes.ok) { setArcError(insertData.error ?? "Insert failed"); setArcPhase("error"); return; }
      }

      setArcProgress({ done: i + batchIds.length, total: allIds.length });
    }

    setArcPhase("done");
    onCreated();
  }

  const arcPct = arcProgress.total > 0 ? Math.round((arcProgress.done / arcProgress.total) * 100) : null;

  // ---- GeoPackage functions ----

  async function handleGpkgFile(file: File) {
    setGpkgPhase("parsing");
    setGpkgError("");
    setGpkgLayers([]);
    setGpkgSelectedLayer(null);
    try {
      const initSqlJs = (await import("sql.js")).default;
      const SQL = await initSqlJs({
        locateFile: () => "/sql-wasm.wasm",
      });
      const buf = await file.arrayBuffer();
      const db = new SQL.Database(new Uint8Array(buf));
      gpkgDbRef.current = db;

      // List feature layers
      const layerRows = db.exec(
        `SELECT c.table_name, g.column_name, g.geometry_type_name, g.srs_id
         FROM gpkg_contents c
         JOIN gpkg_geometry_columns g ON g.table_name = c.table_name
         WHERE c.data_type = 'features'`
      );

      if (!layerRows.length || !layerRows[0].values.length) {
        throw new Error("No feature layers found in this GeoPackage.");
      }

      const layers: GpkgLayer[] = layerRows[0].values.map((row: any[]) => {
        const tableName = String(row[0]);
        const countRes = db.exec(`SELECT COUNT(*) FROM "${tableName}"`);
        const count = Number(countRes[0]?.values[0]?.[0] ?? 0);
        return {
          tableName,
          geomColumn: String(row[1]),
          geomType: String(row[2] ?? "Geometry"),
          srid: Number(row[3] ?? 4326),
          count,
        };
      });

      setGpkgLayers(layers);
      const first = layers[0];
      setGpkgSelectedLayer(first);
      setGpkgColMappings(buildColMappings(db, first));
      setGpkgTable(suggestTableName(first.tableName));
      setGpkgSchema("public");
      setGpkgPhase("ready");
    } catch (e: any) {
      setGpkgError(e.message ?? "Failed to read GeoPackage");
      setGpkgPhase("error");
    }
  }

  async function startGpkgImport() {
    const db = gpkgDbRef.current;
    const layer = gpkgSelectedLayer;
    if (!db || !layer) return;

    setGpkgPhase("importing");
    setGpkgProgress({ done: 0, total: layer.count });

    // Use the user-configured column mappings (included columns only)
    const includedCols = gpkgColMappings.filter((c) => c.include);
    const pgCols = includedCols.map((c) => ({ name: c.pgName, type: c.type }));

    // Create PostGIS table
    const gpkgGeomType = layer.geomType || "Geometry";
    const pgGeomType = gpkgGeomType.charAt(0).toUpperCase() + gpkgGeomType.slice(1).toLowerCase();
    const validGeomTypes = new Set(["Point", "Multipoint", "Linestring", "Multilinestring", "Polygon", "Multipolygon", "Geometry"]);
    const finalGeomType = validGeomTypes.has(pgGeomType) ? pgGeomType : "Geometry";

    const createRes = await fetch("/api/pg/create-table", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dsn, schema: gpkgSchema, table: gpkgTable,
        geomType: finalGeomType, srid: layer.srid || 4326,
        columns: pgCols,
      }),
    });
    const createData = await createRes.json();
    if (!createRes.ok) {
      setGpkgError(createData.error ?? "Failed to create table");
      setGpkgPhase("error");
      return;
    }

    // Read features in batches and insert
    const batchSize = 500;
    const colSql = [layer.geomColumn, ...includedCols.map((c) => c.origName)]
      .map((c) => `"${c}"`).join(", ");

    let offset = 0;
    while (offset < layer.count) {
      const featureRows = db.exec(
        `SELECT ${colSql} FROM "${layer.tableName}" LIMIT ${batchSize} OFFSET ${offset}`
      );
      const values: any[][] = featureRows[0]?.values ?? [];
      if (values.length === 0) break;

      const rows = values.flatMap((row: any[]) => {
        const rawGeom = row[0];
        if (!rawGeom) return [];
        const geomBuf = rawGeom instanceof Uint8Array ? rawGeom : new Uint8Array(rawGeom);
        const wkb = gpkgGeomToWkb(geomBuf);
        if (!wkb) return [];
        const geoJson = wkbToGeoJSON(wkb);
        if (!geoJson) return [];

        const attrs: Record<string, any> = {};
        includedCols.forEach((col, i) => {
          attrs[col.pgName] = row[i + 1] == null ? null : String(row[i + 1]);
        });
        return [{ geomJson: JSON.stringify(geoJson), attrs }];
      });

      if (rows.length > 0) {
        const insertRes = await fetch("/api/pg/bulk-insert", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dsn, schema: gpkgSchema, table: gpkgTable, rows, srid: layer.srid || 4326 }),
        });
        const insertData = await insertRes.json();
        if (!insertRes.ok) {
          setGpkgError(insertData.error ?? "Insert failed");
          setGpkgPhase("error");
          return;
        }
      }

      offset += values.length;
      setGpkgProgress({ done: offset, total: layer.count });
      // yield to keep UI responsive
      await new Promise((r) => setTimeout(r, 0));
    }

    setGpkgPhase("done");
    onCreated();
  }

  const gpkgPct = gpkgProgress.total > 0 ? Math.round((gpkgProgress.done / gpkgProgress.total) * 100) : null;

  // ---- End GeoPackage ----

  const fixedColumns = [
    { name: "id", type: "SERIAL PRIMARY KEY" },
    { name: "created_at", type: "TIMESTAMP DEFAULT NOW()" },
    { name: "last_updated", type: "TIMESTAMP DEFAULT NOW()" },
    { name: "geom", type: `GEOMETRY(${geomType}, ${srid})` },
  ];

  const canCreate = tableName.trim().length > 0 && schema.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (arcPhase === "importing" || gpkgPhase === "importing") return; onOpenChange(v); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Table</DialogTitle>
          <DialogDescription>
            Create a blank PostGIS table or import from an ArcGIS Feature Server.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-2">
          <TabsList className="w-full">
            <TabsTrigger value="blank" className="flex-1">Blank table</TabsTrigger>
            <TabsTrigger value="arcgis" className="flex-1">ArcGIS</TabsTrigger>
            <TabsTrigger value="gpkg" className="flex-1">GeoPackage</TabsTrigger>
          </TabsList>

          {/* ---- Blank table tab ---- */}
          <TabsContent value="blank">
        <div className="space-y-5 mt-2">
          {/* Schema + table name */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Schema</Label>
              <Input
                value={schema}
                onChange={(e) => setSchema(e.target.value)}
                placeholder="public"
                className="h-8 text-sm font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Table name</Label>
              <Input
                value={tableName}
                onChange={(e) => setTableName(e.target.value)}
                placeholder="my_table"
                className="h-8 text-sm font-mono"
              />
            </div>
          </div>

          {/* Geometry */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Geometry type</Label>
              <Select value={geomType} onValueChange={setGeomType}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GEOM_TYPES.map((t) => (
                    <SelectItem key={t} value={t} className="text-sm">{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">SRID</Label>
              <Input
                value={srid}
                onChange={(e) => setSrid(e.target.value)}
                className="h-8 text-sm font-mono"
              />
            </div>
          </div>

          {/* Fixed columns preview */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground uppercase tracking-wide">Fixed columns</Label>
            <div className="rounded-md border bg-muted/30 divide-y">
              {fixedColumns.map((col) => (
                <div key={col.name} className="flex items-center justify-between px-3 py-2">
                  <span className="text-xs font-mono font-medium">{col.name}</span>
                  <span className="text-xs font-mono text-muted-foreground">{col.type}</span>
                </div>
              ))}
            </div>
          </div>

          {/* User columns */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wide">Additional columns</Label>

            {columns.length === 0 && (
              <p className="text-xs text-muted-foreground">No additional columns. Click below to add one.</p>
            )}

            {columns.map((col) => (
              <div key={col.id} className="flex items-center gap-2">
                <Input
                  placeholder="column_name"
                  value={col.name}
                  onChange={(e) => updateColumn(col.id, { name: e.target.value })}
                  className="h-8 text-xs font-mono flex-1 min-w-0"
                />
                <Select
                  value={col.type}
                  onValueChange={(v) => updateColumn(col.id, { type: v as "text" | "numeric" })}
                >
                  <SelectTrigger className="h-8 text-xs w-28 shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text" className="text-xs">TEXT</SelectItem>
                    <SelectItem value="numeric" className="text-xs">NUMERIC</SelectItem>
                  </SelectContent>
                </Select>
                <label className="flex items-center gap-1 text-xs text-muted-foreground shrink-0 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={col.notNull}
                    onChange={(e) => updateColumn(col.id, { notNull: e.target.checked })}
                    className="h-3 w-3"
                  />
                  NOT NULL
                </label>
                <Button
                  size="icon" variant="ghost"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => removeColumn(col.id)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}

            <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={addColumn}>
              <Plus className="h-3 w-3 mr-1" /> Add column
            </Button>
          </div>

          {error && <p className="text-xs text-destructive break-words">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!canCreate || loading}>
              {loading ? "Creating…" : "Create table"}
            </Button>
          </div>
        </div>
          </TabsContent>

          {/* ---- ArcGIS import tab ---- */}
          <TabsContent value="arcgis">
            <div className="space-y-4 mt-2">
              {/* URL input */}
              <div className="space-y-1.5">
                <Label htmlFor="arc-url" className="text-xs">Feature Server Layer URL</Label>
                <div className="flex gap-2">
                  <Input
                    id="arc-url"
                    placeholder="https://services.arcgis.com/…/FeatureServer/0"
                    value={arcUrl}
                    onChange={(e) => setArcUrl(e.target.value)}
                    className="font-mono text-xs"
                    disabled={arcPhase === "importing" || arcPhase === "done"}
                    onKeyDown={(e) => { if (e.key === "Enter" && arcPhase === "idle") loadArcMeta(); }}
                  />
                  <Button
                    variant="outline"
                    onClick={loadArcMeta}
                    disabled={!arcUrl.trim() || arcPhase === "loading-meta" || arcPhase === "importing" || arcPhase === "done"}
                  >
                    {arcPhase === "loading-meta" ? "Loading…" : "Load"}
                  </Button>
                </div>
              </div>

              {/* Metadata */}
              {arcMeta && arcPhase !== "idle" && arcPhase !== "loading-meta" && (
                <div className="rounded-md border bg-muted/30 p-3 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Layer</span>
                    <span className="font-medium truncate max-w-52">{arcMeta.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Geometry</span>
                    <span>{arcMeta.geometryType.replace("esriGeometry", "")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Features</span>
                    <span>{arcProgress.total > 0 ? arcProgress.total.toLocaleString() : arcMeta.count > 0 ? arcMeta.count.toLocaleString() : "unknown"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Fields</span>
                    <span>{arcMeta.fields.length}</span>
                  </div>
                </div>
              )}

              {/* Schema + table name */}
              {arcPhase === "ready" && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="arc-schema" className="text-xs">Schema</Label>
                    <Input id="arc-schema" value={arcSchema} onChange={(e) => setArcSchema(e.target.value)} className="h-8 text-sm font-mono" placeholder="public" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="arc-table" className="text-xs">Table name</Label>
                    <Input id="arc-table" value={arcTable} onChange={(e) => setArcTable(e.target.value)} className="h-8 text-sm font-mono" placeholder="my_layer" />
                  </div>
                </div>
              )}

              {/* Column mapping */}
              {arcPhase === "ready" && arcColMappings.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] text-muted-foreground">
                    A new <span className="font-mono">id SERIAL PRIMARY KEY</span> is auto-generated. Any source ID column is mapped to <span className="font-mono">source_id</span> by default.
                  </p>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wide">Column mapping</Label>
                    <div className="flex gap-2">
                      <button className="text-[10px] text-muted-foreground hover:text-foreground" onClick={() => setArcColMappings((m) => m.map((c) => ({ ...c, include: true })))}>All</button>
                      <button className="text-[10px] text-muted-foreground hover:text-foreground" onClick={() => setArcColMappings((m) => m.map((c) => ({ ...c, include: false })))}>None</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-[1rem_1fr_1fr_5rem] gap-2 px-2 text-[10px] text-muted-foreground font-medium uppercase tracking-wide">
                    <span /><span>Source field</span><span>PostgreSQL name</span><span>Type</span>
                  </div>
                  <div className="rounded-md border divide-y max-h-56 overflow-y-auto">
                    {arcColMappings.map((col, i) => {
                      const nameValid = VALID_IDENT_RE.test(col.pgName);
                      return (
                        <div key={col.origName} className={`grid grid-cols-[1rem_1fr_1fr_5rem] gap-2 items-center px-2 py-1.5 ${!col.include ? "opacity-40" : ""}`}>
                          <input type="checkbox" checked={col.include} onChange={(e) => setArcColMappings((m) => m.map((c, j) => j === i ? { ...c, include: e.target.checked } : c))} className="h-3 w-3" />
                          <span className="text-xs font-mono truncate text-muted-foreground">{col.origName}</span>
                          <Input
                            value={col.pgName}
                            onChange={(e) => setArcColMappings((m) => m.map((c, j) => j === i ? { ...c, pgName: e.target.value } : c))}
                            disabled={!col.include}
                            className={`h-6 text-xs font-mono px-1.5 ${!nameValid && col.include ? "border-destructive focus-visible:ring-destructive" : ""}`}
                          />
                          <Select value={col.type} onValueChange={(v) => setArcColMappings((m) => m.map((c, j) => j === i ? { ...c, type: v as "text" | "numeric" } : c))} disabled={!col.include}>
                            <SelectTrigger className="h-6 text-xs px-1.5"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="text" className="text-xs">text</SelectItem>
                              <SelectItem value="numeric" className="text-xs">numeric</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Progress */}
              {arcPhase === "importing" && (
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">
                    This may take a while. You can navigate to other tabs — the import will continue in the background.
                  </p>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Importing…</span>
                    <span>
                      {arcProgress.done.toLocaleString()}
                      {arcProgress.total > 0 ? ` / ${arcProgress.total.toLocaleString()}` : ""} features
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-primary transition-all duration-300" style={{ width: arcPct != null ? `${arcPct}%` : "100%" }} />
                  </div>
                  {arcPct != null && <p className="text-xs text-center text-muted-foreground">{arcPct}%</p>}
                </div>
              )}

              {/* Done */}
              {arcPhase === "done" && (
                <p className="text-sm text-green-600 dark:text-green-400">
                  Import complete — {arcProgress.done.toLocaleString()} features added to{" "}
                  <span className="font-mono">{arcSchema}.{arcTable}</span>.
                </p>
              )}

              {/* Error */}
              {arcPhase === "error" && arcError && (
                <p className="text-sm text-destructive break-words">{arcError}</p>
              )}

              <div className="flex justify-end gap-2">
                {arcPhase !== "importing" && (
                  <Button variant="outline" onClick={() => onOpenChange(false)}>
                    {arcPhase === "done" ? "Close" : "Cancel"}
                  </Button>
                )}
                {arcPhase === "ready" && (
                  <Button onClick={startArcImport} disabled={!arcTable.trim() || !arcSchema.trim()}>
                    Import
                  </Button>
                )}
                {arcPhase === "error" && (
                  <Button variant="outline" onClick={() => setArcPhase("ready")}>Back</Button>
                )}
              </div>
            </div>
          </TabsContent>
          {/* ---- GeoPackage tab ---- */}
          <TabsContent value="gpkg">
            <div className="space-y-4 mt-2">
              {/* File picker */}
              {gpkgPhase === "idle" || gpkgPhase === "parsing" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="gpkg-file" className="text-xs">GeoPackage file (.gpkg)</Label>
                  <label
                    htmlFor="gpkg-file"
                    className="flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-border bg-muted/20 px-4 py-8 text-sm text-muted-foreground cursor-pointer hover:bg-muted/40 transition-colors"
                  >
                    {gpkgPhase === "parsing" ? "Reading file…" : (
                      <>
                        <span>Click to select or drag & drop</span>
                        <span className="text-xs font-mono">.gpkg</span>
                      </>
                    )}
                    <input
                      id="gpkg-file"
                      type="file"
                      accept=".gpkg"
                      className="sr-only"
                      disabled={gpkgPhase === "parsing"}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleGpkgFile(f);
                      }}
                    />
                  </label>
                </div>
              ) : null}

              {/* Layer selector (if multiple layers) */}
              {(gpkgPhase === "ready" || gpkgPhase === "importing" || gpkgPhase === "done") && gpkgLayers.length > 1 && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Layer</Label>
                  <Select
                    value={gpkgSelectedLayer?.tableName}
                    onValueChange={(v) => {
                      const l = gpkgLayers.find((x) => x.tableName === v) ?? null;
                      setGpkgSelectedLayer(l);
                      if (l) {
                        setGpkgTable(suggestTableName(l.tableName));
                        setGpkgColMappings(buildColMappings(gpkgDbRef.current, l));
                      }
                    }}
                    disabled={gpkgPhase !== "ready"}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {gpkgLayers.map((l) => (
                        <SelectItem key={l.tableName} value={l.tableName} className="text-sm">
                          {l.tableName} ({l.count.toLocaleString()} features)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Metadata */}
              {gpkgSelectedLayer && gpkgPhase !== "idle" && gpkgPhase !== "parsing" && (
                <div className="rounded-md border bg-muted/30 p-3 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Layer</span>
                    <span className="font-medium">{gpkgSelectedLayer.tableName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Geometry</span>
                    <span>{gpkgSelectedLayer.geomType}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">SRID</span>
                    <span>{gpkgSelectedLayer.srid || 4326}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Features</span>
                    <span>{gpkgSelectedLayer.count.toLocaleString()}</span>
                  </div>
                </div>
              )}

              {/* Schema + table name */}
              {gpkgPhase === "ready" && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="gpkg-schema" className="text-xs">Schema</Label>
                    <Input id="gpkg-schema" value={gpkgSchema} onChange={(e) => setGpkgSchema(e.target.value)} className="h-8 text-sm font-mono" placeholder="public" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="gpkg-table" className="text-xs">Table name</Label>
                    <Input id="gpkg-table" value={gpkgTable} onChange={(e) => setGpkgTable(e.target.value)} className="h-8 text-sm font-mono" placeholder="my_layer" />
                  </div>
                </div>
              )}

              {/* Column mapping */}
              {gpkgPhase === "ready" && gpkgColMappings.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] text-muted-foreground">
                    A new <span className="font-mono">id SERIAL PRIMARY KEY</span> is auto-generated. Any source ID column is mapped to <span className="font-mono">source_id</span> by default.
                  </p>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wide">Column mapping</Label>
                    <div className="flex gap-2">
                      <button className="text-[10px] text-muted-foreground hover:text-foreground" onClick={() => setGpkgColMappings((m) => m.map((c) => ({ ...c, include: true })))}>All</button>
                      <button className="text-[10px] text-muted-foreground hover:text-foreground" onClick={() => setGpkgColMappings((m) => m.map((c) => ({ ...c, include: false })))}>None</button>
                    </div>
                  </div>
                  {/* Header */}
                  <div className="grid grid-cols-[1rem_1fr_1fr_5rem] gap-2 px-2 text-[10px] text-muted-foreground font-medium uppercase tracking-wide">
                    <span />
                    <span>Source column</span>
                    <span>PostgreSQL name</span>
                    <span>Type</span>
                  </div>
                  <div className="rounded-md border divide-y max-h-56 overflow-y-auto">
                    {gpkgColMappings.map((col, i) => {
                      const nameValid = VALID_IDENT_RE.test(col.pgName);
                      return (
                        <div key={col.origName} className={`grid grid-cols-[1rem_1fr_1fr_5rem] gap-2 items-center px-2 py-1.5 ${!col.include ? "opacity-40" : ""}`}>
                          <input
                            type="checkbox"
                            checked={col.include}
                            onChange={(e) => setGpkgColMappings((m) => m.map((c, j) => j === i ? { ...c, include: e.target.checked } : c))}
                            className="h-3 w-3"
                          />
                          <span className="text-xs font-mono truncate text-muted-foreground">{col.origName}</span>
                          <Input
                            value={col.pgName}
                            onChange={(e) => setGpkgColMappings((m) => m.map((c, j) => j === i ? { ...c, pgName: e.target.value } : c))}
                            disabled={!col.include}
                            className={`h-6 text-xs font-mono px-1.5 ${!nameValid && col.include ? "border-destructive focus-visible:ring-destructive" : ""}`}
                          />
                          <Select
                            value={col.type}
                            onValueChange={(v) => setGpkgColMappings((m) => m.map((c, j) => j === i ? { ...c, type: v as "text" | "numeric" } : c))}
                            disabled={!col.include}
                          >
                            <SelectTrigger className="h-6 text-xs px-1.5">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="text" className="text-xs">text</SelectItem>
                              <SelectItem value="numeric" className="text-xs">numeric</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Progress */}
              {gpkgPhase === "importing" && (
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">
                    This may take a while for large files. You can navigate to other tabs — the import will continue in the background.
                  </p>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Importing…</span>
                    <span>{gpkgProgress.done.toLocaleString()} / {gpkgProgress.total.toLocaleString()} features</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-primary transition-all duration-300" style={{ width: gpkgPct != null ? `${gpkgPct}%` : "0%" }} />
                  </div>
                  {gpkgPct != null && <p className="text-xs text-center text-muted-foreground">{gpkgPct}%</p>}
                </div>
              )}

              {/* Done */}
              {gpkgPhase === "done" && (
                <p className="text-sm text-green-600 dark:text-green-400">
                  Import complete — {gpkgProgress.done.toLocaleString()} features added to{" "}
                  <span className="font-mono">{gpkgSchema}.{gpkgTable}</span>.
                </p>
              )}

              {/* Error */}
              {gpkgPhase === "error" && gpkgError && (
                <p className="text-sm text-destructive break-words">{gpkgError}</p>
              )}

              <div className="flex justify-end gap-2">
                {gpkgPhase !== "importing" && (
                  <Button variant="outline" onClick={() => onOpenChange(false)}>
                    {gpkgPhase === "done" ? "Close" : "Cancel"}
                  </Button>
                )}
                {gpkgPhase === "ready" && (() => {
                  const hasInvalidName = gpkgColMappings.some((c) => c.include && !VALID_IDENT_RE.test(c.pgName));
                  const noneIncluded = gpkgColMappings.length > 0 && gpkgColMappings.every((c) => !c.include);
                  return (
                    <Button onClick={startGpkgImport} disabled={!gpkgTable.trim() || !gpkgSchema.trim() || hasInvalidName || noneIncluded}>
                      Import
                    </Button>
                  );
                })()}
                {gpkgPhase === "error" && (
                  <Button variant="outline" onClick={() => setGpkgPhase("idle")}>Back</Button>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
