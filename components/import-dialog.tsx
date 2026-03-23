"use client";
import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UploadCloud, FileJson, File } from "lucide-react";
import { gpkgGeomToGeoJson } from "@/lib/wkb";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  dsn: string;
  schemas: string[];
  onImported: () => void;
}

function sanitizeIdent(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, "_").replace(/^([^a-zA-Z_])/, "_$1").slice(0, 63) || "imported";
}

function detectGeomType(features: any[]): string {
  const types = new Set(features.map(f => f.geometry?.type).filter(Boolean));
  if (types.size === 0) return "Geometry";
  if (types.size === 1) {
    const t = [...types][0];
    return t; // Point, LineString, Polygon, etc.
  }
  // Mixed — use base types
  const hasPoint = [...types].some(t => t.includes("Point"));
  const hasLine = [...types].some(t => t.includes("Line"));
  const hasPoly = [...types].some(t => t.includes("Polygon"));
  if (hasPoint && !hasLine && !hasPoly) return "MultiPoint";
  if (!hasPoint && hasLine && !hasPoly) return "MultiLineString";
  if (!hasPoint && !hasLine && hasPoly) return "MultiPolygon";
  return "Geometry";
}

function inferColumns(features: any[]): { name: string; type: "text" | "numeric" }[] {
  const keys = new Set<string>();
  features.forEach(f => Object.keys(f.properties ?? {}).forEach(k => keys.add(k)));
  return [...keys].map(key => {
    const values = features.map(f => f.properties?.[key]).filter(v => v != null && v !== "");
    const allNumeric = values.length > 0 && values.every(v => !isNaN(Number(v)));
    return { name: sanitizeIdent(key), type: (allNumeric ? "numeric" : "text") as "text" | "numeric" };
  }).filter(c => c.name);
}

async function parseGeoJson(text: string): Promise<any[]> {
  const data = JSON.parse(text);
  if (data.type === "FeatureCollection") return data.features;
  if (data.type === "Feature") return [data];
  // Bare geometry
  return [{ type: "Feature", geometry: data, properties: {} }];
}

async function parseShapefile(zipBuffer: ArrayBuffer): Promise<any[]> {
  const JSZip = (await import("jszip")).default;
  const shapefile = await import("shapefile");
  const zip = await JSZip.loadAsync(zipBuffer);
  const files = Object.keys(zip.files);
  const shpName = files.find(f => f.toLowerCase().endsWith(".shp"));
  const dbfName = files.find(f => f.toLowerCase().endsWith(".dbf"));
  if (!shpName) throw new Error("No .shp file found in zip");
  const shpBuf = await zip.files[shpName].async("arraybuffer");
  const dbfBuf = dbfName ? await zip.files[dbfName].async("arraybuffer") : undefined;
  const collection = await shapefile.read(shpBuf, dbfBuf);
  return collection.features;
}

async function parseGpkg(buffer: ArrayBuffer): Promise<{ layerNames: string[]; readLayer: (name: string) => Promise<any[]> }> {
  const initSqlJs = (await import("sql.js")).default;
  const SQL = await initSqlJs({ locateFile: (f: string) => `https://sql.js.org/dist/${f}` });
  const db = new SQL.Database(new Uint8Array(buffer));

  const layerRes = db.exec("SELECT table_name FROM gpkg_contents WHERE data_type = 'features'");
  const layerNames: string[] = layerRes[0]?.values?.map((r: any) => r[0] as string) ?? [];

  async function readLayer(tableName: string): Promise<any[]> {
    // Get geometry column name
    const geomRes = db.exec(`SELECT column_name FROM gpkg_geometry_columns WHERE table_name = '${tableName.replace(/'/g, "''")}'`);
    const geomCol = (geomRes[0]?.values?.[0]?.[0] as string) ?? "geom";

    const rows = db.exec(`SELECT * FROM "${tableName.replace(/"/g, '""')}"`);
    if (!rows[0]) return [];
    const { columns, values } = rows[0];
    const geomIdx = columns.indexOf(geomCol);

    return values.map((row: any[]) => {
      const props: Record<string, any> = {};
      columns.forEach((col: string, i: number) => {
        if (i !== geomIdx) props[col] = row[i];
      });
      let geometry = null;
      if (geomIdx >= 0 && row[geomIdx]) {
        const blob = row[geomIdx] instanceof Uint8Array ? row[geomIdx] : new Uint8Array(row[geomIdx]);
        geometry = gpkgGeomToGeoJson(blob);
      }
      return { type: "Feature", geometry, properties: props };
    }).filter((f: any) => f.geometry);
  }

  return { layerNames, readLayer };
}

type Stage = "idle" | "parsed" | "importing" | "done" | "error";

export function ImportDialog({ open, onOpenChange, dsn, schemas, onImported }: Props) {
  const [file, setFile] = React.useState<File | null>(null);
  const [features, setFeatures] = React.useState<any[]>([]);
  const [gpkgLayers, setGpkgLayers] = React.useState<string[]>([]);
  const [gpkgSelectedLayer, setGpkgSelectedLayer] = React.useState("");
  const [gpkgReadLayer, setGpkgReadLayer] = React.useState<((name: string) => Promise<any[]>) | null>(null);
  const [schema, setSchema] = React.useState(schemas[0] ?? "public");
  const [tableName, setTableName] = React.useState("");
  const [srid, setSrid] = React.useState("4326");
  const [stage, setStage] = React.useState<Stage>("idle");
  const [error, setError] = React.useState("");
  const [progress, setProgress] = React.useState("");
  const [isDragging, setIsDragging] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setFile(null); setFeatures([]); setStage("idle"); setError("");
      setGpkgLayers([]); setGpkgSelectedLayer(""); setGpkgReadLayer(null);
      setTableName(""); setProgress("");
    }
  }, [open]);

  React.useEffect(() => {
    if (schemas.length > 0 && !schema) setSchema(schemas[0]);
  }, [schemas]);

  async function loadFile(f: File) {
    setFile(f);
    setStage("idle");
    setError("");
    setFeatures([]);
    setGpkgLayers([]);
    const name = sanitizeIdent(f.name.replace(/\.[^.]+$/, ""));
    setTableName(name);

    try {
      const ext = f.name.toLowerCase();
      if (ext.endsWith(".geojson") || ext.endsWith(".json")) {
        const text = await f.text();
        const parsed = await parseGeoJson(text);
        setFeatures(parsed);
        setStage("parsed");
      } else if (ext.endsWith(".zip")) {
        const buf = await f.arrayBuffer();
        const parsed = await parseShapefile(buf);
        setFeatures(parsed);
        setStage("parsed");
      } else if (ext.endsWith(".gpkg")) {
        const buf = await f.arrayBuffer();
        const { layerNames, readLayer } = await parseGpkg(buf);
        setGpkgLayers(layerNames);
        setGpkgSelectedLayer(layerNames[0] ?? "");
        setGpkgReadLayer(() => readLayer);
        if (layerNames.length === 1) {
          const parsed = await readLayer(layerNames[0]);
          setFeatures(parsed);
          setStage("parsed");
        } else {
          setStage("parsed");
        }
      } else {
        setError("Unsupported file type. Use .geojson, .json, .zip (shapefile), or .gpkg");
        setStage("error");
      }
    } catch (e: any) {
      setError(e.message ?? "Failed to parse file");
      setStage("error");
    }
  }

  async function handleGpkgLayerChange(layerName: string) {
    setGpkgSelectedLayer(layerName);
    if (!gpkgReadLayer) return;
    try {
      const parsed = await gpkgReadLayer(layerName);
      setFeatures(parsed);
      setTableName(sanitizeIdent(layerName));
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function handleImport() {
    if (!features.length || !tableName || !schema) return;
    setStage("importing");
    setError("");

    const geomType = detectGeomType(features);
    const columns = inferColumns(features);

    try {
      // 1. Create table
      setProgress("Creating table…");
      const createRes = await fetch("/api/pg/create-table", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dsn, schema, table: tableName, geomType, srid: parseInt(srid), columns, timestamps: false }),
      });
      const createData = await createRes.json();
      if (!createRes.ok) throw new Error(createData.error ?? "Failed to create table");

      // 2. Bulk insert in batches of 500
      const BATCH = 500;
      let inserted = 0;
      for (let i = 0; i < features.length; i += BATCH) {
        setProgress(`Inserting features ${i + 1}–${Math.min(i + BATCH, features.length)} of ${features.length}…`);
        const batch = features.slice(i, i + BATCH);
        const rows = batch.map(f => ({
          geomJson: f.geometry ? JSON.stringify(f.geometry) : null,
          attrs: Object.fromEntries(
            columns.map(c => {
              const origKey = Object.keys(f.properties ?? {}).find(k => sanitizeIdent(k) === c.name) ?? c.name;
              return [c.name, f.properties?.[origKey] ?? null];
            })
          ),
        }));
        const insertRes = await fetch("/api/pg/bulk-insert", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dsn, schema, table: tableName, rows, srid }),
        });
        const insertData = await insertRes.json();
        if (!insertRes.ok) throw new Error(insertData.error ?? "Insert failed");
        inserted += insertData.inserted ?? 0;
      }

      setProgress(`Done — ${inserted} features imported.`);
      setStage("done");
      onImported();
    } catch (e: any) {
      setError(e.message ?? "Import failed");
      setStage("error");
    }
  }

  const canImport = stage === "parsed" && features.length > 0 && tableName && schema && (!gpkgLayers.length || gpkgSelectedLayer);
  const isImporting = stage === "importing";
  const geomType = features.length > 0 ? detectGeomType(features) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import Spatial File</DialogTitle>
          <DialogDescription>
            Load features from a file directly into PostGIS. Supported: GeoJSON, Shapefile (.zip), GeoPackage (.gpkg).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Drop zone */}
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${isDragging ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/50"}`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) loadFile(f); }}
            onClick={() => document.getElementById("import-file-input")?.click()}
          >
            <input
              id="import-file-input"
              type="file"
              className="hidden"
              accept=".geojson,.json,.zip,.gpkg"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) loadFile(f); }}
            />
            <UploadCloud className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            {file ? (
              <p className="text-sm font-medium">{file.name}</p>
            ) : (
              <p className="text-sm text-muted-foreground">Drop a file here or click to browse</p>
            )}
            <p className="text-xs text-muted-foreground mt-1">.geojson · .json · .zip (shapefile) · .gpkg</p>
          </div>

          {/* GeoPackage layer picker */}
          {gpkgLayers.length > 1 && (
            <div className="space-y-1.5">
              <Label className="text-xs">Layer</Label>
              <Select value={gpkgSelectedLayer} onValueChange={handleGpkgLayerChange}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {gpkgLayers.map(l => <SelectItem key={l} value={l} className="text-sm">{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Parsed preview */}
          {stage === "parsed" && features.length > 0 && (
            <div className="bg-muted/40 rounded px-3 py-2 text-xs space-y-0.5">
              <div className="flex justify-between"><span className="text-muted-foreground">Features</span><span className="font-mono">{features.length.toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Geometry type</span><span className="font-mono">{geomType}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Attributes</span><span className="font-mono">{inferColumns(features).length}</span></div>
            </div>
          )}

          {/* Target config */}
          {(stage === "parsed" || stage === "importing" || stage === "done") && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Schema</Label>
                <Select value={schema} onValueChange={setSchema}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {schemas.map(s => <SelectItem key={s} value={s} className="text-sm">{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Table name</Label>
                <Input value={tableName} onChange={e => setTableName(sanitizeIdent(e.target.value))} className="h-8 text-sm font-mono" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">SRID</Label>
                <Input value={srid} onChange={e => setSrid(e.target.value)} className="h-8 text-sm font-mono" placeholder="4326" />
              </div>
            </div>
          )}

          {error && <p className="text-sm text-destructive break-words">{error}</p>}
          {isImporting && <p className="text-sm text-muted-foreground">{progress}</p>}
          {stage === "done" && <p className="text-sm text-green-600 dark:text-green-400">{progress}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {stage === "done" ? "Close" : "Cancel"}
            </Button>
            {stage !== "done" && (
              <Button onClick={handleImport} disabled={!canImport || isImporting}>
                {isImporting ? "Importing…" : `Import ${features.length > 0 ? features.length.toLocaleString() + " features" : ""}`}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
