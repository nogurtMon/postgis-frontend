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
import { findCol, rowsToFeatures, LAT_COLS, LON_COLS, WKT_COLS } from "@/lib/geo-parse-utils";
import type { WorkerIn, WorkerOut } from "@/workers/xlsx-worker";

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
  if (esriType === "esriGeometryPolyline") return "MultiLineString";
  if (esriType === "esriGeometryPolygon") return "MultiPolygon";
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

type ArcPhase = "idle" | "loading-meta" | "pick-layer" | "ready" | "importing" | "cancelling" | "cancelled" | "interrupted" | "done" | "error";

// ─── File import helpers ──────────────────────────────────────────────────────

interface ColMapping {
  origName: string;
  pgName: string;
  type: "text" | "numeric";
  include: boolean;
}

interface ParsedLayer {
  name: string;
  features: any[];      // GeoJSON Feature objects (may be a sample for large CSV/XLSX)
  geometryType: string; // PostGIS geometry type string
  srid: number;
  // Streaming fields — set for CSV/XLSX so we don't hold 183k objects in memory
  rawFile?: File;
  latCol?: string | null;
  lonCol?: string | null;
  wktCol?: string | null;
  skipCols?: Set<string>;
  totalRows?: number;
  _attrHeaders?: string[]; // XLSX: header names for col mapping when features[] is empty
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

// ─── CSV / XLSX helpers ───────────────────────────────────────────────────────

// Parse a single CSV line, handling quoted fields
function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') { inQ = false; }
      else { cur += ch; }
    } else {
      if (ch === '"') { inQ = true; }
      else if (ch === ",") { fields.push(cur); cur = ""; }
      else { cur += ch; }
    }
  }
  fields.push(cur);
  return fields;
}

// Read lines from a File using its ReadableStream — yields to browser on every chunk
async function* csvLineStream(file: File): AsyncGenerator<string> {
  const reader = file.stream().pipeThrough(new TextDecoderStream()).getReader();
  let leftover = "";
  while (true) {
    const { done, value } = await reader.read(); // yields to event loop here
    if (done) {
      if (leftover) yield leftover;
      break;
    }
    const chunk = leftover + value;
    const lines = chunk.split(/\r?\n/);
    leftover = lines.pop() ?? "";
    for (const line of lines) yield line;
  }
}

async function parseCSV(file: File): Promise<ParsedLayer[]> {
  // Read only the header line + a few sample rows — never load the full file
  const SAMPLE_ROWS = 20;
  let headers: string[] | null = null;
  const sampleRows: Record<string, string>[] = [];

  for await (const line of csvLineStream(file)) {
    if (!line.trim()) continue;
    if (!headers) { headers = parseCSVLine(line); continue; }
    if (sampleRows.length >= SAMPLE_ROWS) break;
    const vals = parseCSVLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = vals[idx] ?? ""; });
    sampleRows.push(row);
  }

  if (!headers?.length) throw new Error("CSV file is empty");
  if (!sampleRows.length) throw new Error("CSV file has no data rows");

  const latCol = findCol(headers, LAT_COLS);
  const lonCol = findCol(headers, LON_COLS);
  const wktCol = findCol(headers, WKT_COLS);
  if (!wktCol && (!latCol || !lonCol))
    throw new Error(
      "Could not find coordinate columns. Expected latitude/longitude columns (lat, latitude, y / lon, longitude, x) or a WKT column (wkt_geometry, wkt, geom)."
    );

  const skipCols = new Set<string>([
    ...(latCol ? [latCol] : []),
    ...(lonCol ? [lonCol] : []),
    ...(wktCol ? [wktCol] : []),
  ]);

  const sampleFeatures = rowsToFeatures(sampleRows, latCol, lonCol, wktCol, skipCols);

  const name = file.name.replace(/\.[^.]+$/, "");
  return [{
    name,
    features: sampleFeatures,
    geometryType: wktCol ? (sampleFeatures.length > 0 ? detectGeomType(sampleFeatures) : "Geometry") : "Point",
    srid: 4326,
    rawFile: file,
    latCol,
    lonCol,
    wktCol,
    skipCols,
    totalRows: undefined, // will be determined during import
  }];
}

// Send a message to an XLSX worker and get the response via Promise
function xlsxWorkerPreview(buffer: ArrayBuffer): Promise<Extract<WorkerOut, { type: "preview" }>> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../workers/xlsx-worker.ts", import.meta.url));
    worker.onmessage = (e: MessageEvent<WorkerOut>) => {
      worker.terminate();
      if (e.data.type === "error") reject(new Error(e.data.message));
      else if (e.data.type === "preview") resolve(e.data);
    };
    worker.onerror = (e) => { worker.terminate(); reject(new Error(e.message)); };
    worker.postMessage({ type: "preview", buffer } satisfies WorkerIn, [buffer]);
  });
}

async function parseXLSX(file: File): Promise<ParsedLayer[]> {
  // Read file once; transfer to worker (zero-copy)
  const buffer = await file.arrayBuffer();
  // Clone for worker (it will be transferred/consumed); keep original for import
  const workerBuf = buffer.slice(0);
  const result = await xlsxWorkerPreview(workerBuf);

  const layers: ParsedLayer[] = [];
  for (const sheet of result.sheets) {
    const { name, headers, latCol, lonCol, wktCol, totalRows } = sheet;
    if (!wktCol && (!latCol || !lonCol)) continue;
    const skipCols = new Set<string>([
      ...(latCol ? [latCol] : []),
      ...(lonCol ? [lonCol] : []),
      ...(wktCol ? [wktCol] : []),
    ]);
    // sampleFeatures is empty — worker only reads header + 1 row for speed
    // We just need headers for the column mapping UI
    const sampleRow: Record<string, string> = {};
    headers.forEach((h) => { sampleRow[h] = ""; });
    const attrHeaders = headers.filter((h) => !skipCols.has(h));

    layers.push({
      name,
      features: [], // no sample features needed — just need geometryType + col mappings
      geometryType: wktCol ? "Geometry" : "Point",
      srid: 4326,
      rawFile: file,
      latCol,
      lonCol,
      wktCol,
      skipCols,
      totalRows,
      // stash attr headers so inferColMappings has something to work with
      _attrHeaders: attrHeaders,
    } as any);
  }
  if (!layers.length)
    throw new Error(
      "No sheets with coordinate columns found. Expected latitude/longitude columns (lat, latitude / lon, longitude) or a WKT column (wkt_geometry, wkt, geom)."
    );
  return layers;
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
  const text = await file.text();
  const name = file.name.replace(/\.[^.]+$/, "");
  let features: any[];

  // Try standard GeoJSON first
  try {
    const data = JSON.parse(text);
    features = data.type === "FeatureCollection" ? (data.features ?? [])
      : data.type === "Feature" ? [data]
      : (() => { throw new Error("Expected a GeoJSON FeatureCollection or Feature"); })();
  } catch (e: any) {
    // Fall back to GeoJSON Lines (newline-delimited JSON, one feature per line)
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    const parsed = lines.map((l, i) => {
      try { return JSON.parse(l); }
      catch { throw new Error(`Invalid JSON on line ${i + 1}: ${l.slice(0, 60)}`); }
    });
    features = parsed.flatMap((obj) =>
      obj.type === "FeatureCollection" ? (obj.features ?? [])
      : obj.type === "Feature" ? [obj]
      : []
    );
    if (features.length === 0) throw new Error(e.message ?? "Could not parse GeoJSON file");
  }

  return [{ name, features, geometryType: detectGeomType(features), srid: 4326 }];
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
  const shpjs = await import("shpjs");
  const shp = shpjs.default;
  const buf = await file.arrayBuffer();
  const ext = file.name.split(".").pop()?.toLowerCase();
  const baseName = file.name.replace(/\.[^.]+$/, "");

  if (ext === "shp") {
    // Raw .shp — geometry only, no attributes
    const geometries: any[] = (shpjs as any).parseShp(buf);
    const features = geometries.map((g: any) => ({ type: "Feature", geometry: g, properties: {} }));
    return [{ name: baseName, features, geometryType: detectGeomType(features), srid: 4326 }];
  }

  // .zip — full shapefile bundle
  const result = await shp(buf);
  const collections = Array.isArray(result) ? result : [result];
  return collections.map((fc: any) => ({
    name: fc.fileName ?? baseName,
    features: fc.features ?? [],
    geometryType: detectGeomType(fc.features ?? []),
    srid: 4326,
  }));
}

async function parseFile(file: File): Promise<ParsedLayer[]> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "gpkg") return parseGpkg(file);
  if (ext === "geojson") return parseGeoJSON(file);
  if (ext === "kml") return parseKML(file);
  if (ext === "shp" || ext === "zip") return parseShapefile(file);
  if (ext === "csv") return parseCSV(file);
  if (ext === "xlsx" || ext === "xls") return parseXLSX(file);
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
  const [arcServiceLayers, setArcServiceLayers] = React.useState<{ id: number; name: string }[] | null>(null);
  const [arcSelectedLayerId, setArcSelectedLayerId] = React.useState<string>("");
  const abortRef = React.useRef(false);
  const arcStartTimeRef = React.useRef(0);
  const arcNextOffsetRef = React.useRef(0);

  // ── File import state ─────────────────────────────────────────────────────
  const [filePhase, setFilePhase] = React.useState<FilePhase>("idle");
  const [fileIsRawShp, setFileIsRawShp] = React.useState(false);
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
    setArcServiceLayers(null); setArcSelectedLayerId("");
    arcNextOffsetRef.current = 0;
    abortRef.current = false;
    setFilePhase("idle"); setFileLayers([]); setFileSelectedIdx(0); setFileColMappings([]);
    setFileSchema(defaultSchema ?? "public"); setFileTable("");
    setFileProgress({ done: 0, total: 0 }); setFileError("");
  }

  React.useEffect(() => { if (!open) reset(); }, [open]);

  // ── ArcGIS functions ──────────────────────────────────────────────────────

  async function loadArcMeta(urlOverride?: string) {
    const rawUrl = urlOverride ?? arcUrl;
    const layerUrl = normalizeLayerUrl(rawUrl);
    if (!layerUrl) return;
    setArcPhase("loading-meta");
    setArcError("");
    setArcServiceLayers(null);
    try {
      let metaJson = await arcFetch(`${layerUrl}?f=json`);
      if (metaJson.error) throw new Error(metaJson.error.message ?? "ArcGIS metadata error");

      // Detect FeatureServer root: has `layers` list but no per-layer `fields`
      let resolvedUrl = layerUrl;
      if (!metaJson.fields && Array.isArray(metaJson.layers)) {
        const featureLayers = (metaJson.layers as any[]).filter(
          (l: any) => l.type === "Feature Layer" || l.geometryType
        );
        if (featureLayers.length === 0)
          throw new Error("No feature layers found in this service.");
        if (featureLayers.length === 1) {
          // Auto-select the only layer
          resolvedUrl = `${layerUrl}/${featureLayers[0].id}`;
          setArcUrl(resolvedUrl);
          metaJson = await arcFetch(`${resolvedUrl}?f=json`);
          if (metaJson.error) throw new Error(metaJson.error.message ?? "ArcGIS metadata error");
        } else {
          // Multiple layers — let user pick
          setArcServiceLayers(featureLayers.map((l: any) => ({ id: l.id, name: l.name })));
          setArcSelectedLayerId(String(featureLayers[0].id));
          setArcPhase("pick-layer");
          return;
        }
      }

      let count = 0;
      try {
        const countJson = await arcFetch(`${resolvedUrl}/query?where=1%3D1&returnCountOnly=true&f=json`);
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

  async function confirmLayerPick() {
    const newUrl = `${normalizeLayerUrl(arcUrl)}/${arcSelectedLayerId}`;
    setArcUrl(newUrl);
    await loadArcMeta(newUrl);
  }

  async function startArcImport(startOffset = 0) {
    if (!arcMeta) return;
    abortRef.current = false;
    arcStartTimeRef.current = Date.now();
    arcNextOffsetRef.current = startOffset;
    setArcPhase("importing");
    if (startOffset === 0) setArcProgress({ done: 0, total: arcMeta.count });

    const includedCols = arcColMappings.filter((c) => c.include);
    const outFields = includedCols.map((c) => c.origName).join(",") || "*";

    // Only create the table on a fresh import, not a resume
    if (startOffset === 0) {
      const createRes = await fetch("/api/pg/create-table", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dsn, schema: arcSchema, table: arcTable, geomType: mapGeomType(arcMeta.geometryType), srid: 4326, columns: includedCols.map((c) => ({ name: c.pgName, type: c.type })), timestamps: false }),
      });
      const createData = await createRes.json();
      if (!createRes.ok) { setArcError(createData.error ?? "Failed to create table"); setArcPhase("error"); return; }
    }

    // Server-side import: ArcGIS → server → Postgres, streamed NDJSON progress
    const layerUrl = normalizeLayerUrl(arcUrl);
    const importAbort = new AbortController();
    (abortRef as any).cancel = () => importAbort.abort();

    const basePayload = {
      dsn,
      schema: arcSchema,
      table: arcTable,
      layerUrl,
      outFields,
      columns: includedCols.map((c) => ({ origName: c.origName, pgName: c.pgName })),
      batchSize: Math.min(arcMeta.maxRecordCount, arcMeta.geometryType === "esriGeometryPoint" || arcMeta.geometryType === "esriGeometryMultipoint" ? 2000 : 500),
    };

    // Loop over server chunks — each call processes maxBatches fetch-insert cycles,
    // then sends a "checkpoint" so we start a new call rather than timeout.
    let chunkOffset = startOffset;
    while (true) {
      if (importAbort.signal.aborted) { setArcPhase("cancelled"); return; }

      let res: Response;
      try {
        res = await fetch("/api/pg/import-arcgis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...basePayload, startOffset: chunkOffset }),
          signal: importAbort.signal,
        });
      } catch (e: any) {
        if (e.name === "AbortError") { setArcPhase("cancelled"); return; }
        setArcError(e.message ?? "Import failed"); setArcPhase("error"); return;
      }

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setArcError(d.error ?? "Import failed"); setArcPhase("error"); return;
      }

      // Read NDJSON stream for this chunk
      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let chunkDone = false;
      try {
        outer: while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            let msg: any;
            try { msg = JSON.parse(line); } catch { continue; }
            if (msg.type === "progress") {
              setArcProgress({ done: msg.done, total: msg.total });
              if (msg.nextOffset != null) arcNextOffsetRef.current = msg.nextOffset;
            } else if (msg.type === "checkpoint") {
              // Server finished its chunk — continue from nextOffset automatically
              setArcProgress({ done: msg.done, total: msg.total });
              chunkOffset = msg.nextOffset;
              chunkDone = true;
              break outer;
            } else if (msg.type === "done") {
              setArcProgress((p) => ({ ...p, done: msg.done }));
              setArcPhase("done");
              onCreated();
              return;
            } else if (msg.type === "error") {
              setArcError(msg.message ?? "Import failed");
              setArcPhase("error");
              return;
            }
          }
        }
      } catch (e: any) {
        if (e.name === "AbortError") { setArcPhase("cancelled"); return; }
        // Unexpected stream error — show interrupted so user can resume manually
        setArcPhase("interrupted");
        return;
      }

      // Stream closed without checkpoint or done — genuine timeout/disconnect
      if (!chunkDone) { setArcPhase("interrupted"); return; }
    }
  }

  async function dropArcTable() {
    await fetch("/api/pg/drop-table", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dsn, schema: arcSchema, table: arcTable }) });
    onCreated(); reset(); setArcPhase("idle");
  }

  const arcPct = arcProgress.total > 0 ? Math.round((arcProgress.done / arcProgress.total) * 100) : null;

  function arcEta(): string {
    const { done, total } = arcProgress;
    if (done === 0 || total === 0 || arcStartTimeRef.current === 0) return "";
    const elapsed = (Date.now() - arcStartTimeRef.current) / 1000;
    const remaining = (total - done) / (done / elapsed);
    if (remaining < 5) return "";
    if (remaining < 60) return ` · ~${Math.round(remaining)}s left`;
    return ` · ~${Math.ceil(remaining / 60)}m left`;
  }

  // ── File import functions ─────────────────────────────────────────────────

  function selectFileLayer(layers: ParsedLayer[], idx: number) {
    const layer = layers[idx];
    setFileSelectedIdx(idx);
    if (layer._attrHeaders?.length) {
      // XLSX preview: features[] is empty, use header names directly (all text)
      const skip = new Set(["id", "geom", "fid"]);
      setFileColMappings(layer._attrHeaders
        .filter((h) => !skip.has(h.toLowerCase()))
        .map((h) => {
          let pgName = sanitizeFieldName(h);
          if (pgName === "f_id") pgName = "source_id";
          return { origName: h, pgName, type: "text" as const, include: true };
        }));
    } else {
      setFileColMappings(inferColMappings(layer.features));
    }
    setFileTable(suggestTableName(layer.name));
  }

  async function handleFile(file: File) {
    setFilePhase("parsing");
    setFileError("");
    setFileIsRawShp(file.name.toLowerCase().endsWith(".shp"));
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
    setFileProgress({ done: 0, total: layer.totalRows ?? layer.features.length });

    const includedCols = fileColMappings.filter((c) => c.include);
    const createRes = await fetch("/api/pg/create-table", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dsn, schema: fileSchema, table: fileTable, geomType: layer.geometryType, srid: layer.srid, columns: includedCols.map((c) => ({ name: c.pgName, type: c.type })), timestamps: false }),
    });
    const createData = await createRes.json();
    if (!createRes.ok) { setFileError(createData.error ?? "Failed to create table"); setFilePhase("error"); return; }

    // Helper: send one batch to the DB
    async function sendBatch(features: any[]): Promise<string | null> {
      const rows: { geomJson: string; attrs: Record<string, any> }[] = [];
      for (const f of features) {
        if (!f.geometry) continue;
        const attrs: Record<string, any> = {};
        for (const col of includedCols) {
          const val = f.properties?.[col.origName];
          if (val == null) { attrs[col.pgName] = null; continue; }
          attrs[col.pgName] = col.type === "numeric" ? (isNaN(Number(val)) ? null : Number(val)) : String(val);
        }
        rows.push({ geomJson: JSON.stringify(f.geometry), attrs });
      }
      if (!rows.length) return null;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 60_000);
      try {
        const res = await fetch("/api/pg/bulk-insert", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dsn, schema: fileSchema, table: fileTable, rows, srid: layer.srid }),
          signal: ctrl.signal,
        });
        clearTimeout(timer);
        if (!res.ok) {
          const t = await res.text();
          let msg = "Insert failed";
          try { msg = JSON.parse(t).error ?? msg; } catch {}
          return msg;
        }
        return null;
      } catch (err: any) {
        clearTimeout(timer);
        return err.name === "AbortError" ? "Batch timed out after 60 s" : (err.message ?? "Network error");
      }
    }

    if (layer.rawFile) {
      // ── Streaming path: CSV / XLSX (large files — never hold all rows in memory) ──
      const { rawFile, latCol = null, lonCol = null, wktCol = null, skipCols = new Set() } = layer;
      const CHUNK = 500;

      if (rawFile.name.toLowerCase().endsWith(".csv")) {
        // True streaming: file.stream() yields to browser on every OS read — never loads full file
        let headers: string[] | null = null;
        let done = 0;
        let rowBuf: Record<string, string>[] = [];

        const flush = async () => {
          if (!rowBuf.length) return null;
          const features = rowsToFeatures(rowBuf, latCol, lonCol, wktCol, skipCols);
          const err = await sendBatch(features);
          done += rowBuf.length;
          rowBuf = [];
          setFileProgress({ done, total: done }); // total unknown until end
          return err;
        };

        for await (const line of csvLineStream(rawFile)) {
          if (!line.trim()) continue;
          if (!headers) { headers = parseCSVLine(line); continue; }
          const vals = parseCSVLine(line);
          const row: Record<string, string> = {};
          headers!.forEach((h, idx) => { row[h] = vals[idx] ?? ""; });
          rowBuf.push(row);
          if (rowBuf.length >= CHUNK) {
            const err = await flush();
            if (err) { setFileError(err); setFilePhase("error"); return; }
          }
        }
        const err = await flush();
        if (err) { setFileError(err); setFilePhase("error"); return; }
      } else {
        // XLSX: offload all parsing to a Web Worker — main thread stays responsive.
        // Uses ack pattern: main thread sends "next" after each DB insert so the
        // worker never gets ahead of the progress bar.
        const buffer = await rawFile.arrayBuffer();
        let importError: string | null = null;
        await new Promise<void>((resolve, reject) => {
          const worker = new Worker(new URL("../workers/xlsx-worker.ts", import.meta.url));
          worker.onmessage = (e: MessageEvent<WorkerOut>) => {
            const msg = e.data;
            if (msg.type === "error") { worker.terminate(); reject(new Error(msg.message)); return; }
            if (msg.type === "done") { worker.terminate(); resolve(); return; }
            if (msg.type === "chunk") {
              // Process synchronously in the ack callback to maintain back-pressure
              sendBatch(msg.features).then((err) => {
                if (err) { worker.terminate(); reject(new Error(err)); return; }
                setFileProgress({ done: msg.done, total: msg.total });
                // Ack: tell worker to send the next chunk
                worker.postMessage({ type: "next" } satisfies WorkerIn);
              });
            }
          };
          worker.onerror = (e) => { worker.terminate(); reject(new Error(e.message)); };
          worker.postMessage({
            type: "import",
            buffer,
            sheetName: layer.name,
            latCol: latCol ?? null,
            lonCol: lonCol ?? null,
            wktCol: wktCol ?? null,
            skipCols: [...skipCols],
          } satisfies WorkerIn, [buffer]);
        }).catch((err: Error) => { importError = err.message; });
        if (importError) { setFileError(importError); setFilePhase("error"); return; }
      }
    } else {
      // ── Standard path: GeoJSON / KML / GPKG / SHP (all features already in memory) ──
      const MAX_PAYLOAD_BYTES = 800_000;
      let i = 0;
      while (i < layer.features.length) {
        let j = i;
        let payloadBytes = 100;
        const batch: any[] = [];
        while (j < layer.features.length && batch.length < 500) {
          const f = layer.features[j++];
          if (!f.geometry) continue;
          const geomBytes = JSON.stringify(f.geometry).length + 20;
          if (batch.length > 0 && payloadBytes + geomBytes > MAX_PAYLOAD_BYTES) { j--; break; }
          batch.push(f);
          payloadBytes += geomBytes;
        }
        const err = await sendBatch(batch);
        if (err) { setFileError(err); setFilePhase("error"); return; }
        i = j;
        setFileProgress({ done: i, total: layer.features.length });
        await new Promise((r) => setTimeout(r, 0));
      }
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
                  <Button variant="outline" onClick={() => loadArcMeta()}
                    disabled={!arcUrl.trim() || arcPhase === "loading-meta" || arcPhase === "pick-layer" || arcPhase === "importing" || arcPhase === "done"}>
                    {arcPhase === "loading-meta" ? "Loading…" : "Load"}
                  </Button>
                </div>
              </div>

              {arcPhase === "pick-layer" && arcServiceLayers && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">This service has multiple layers — select one to import</Label>
                    <Select value={arcSelectedLayerId} onValueChange={setArcSelectedLayerId}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {arcServiceLayers.map((l) => (
                          <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={confirmLayerPick} disabled={!arcSelectedLayerId}>Load Layer</Button>
                  </div>
                </div>
              )}

              {arcMeta && arcPhase !== "idle" && arcPhase !== "loading-meta" && arcPhase !== "pick-layer" && (
                <div className="rounded-md border bg-muted/30 p-3 space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Layer</span><span className="font-medium truncate max-w-52" title={arcMeta.name}>{arcMeta.name}</span></div>
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

              {arcPhase === "ready" && arcColMappings.length > 10 && (
                <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                  This layer has <span className="font-semibold">{arcColMappings.length} fields</span>. Deselecting unused fields below will reduce payload size and speed up the import.
                </div>
              )}

              {arcPhase === "ready" && arcColMappings.length > 0 && (
                <ColMappingTable mappings={arcColMappings} onChange={setArcColMappings} />
              )}

              {(arcPhase === "importing" || arcPhase === "cancelling") && (
                <>
                  <ProgressBar pct={arcPct} label={arcPhase === "cancelling" ? "Cancelling…" : "Importing…"}
                    detail={`${arcProgress.done.toLocaleString()}${arcProgress.total > 0 ? ` / ${arcProgress.total.toLocaleString()}` : ""} features${arcEta()}`} />
                  <p className="text-xs text-muted-foreground text-center">
                    You can switch tabs — do not close or refresh this browser tab.
                  </p>
                </>
              )}

              {arcPhase === "cancelled" && (
                <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-3 space-y-2">
                  <p className="text-sm font-medium">Import cancelled</p>
                  <p className="text-xs text-muted-foreground">{arcProgress.done.toLocaleString()} of {arcProgress.total.toLocaleString()} features imported into <span className="font-mono">{arcSchema}.{arcTable}</span>.</p>
                </div>
              )}

              {arcPhase === "interrupted" && (
                <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-3 space-y-2">
                  <p className="text-sm font-medium">Connection interrupted</p>
                  <p className="text-xs text-muted-foreground">
                    {arcProgress.done.toLocaleString()} of {arcProgress.total.toLocaleString()} features were imported before the connection was lost (likely a server timeout).
                    You can resume from where it left off.
                  </p>
                </div>
              )}
              {arcPhase === "done" && <p className="text-sm text-green-600 dark:text-green-400">Import complete — {arcProgress.done.toLocaleString()} features added to <span className="font-mono">{arcSchema}.{arcTable}</span>.</p>}
              {arcPhase === "error" && arcError && <p className="text-sm text-destructive break-words">{arcError}</p>}

              <div className="flex justify-end gap-2">
                {arcPhase === "importing" && (
                  <Button variant="outline" onClick={() => { (abortRef as any).cancel?.(); setArcPhase("cancelling"); }}>Cancel import</Button>
                )}
                {arcPhase === "cancelled" && (
                  <><Button variant="destructive" onClick={dropArcTable}>Drop table</Button>
                  <Button onClick={() => { onCreated(); onOpenChange(false); }}>Keep partial data</Button></>
                )}
                {arcPhase === "interrupted" && (
                  <><Button variant="destructive" onClick={dropArcTable}>Drop table</Button>
                  <Button variant="outline" onClick={() => { onCreated(); onOpenChange(false); }}>Keep partial data</Button>
                  <Button onClick={() => startArcImport(arcNextOffsetRef.current)}>Resume</Button></>
                )}
                {(arcPhase === "idle" || arcPhase === "loading-meta" || arcPhase === "ready" || arcPhase === "done" || arcPhase === "error") && (
                  <Button variant="outline" onClick={() => onOpenChange(false)}>{arcPhase === "done" ? "Close" : "Cancel"}</Button>
                )}
                {arcPhase === "ready" && (
                  <Button onClick={() => startArcImport()}
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
                  <Label htmlFor="file-input" className="text-xs">Supported formats: .gpkg, .geojson, .kml, .shp, .zip, .csv, .xlsx</Label>
                  <label htmlFor="file-input"
                    className="flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-border bg-muted/20 px-4 py-8 text-sm text-muted-foreground cursor-pointer hover:bg-muted/40 transition-colors">
                    {filePhase === "parsing" ? "Reading file…" : (
                      <><span>Click to select or drag & drop</span>
                      <span className="text-xs font-mono">.gpkg .geojson .kml .shp .zip .csv .xlsx</span></>
                    )}
                    <input id="file-input" type="file"
                      accept=".gpkg,.geojson,.kml,.shp,.zip,.csv,.xlsx,.xls"
                      className="sr-only"
                      disabled={filePhase === "parsing"}
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                    />
                  </label>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    <span className="font-semibold">CSV / XLSX:</span> must have{" "}
                    <span className="font-mono">latitude</span> + <span className="font-mono">longitude</span> columns (or <span className="font-mono">lat</span>/<span className="font-mono">lon</span>, <span className="font-mono">y</span>/<span className="font-mono">x</span>),
                    or a <span className="font-mono">wkt_geometry</span> column with WKT values. All other columns become attributes.
                  </p>
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
                  <div className="flex justify-between"><span className="text-muted-foreground">Layer</span><span className="font-medium truncate max-w-52" title={fileLayers[fileSelectedIdx].name}>{fileLayers[fileSelectedIdx].name}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Geometry</span><span>{fileLayers[fileSelectedIdx].geometryType}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">SRID</span><span>{fileLayers[fileSelectedIdx].srid}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Features</span><span>{(fileLayers[fileSelectedIdx].totalRows ?? fileLayers[fileSelectedIdx].features.length).toLocaleString()}</span></div>
                </div>
              )}

              {filePhase === "ready" && fileIsRawShp && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                  No attributes — only geometry was found. To include attributes, restart and upload a <span className="font-mono">.zip</span> containing the <span className="font-mono">.shp</span>, <span className="font-mono">.dbf</span>, and <span className="font-mono">.prj</span> files together.
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
                  detail={fileProgress.total > fileProgress.done
                    ? `${fileProgress.done.toLocaleString()} / ${fileProgress.total.toLocaleString()} rows`
                    : `${fileProgress.done.toLocaleString()} rows`} />
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
