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

// ─── ArcGIS helpers ───────────────────────────────────────────────────────────

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

const RESERVED_NAMES = new Set(["id", "geom"]);

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
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("json")) {
    const preview = (await res.text()).slice(0, 300);
    throw new Error(`Proxy returned a non-JSON response (HTTP ${res.status}). The response may be too large or the service requires authentication.\n\nPreview: ${preview}`);
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Proxy error");
  return data;
}

function mapGeomType(esriType: string): string {
  if (esriType === "esriGeometryPoint") return "Point";
  if (esriType === "esriGeometryMultipoint") return "MultiPoint";
  return "Geometry";
}

function suggestTableName(name: string): string {
  return name.toLowerCase()
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

type ArcPhase = "idle" | "loading-meta" | "ready" | "importing" | "cancelling" | "cancelled" | "done" | "error";

// ─── File import helpers ──────────────────────────────────────────────────────

interface ColMapping {
  origName: string;
  pgName: string;
  type: "text" | "numeric";
  include: boolean;
}

interface ParsedLayer {
  name: string;
  features: any[];      // GeoJSON Feature objects
  geometryType: string; // PostGIS geometry type string
  srid: number;
}

type FilePhase = "idle" | "parsing" | "ready" | "importing" | "done" | "error";

const GEOM_TYPE_MAP: Record<string, string> = {
  point: "Point", multipoint: "MultiPoint",
  linestring: "LineString", multilinestring: "MultiLineString",
  polygon: "Polygon", multipolygon: "MultiPolygon",
  geometrycollection: "GeometryCollection",
};

function normalizeGeomType(raw: string): string {
  return GEOM_TYPE_MAP[raw.toLowerCase()] ?? "Geometry";
}

function detectGeomType(features: any[]): string {
  const types = new Set<string>();
  for (const f of features) {
    const t = f?.geometry?.type;
    if (t) { types.add(t); if (types.size > 1) return "Geometry"; }
  }
  return types.size === 1 ? Array.from(types)[0] : "Geometry";
}

function inferColMappings(features: any[]): ColMapping[] {
  const keys = new Map<string, Set<any>>();
  for (const f of features.slice(0, 200)) {
    for (const [k, v] of Object.entries(f?.properties ?? {})) {
      if (!keys.has(k)) keys.set(k, new Set());
      if (v != null) keys.get(k)!.add(v);
    }
  }
  const skip = new Set(["id", "geom", "fid"]);
  return Array.from(keys.entries())
    .filter(([k]) => !skip.has(k.toLowerCase()))
    .map(([origName, vals]) => {
      const isNumeric = vals.size > 0 && Array.from(vals).every((v) => !isNaN(Number(v)));
      let pgName = sanitizeFieldName(origName);
      if (pgName === "f_id") pgName = "source_id";
      return { origName, pgName, type: isNumeric ? "numeric" : "text", include: true };
    });
}

// GPKG binary geometry header → WKB bytes
function gpkgGeomToWkb(data: Uint8Array): Uint8Array | null {
  if (data.length < 8 || data[0] !== 0x47 || data[1] !== 0x50) return null;
  const flags = data[3];
  const envelopeType = (flags >> 1) & 0x07;
  const envBytes = [0, 32, 48, 48, 64][Math.min(envelopeType, 4)];
  return data.slice(8 + envBytes);
}

// Minimal WKB → GeoJSON geometry
function wkbToGeoJSON(buf: Uint8Array): object | null {
  let pos = 0;
  function u8() { return buf[pos++]; }
  function i32(le: boolean) {
    const v = le
      ? buf[pos] | (buf[pos+1]<<8) | (buf[pos+2]<<16) | (buf[pos+3]<<24)
      : (buf[pos]<<24) | (buf[pos+1]<<16) | (buf[pos+2]<<8) | buf[pos+3];
    pos += 4; return v >>> 0;
  }
  function f64(le: boolean) {
    const dv = new DataView(buf.buffer, buf.byteOffset + pos, 8);
    pos += 8; return dv.getFloat64(0, le);
  }
  function pt(le: boolean) { return [f64(le), f64(le)]; }
  function ring(le: boolean) {
    const n = i32(le); const c = [];
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
      const nr = i32(le); const rings = [];
      for (let i = 0; i < nr; i++) rings.push(ring(le));
      return { type: "Polygon", coordinates: rings };
    }
    if (base === 4) { const n = i32(le); return { type: "MultiPoint", coordinates: Array.from({length: n}, () => (geom() as any)?.coordinates) }; }
    if (base === 5) { const n = i32(le); return { type: "MultiLineString", coordinates: Array.from({length: n}, () => (geom() as any)?.coordinates) }; }
    if (base === 6) { const n = i32(le); return { type: "MultiPolygon", coordinates: Array.from({length: n}, () => (geom() as any)?.coordinates) }; }
    if (base === 7) { const n = i32(le); return { type: "GeometryCollection", geometries: Array.from({length: n}, geom) }; }
    return null;
  }
  try { return geom(); } catch { return null; }
}

async function parseGpkg(file: File): Promise<ParsedLayer[]> {
  const initSqlJs = (await import("sql.js")).default;
  const SQL = await initSqlJs({ locateFile: () => "/sql-wasm.wasm" });
  const db = new SQL.Database(new Uint8Array(await file.arrayBuffer()));
  try {
    const layerRows = db.exec(
      `SELECT c.table_name, g.column_name, g.geometry_type_name, g.srs_id
       FROM gpkg_contents c
       JOIN gpkg_geometry_columns g ON g.table_name = c.table_name
       WHERE c.data_type = 'features'`
    );
    if (!layerRows.length || !layerRows[0].values.length)
      throw new Error("No feature layers found in this GeoPackage.");

    return (layerRows[0].values as any[][]).map((row) => {
      const tableName = String(row[0]);
      const geomCol = String(row[1]);
      const geomType = normalizeGeomType(String(row[2] ?? "Geometry"));
      const srid = Number(row[3] ?? 4326);

      const colInfo = db.exec(`PRAGMA table_info("${tableName}")`);
      const skip = new Set([geomCol.toLowerCase(), "fid"]);
      const attrCols = ((colInfo[0]?.values ?? []) as any[][])
        .filter((r) => !skip.has(String(r[1]).toLowerCase()))
        .map((r) => String(r[1]));

      const colSql = [geomCol, ...attrCols].map((c) => `"${c}"`).join(", ");
      const featureRows = db.exec(`SELECT ${colSql} FROM "${tableName}"`);
      const values: any[][] = featureRows[0]?.values ?? [];

      const features = values.flatMap((valRow): any[] => {
        const rawGeom = valRow[0];
        if (!rawGeom) return [];
        const geomBuf = rawGeom instanceof Uint8Array ? rawGeom : new Uint8Array(rawGeom);
        const wkb = gpkgGeomToWkb(geomBuf);
        if (!wkb) return [];
        const geometry = wkbToGeoJSON(wkb);
        if (!geometry) return [];
        const properties: Record<string, any> = {};
        attrCols.forEach((col, i) => { properties[col] = valRow[i + 1]; });
        return [{ type: "Feature", geometry, properties }];
      });

      return { name: tableName, features, geometryType: geomType, srid };
    });
  } finally {
    db.close();
  }
}

async function parseGeoJSON(file: File): Promise<ParsedLayer[]> {
  const data = JSON.parse(await file.text());
  const features = data.type === "FeatureCollection" ? (data.features ?? [])
    : data.type === "Feature" ? [data]
    : (() => { throw new Error("Expected a GeoJSON FeatureCollection or Feature"); })();
  return [{ name: file.name.replace(/\.[^.]+$/, ""), features, geometryType: detectGeomType(features), srid: 4326 }];
}

async function parseCSV(file: File): Promise<ParsedLayer[]> {
  const text = await file.text();
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error("CSV has no data rows");
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));

  // Find lat/lon columns by common names
  const latIdx = headers.findIndex((h) => /^(lat|latitude|y)$/i.test(h));
  const lonIdx = headers.findIndex((h) => /^(lon|lng|longitude|x)$/i.test(h));
  if (latIdx === -1 || lonIdx === -1)
    throw new Error("Could not find lat/lon columns. Expected columns named lat/latitude/y and lon/lng/longitude/x.");

  const features = lines.slice(1).flatMap((line): any[] => {
    const cells = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    const lat = parseFloat(cells[latIdx]);
    const lon = parseFloat(cells[lonIdx]);
    if (isNaN(lat) || isNaN(lon)) return [];
    const properties: Record<string, any> = {};
    headers.forEach((h, i) => { if (i !== latIdx && i !== lonIdx) properties[h] = cells[i]; });
    return [{ type: "Feature", geometry: { type: "Point", coordinates: [lon, lat] }, properties }];
  });

  return [{ name: file.name.replace(/\.[^.]+$/, ""), features, geometryType: "Point", srid: 4326 }];
}

async function parseKML(file: File): Promise<ParsedLayer[]> {
  const text = await file.text();
  const { kml } = await import("@tmcw/togeojson");
  const dom = new DOMParser().parseFromString(text, "text/xml");
  const fc = kml(dom);
  const features = (fc as any).features ?? [];
  return [{ name: file.name.replace(/\.[^.]+$/, ""), features, geometryType: detectGeomType(features), srid: 4326 }];
}

async function parseShapefile(file: File): Promise<ParsedLayer[]> {
  const shp = (await import("shpjs")).default;
  const buf = await file.arrayBuffer();
  const result = await shp(buf);
  const collections = Array.isArray(result) ? result : [result];
  return collections.map((fc: any) => ({
    name: fc.fileName ?? file.name.replace(/\.[^.]+$/, ""),
    features: fc.features ?? [],
    geometryType: detectGeomType(fc.features ?? []),
    srid: 4326,
  }));
}

async function parseFile(file: File): Promise<ParsedLayer[]> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "gpkg") return parseGpkg(file);
  if (ext === "geojson" || ext === "json") return parseGeoJSON(file);
  if (ext === "csv") return parseCSV(file);
  if (ext === "kml") return parseKML(file);
  if (ext === "shp" || ext === "zip") return parseShapefile(file);
  throw new Error(`Unsupported file type: .${ext}`);
}

// ─── shared types ─────────────────────────────────────────────────────────────

const VALID_IDENT_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dsn: string;
  onCreated: () => void;
  defaultSchema?: string;
}

// ─── component ────────────────────────────────────────────────────────────────

export function CreateTableDialog({ open, onOpenChange, dsn, onCreated, defaultSchema }: Props) {
  const [activeTab, setActiveTab] = React.useState("arcgis");

  // ── ArcGIS state ──────────────────────────────────────────────────────────
  const [arcUrl, setArcUrl] = React.useState("");
  const [arcPhase, setArcPhase] = React.useState<ArcPhase>("idle");
  const [arcMeta, setArcMeta] = React.useState<ArcGISMeta | null>(null);
  const [arcColMappings, setArcColMappings] = React.useState<ColMapping[]>([]);
  const [arcSchema, setArcSchema] = React.useState(defaultSchema ?? "public");
  const [arcTable, setArcTable] = React.useState("");
  const [arcProgress, setArcProgress] = React.useState({ done: 0, total: 0 });
  const [arcError, setArcError] = React.useState("");
  const abortRef = React.useRef(false);

  // ── File import state ─────────────────────────────────────────────────────
  const [filePhase, setFilePhase] = React.useState<FilePhase>("idle");
  const [fileLayers, setFileLayers] = React.useState<ParsedLayer[]>([]);
  const [fileSelectedIdx, setFileSelectedIdx] = React.useState(0);
  const [fileColMappings, setFileColMappings] = React.useState<ColMapping[]>([]);
  const [fileSchema, setFileSchema] = React.useState(defaultSchema ?? "public");
  const [fileTable, setFileTable] = React.useState("");
  const [fileProgress, setFileProgress] = React.useState({ done: 0, total: 0 });
  const [fileError, setFileError] = React.useState("");

  function reset() {
    setActiveTab("arcgis");
    setArcUrl(""); setArcPhase("idle"); setArcMeta(null); setArcColMappings([]);
    setArcSchema(defaultSchema ?? "public"); setArcTable("");
    setArcProgress({ done: 0, total: 0 }); setArcError("");
    abortRef.current = false;
    setFilePhase("idle"); setFileLayers([]); setFileSelectedIdx(0); setFileColMappings([]);
    setFileSchema(defaultSchema ?? "public"); setFileTable("");
    setFileProgress({ done: 0, total: 0 }); setFileError("");
  }

  React.useEffect(() => { if (!open) reset(); }, [open]);

  // ── ArcGIS functions ──────────────────────────────────────────────────────

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
      setArcMeta({ name: metaJson.name ?? "Layer", geometryType: metaJson.geometryType ?? "", fields, maxRecordCount: metaJson.maxRecordCount ?? 1000, count });
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
    const createRes = await fetch("/api/pg/create-table", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dsn, schema: arcSchema, table: arcTable, geomType: mapGeomType(arcMeta.geometryType), srid: 4326, columns: includedCols.map((c) => ({ name: c.pgName, type: c.type })), timestamps: false }),
    });
    const createData = await createRes.json();
    if (!createRes.ok) { setArcError(createData.error ?? "Failed to create table"); setArcPhase("error"); return; }

    const layerUrl = normalizeLayerUrl(arcUrl);
    let allIds: number[] = [];
    try {
      const j = await arcFetch(`${layerUrl}/query?where=1%3D1&returnIdsOnly=true&f=json`);
      if (j.error) throw new Error(j.error.message ?? "Failed to fetch object IDs");
      allIds = j.objectIds ?? [];
    } catch (e: any) { setArcError(e.message ?? "Failed to fetch object IDs"); setArcPhase("error"); return; }

    setArcProgress({ done: 0, total: allIds.length });
    const batchSize = Math.min(arcMeta.maxRecordCount, 100);
    for (let i = 0; i < allIds.length; i += batchSize) {
      if (abortRef.current) { setArcPhase("cancelled"); return; }
      const batchIds = allIds.slice(i, i + batchSize);
      let features: any[];
      try {
        const geoJson = await arcFetch(`${layerUrl}/query?objectIds=${batchIds.join(",")}&outFields=*&f=geojson`);
        if (geoJson.error) throw new Error(geoJson.error.message ?? "ArcGIS query error");
        features = geoJson.features ?? [];
      } catch (e: any) { setArcError(e.message ?? "Failed to fetch features"); setArcPhase("error"); return; }

      const rows = features.filter((f: any) => f.geometry != null).map((f: any) => {
        const attrs: Record<string, any> = {};
        for (const col of includedCols) {
          const val = f.properties?.[col.origName];
          attrs[col.pgName] = val == null ? null : String(val);
        }
        return { geomJson: JSON.stringify(f.geometry), attrs };
      });
      if (rows.length > 0) {
        const insertRes = await fetch("/api/pg/bulk-insert", {
          method: "POST", headers: { "Content-Type": "application/json" },
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

  async function dropArcTable() {
    await fetch("/api/pg/drop-table", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dsn, schema: arcSchema, table: arcTable }) });
    onCreated(); reset(); setArcPhase("idle");
  }

  const arcPct = arcProgress.total > 0 ? Math.round((arcProgress.done / arcProgress.total) * 100) : null;

  // ── File import functions ─────────────────────────────────────────────────

  function selectFileLayer(layers: ParsedLayer[], idx: number) {
    const layer = layers[idx];
    setFileSelectedIdx(idx);
    setFileColMappings(inferColMappings(layer.features));
    setFileTable(suggestTableName(layer.name));
  }

  async function handleFile(file: File) {
    setFilePhase("parsing");
    setFileError("");
    try {
      const layers = await parseFile(file);
      if (!layers.length) throw new Error("No layers found in file");
      setFileLayers(layers);
      selectFileLayer(layers, 0);
      setFilePhase("ready");
    } catch (e: any) {
      setFileError(e.message ?? "Failed to parse file");
      setFilePhase("error");
    }
  }

  async function startFileImport() {
    const layer = fileLayers[fileSelectedIdx] ?? fileLayers[0];
    if (!layer) return;
    setFilePhase("importing");
    setFileProgress({ done: 0, total: layer.features.length });

    const includedCols = fileColMappings.filter((c) => c.include);
    const createRes = await fetch("/api/pg/create-table", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dsn, schema: fileSchema, table: fileTable, geomType: layer.geometryType, srid: layer.srid, columns: includedCols.map((c) => ({ name: c.pgName, type: c.type })), timestamps: false }),
    });
    const createData = await createRes.json();
    if (!createRes.ok) { setFileError(createData.error ?? "Failed to create table"); setFilePhase("error"); return; }

    const batchSize = 500;
    for (let i = 0; i < layer.features.length; i += batchSize) {
      const batch = layer.features.slice(i, i + batchSize);
      const rows = batch.flatMap((f: any) => {
        if (!f.geometry) return [];
        const attrs: Record<string, any> = {};
        for (const col of includedCols) {
          const val = f.properties?.[col.origName];
          attrs[col.pgName] = val == null ? null : String(val);
        }
        return [{ geomJson: JSON.stringify(f.geometry), attrs }];
      });
      if (rows.length > 0) {
        const insertRes = await fetch("/api/pg/bulk-insert", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dsn, schema: fileSchema, table: fileTable, rows, srid: layer.srid }),
        });
        const insertData = await insertRes.json();
        if (!insertRes.ok) { setFileError(insertData.error ?? "Insert failed"); setFilePhase("error"); return; }
      }
      setFileProgress({ done: i + batch.length, total: layer.features.length });
      await new Promise((r) => setTimeout(r, 0));
    }
    setFilePhase("done");
    onCreated();
  }

  const filePct = fileProgress.total > 0 ? Math.round((fileProgress.done / fileProgress.total) * 100) : null;

  // ─── render ───────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={(v) => {
      if (arcPhase === "importing" || arcPhase === "cancelling" || filePhase === "importing") return;
      onOpenChange(v);
    }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Table</DialogTitle>
          <DialogDescription>
            Import data from an ArcGIS Feature Server or a local file.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-2">
          <TabsList className="w-full">
            <TabsTrigger value="arcgis" className="flex-1">ArcGIS</TabsTrigger>
            <TabsTrigger value="file" className="flex-1">File</TabsTrigger>
          </TabsList>

          {/* ── ArcGIS tab ── */}
          <TabsContent value="arcgis">
            <div className="space-y-4 mt-2">
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
                  <Button variant="outline" onClick={loadArcMeta}
                    disabled={!arcUrl.trim() || arcPhase === "loading-meta" || arcPhase === "importing" || arcPhase === "done"}>
                    {arcPhase === "loading-meta" ? "Loading…" : "Load"}
                  </Button>
                </div>
              </div>

              {arcMeta && arcPhase !== "idle" && arcPhase !== "loading-meta" && (
                <div className="rounded-md border bg-muted/30 p-3 space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Layer</span><span className="font-medium truncate max-w-52">{arcMeta.name}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Geometry</span><span>{arcMeta.geometryType.replace("esriGeometry", "")}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Features</span><span>{arcProgress.total > 0 ? arcProgress.total.toLocaleString() : arcMeta.count > 0 ? arcMeta.count.toLocaleString() : "unknown"}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Fields</span><span>{arcMeta.fields.length}</span></div>
                </div>
              )}

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

              {arcPhase === "ready" && arcColMappings.length > 0 && (
                <ColMappingTable mappings={arcColMappings} onChange={setArcColMappings} />
              )}

              {(arcPhase === "importing" || arcPhase === "cancelling") && (
                <ProgressBar pct={arcPct} label={arcPhase === "cancelling" ? "Cancelling…" : "Importing…"}
                  detail={`${arcProgress.done.toLocaleString()}${arcProgress.total > 0 ? ` / ${arcProgress.total.toLocaleString()}` : ""} features`} />
              )}

              {arcPhase === "cancelled" && (
                <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-3 space-y-2">
                  <p className="text-sm font-medium">Import cancelled</p>
                  <p className="text-xs text-muted-foreground">{arcProgress.done.toLocaleString()} of {arcProgress.total.toLocaleString()} features imported into <span className="font-mono">{arcSchema}.{arcTable}</span>.</p>
                </div>
              )}
              {arcPhase === "done" && <p className="text-sm text-green-600 dark:text-green-400">Import complete — {arcProgress.done.toLocaleString()} features added to <span className="font-mono">{arcSchema}.{arcTable}</span>.</p>}
              {arcPhase === "error" && arcError && <p className="text-sm text-destructive break-words">{arcError}</p>}

              <div className="flex justify-end gap-2">
                {arcPhase === "importing" && (
                  <Button variant="outline" onClick={() => { abortRef.current = true; setArcPhase("cancelling"); }}>Cancel import</Button>
                )}
                {arcPhase === "cancelled" && (
                  <><Button variant="destructive" onClick={dropArcTable}>Drop table</Button>
                  <Button onClick={() => { onCreated(); onOpenChange(false); }}>Keep partial data</Button></>
                )}
                {(arcPhase === "idle" || arcPhase === "loading-meta" || arcPhase === "ready" || arcPhase === "done" || arcPhase === "error") && (
                  <Button variant="outline" onClick={() => onOpenChange(false)}>{arcPhase === "done" ? "Close" : "Cancel"}</Button>
                )}
                {arcPhase === "ready" && (
                  <Button onClick={startArcImport}
                    disabled={!arcTable.trim() || !arcSchema.trim() || arcColMappings.some((c) => c.include && !VALID_IDENT_RE.test(c.pgName)) || arcColMappings.every((c) => !c.include)}>
                    Import
                  </Button>
                )}
                {arcPhase === "error" && <Button variant="outline" onClick={() => setArcPhase("ready")}>Back</Button>}
              </div>
            </div>
          </TabsContent>

          {/* ── File tab ── */}
          <TabsContent value="file">
            <div className="space-y-4 mt-2">
              {(filePhase === "idle" || filePhase === "parsing") && (
                <div className="space-y-1.5">
                  <Label htmlFor="file-input" className="text-xs">Supported formats: .gpkg, .geojson, .json, .kml, .csv, .shp, .zip</Label>
                  <label htmlFor="file-input"
                    className="flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-border bg-muted/20 px-4 py-8 text-sm text-muted-foreground cursor-pointer hover:bg-muted/40 transition-colors">
                    {filePhase === "parsing" ? "Reading file…" : (
                      <><span>Click to select or drag & drop</span>
                      <span className="text-xs font-mono">.gpkg .geojson .json .kml .csv .shp .zip</span></>
                    )}
                    <input id="file-input" type="file"
                      accept=".gpkg,.geojson,.json,.kml,.csv,.shp,.zip"
                      className="sr-only"
                      disabled={filePhase === "parsing"}
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                    />
                  </label>
                </div>
              )}

              {/* Layer picker for multi-layer files (e.g. gpkg) */}
              {filePhase === "ready" && fileLayers.length > 1 && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Layer</Label>
                  <Select value={String(fileSelectedIdx)} onValueChange={(v) => selectFileLayer(fileLayers, Number(v))}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {fileLayers.map((l, i) => (
                        <SelectItem key={i} value={String(i)} className="text-sm">
                          {l.name} ({l.features.length.toLocaleString()} features)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Metadata summary */}
              {filePhase === "ready" && fileLayers[fileSelectedIdx] && (
                <div className="rounded-md border bg-muted/30 p-3 space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Layer</span><span className="font-medium">{fileLayers[fileSelectedIdx].name}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Geometry</span><span>{fileLayers[fileSelectedIdx].geometryType}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">SRID</span><span>{fileLayers[fileSelectedIdx].srid}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Features</span><span>{fileLayers[fileSelectedIdx].features.length.toLocaleString()}</span></div>
                </div>
              )}

              {filePhase === "ready" && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="file-schema" className="text-xs">Schema</Label>
                    <Input id="file-schema" value={fileSchema} onChange={(e) => setFileSchema(e.target.value)} className="h-8 text-sm font-mono" placeholder="public" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="file-table" className="text-xs">Table name</Label>
                    <Input id="file-table" value={fileTable} onChange={(e) => setFileTable(e.target.value)} className="h-8 text-sm font-mono" placeholder="my_layer" />
                  </div>
                </div>
              )}

              {filePhase === "ready" && fileColMappings.length > 0 && (
                <ColMappingTable mappings={fileColMappings} onChange={setFileColMappings} />
              )}

              {filePhase === "importing" && (
                <ProgressBar pct={filePct} label="Importing…"
                  detail={`${fileProgress.done.toLocaleString()} / ${fileProgress.total.toLocaleString()} features`} />
              )}

              {filePhase === "done" && <p className="text-sm text-green-600 dark:text-green-400">Import complete — {fileProgress.done.toLocaleString()} features added to <span className="font-mono">{fileSchema}.{fileTable}</span>.</p>}
              {filePhase === "error" && fileError && <p className="text-sm text-destructive break-words">{fileError}</p>}

              <div className="flex justify-end gap-2">
                {filePhase !== "importing" && (
                  <Button variant="outline" onClick={() => onOpenChange(false)}>{filePhase === "done" ? "Close" : "Cancel"}</Button>
                )}
                {filePhase === "ready" && (() => {
                  const hasInvalid = fileColMappings.some((c) => c.include && !VALID_IDENT_RE.test(c.pgName));
                  const noneIncluded = fileColMappings.length > 0 && fileColMappings.every((c) => !c.include);
                  return (
                    <Button onClick={startFileImport} disabled={!fileTable.trim() || !fileSchema.trim() || hasInvalid || noneIncluded}>
                      Import
                    </Button>
                  );
                })()}
                {filePhase === "error" && <Button variant="outline" onClick={() => setFilePhase("idle")}>Back</Button>}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// ─── shared sub-components ────────────────────────────────────────────────────

function ColMappingTable({ mappings, onChange }: { mappings: ColMapping[]; onChange: (m: ColMapping[]) => void }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] text-muted-foreground">
        A new <span className="font-mono">id SERIAL PRIMARY KEY</span> is auto-generated. Any source ID column is mapped to <span className="font-mono">source_id</span> by default.
      </p>
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground uppercase tracking-wide">Column mapping</Label>
        <div className="flex gap-2">
          <button className="text-[10px] text-muted-foreground hover:text-foreground" onClick={() => onChange(mappings.map((c) => ({ ...c, include: true })))}>All</button>
          <button className="text-[10px] text-muted-foreground hover:text-foreground" onClick={() => onChange(mappings.map((c) => ({ ...c, include: false })))}>None</button>
        </div>
      </div>
      <div className="grid grid-cols-[1rem_1fr_1fr_5rem] gap-2 px-2 text-[10px] text-muted-foreground font-medium uppercase tracking-wide">
        <span /><span>Source</span><span>PostgreSQL name</span><span>Type</span>
      </div>
      <div className="rounded-md border divide-y max-h-48 overflow-y-auto">
        {mappings.map((col, i) => {
          const nameValid = VALID_IDENT_RE.test(col.pgName);
          return (
            <div key={col.origName} className={`grid grid-cols-[1rem_1fr_1fr_5rem] gap-2 items-center px-2 py-1.5 ${!col.include ? "opacity-40" : ""}`}>
              <input type="checkbox" checked={col.include}
                onChange={(e) => onChange(mappings.map((c, j) => j === i ? { ...c, include: e.target.checked } : c))}
                className="h-3 w-3" />
              <span className="text-xs font-mono truncate text-muted-foreground">{col.origName}</span>
              <Input value={col.pgName}
                onChange={(e) => onChange(mappings.map((c, j) => j === i ? { ...c, pgName: e.target.value } : c))}
                disabled={!col.include}
                className={`h-6 text-xs font-mono px-1.5 ${!nameValid && col.include ? "border-destructive focus-visible:ring-destructive" : ""}`} />
              <Select value={col.type} onValueChange={(v) => onChange(mappings.map((c, j) => j === i ? { ...c, type: v as "text" | "numeric" } : c))} disabled={!col.include}>
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
  );
}

function ProgressBar({ pct, label, detail }: { pct: number | null; label: string; detail: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{label}</span><span>{detail}</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className="h-full bg-primary transition-all duration-300" style={{ width: pct != null ? `${pct}%` : "100%" }} />
      </div>
      {pct != null && <p className="text-xs text-center text-muted-foreground">{pct}%</p>}
    </div>
  );
}
