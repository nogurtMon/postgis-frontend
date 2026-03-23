"use client";
import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  dsn: string;
  schemas: string[];
  onImported: () => void;
}

interface ServiceLayer {
  id: number;
  name: string;
  geometryType?: string;
  type?: string;
}

type Stage = "idle" | "fetching-info" | "ready" | "importing" | "done" | "error";

function sanitizeIdent(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, "_").replace(/^([^a-zA-Z_])/, "_$1").slice(0, 63) || "imported";
}

function arcgisGeomTypeToPostGIS(t: string): string {
  const map: Record<string, string> = {
    esriGeometryPoint: "Point",
    esriGeometryMultipoint: "MultiPoint",
    esriGeometryPolyline: "MultiLineString",
    esriGeometryPolygon: "MultiPolygon",
  };
  return map[t] ?? "Geometry";
}

function featureToGeoJson(feature: any): any {
  const { geometry, attributes } = feature;
  if (!geometry) return { type: "Feature", geometry: null, properties: attributes ?? {} };

  let geom: any = null;
  if (geometry.x !== undefined && geometry.y !== undefined) {
    geom = { type: "Point", coordinates: [geometry.x, geometry.y] };
  } else if (geometry.paths) {
    geom = geometry.paths.length === 1
      ? { type: "LineString", coordinates: geometry.paths[0] }
      : { type: "MultiLineString", coordinates: geometry.paths };
  } else if (geometry.rings) {
    geom = geometry.rings.length === 1
      ? { type: "Polygon", coordinates: geometry.rings }
      : { type: "MultiPolygon", coordinates: geometry.rings.map((r: any) => [r]) };
  } else if (geometry.points) {
    geom = { type: "MultiPoint", coordinates: geometry.points };
  }

  return { type: "Feature", geometry: geom, properties: attributes ?? {} };
}

async function proxyFetch(url: string): Promise<any> {
  const res = await fetch("/api/arcgis/proxy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) throw new Error(`Proxy error: ${res.status}`);
  return res.json();
}

function normalizeServiceUrl(raw: string): string {
  let url = raw.trim().replace(/\/$/, "");
  // If it already ends with a layer index (/0, /1 etc), keep it
  // Otherwise ensure it points to FeatureServer or MapServer
  return url;
}

export function FeatureServerDialog({ open, onOpenChange, dsn, schemas, onImported }: Props) {
  const [url, setUrl] = React.useState("");
  const [layers, setLayers] = React.useState<ServiceLayer[]>([]);
  const [selectedLayerId, setSelectedLayerId] = React.useState<number | null>(null);
  const [schema, setSchema] = React.useState(schemas[0] ?? "public");
  const [tableName, setTableName] = React.useState("");
  const [srid, setSrid] = React.useState("4326");
  const [stage, setStage] = React.useState<Stage>("idle");
  const [error, setError] = React.useState("");
  const [progress, setProgress] = React.useState("");

  React.useEffect(() => {
    if (!open) { setUrl(""); setLayers([]); setSelectedLayerId(null); setStage("idle"); setError(""); setProgress(""); setTableName(""); }
  }, [open]);

  React.useEffect(() => {
    if (schemas.length > 0 && !schema) setSchema(schemas[0]);
  }, [schemas]);

  async function fetchServiceInfo() {
    if (!url.trim()) return;
    setStage("fetching-info");
    setError("");
    setLayers([]);

    try {
      const serviceUrl = normalizeServiceUrl(url) + "?f=json";
      const info = await proxyFetch(serviceUrl);

      if (info.error) throw new Error(info.error.message ?? JSON.stringify(info.error));

      // Check if this is a service root (has layers array) or a single layer
      if (info.layers) {
        const featureLayers: ServiceLayer[] = info.layers.filter((l: any) =>
          !l.type || l.type === "Feature Layer" || l.geometryType
        );
        setLayers(featureLayers);
        if (featureLayers.length === 1) {
          setSelectedLayerId(featureLayers[0].id);
          setTableName(sanitizeIdent(featureLayers[0].name));
        }
      } else if (info.type === "Feature Layer" || info.geometryType) {
        // Already pointing at a specific layer
        const layer: ServiceLayer = { id: 0, name: info.name ?? "layer", geometryType: info.geometryType };
        setLayers([layer]);
        setSelectedLayerId(0);
        setTableName(sanitizeIdent(info.name ?? "layer"));
      } else {
        throw new Error("Could not detect a Feature Layer at this URL. Try appending the layer index (e.g. .../FeatureServer/0).");
      }

      setStage("ready");
    } catch (e: any) {
      setError(e.message ?? "Failed to fetch service info");
      setStage("error");
    }
  }

  async function handleImport() {
    if (selectedLayerId === null || !tableName || !schema) return;
    setStage("importing");
    setError("");

    try {
      const baseLayerUrl = normalizeServiceUrl(url).replace(/\/\d+$/, "") + `/${selectedLayerId}`;
      const selectedLayer = layers.find(l => l.id === selectedLayerId);
      const geomType = selectedLayer?.geometryType ? arcgisGeomTypeToPostGIS(selectedLayer.geometryType) : "Geometry";

      // Fetch all features paginated
      const PAGE = 1000;
      let offset = 0;
      let allFeatures: any[] = [];
      let columns: { name: string; type: "text" | "numeric" }[] | null = null;

      setProgress("Fetching features…");

      while (true) {
        const queryUrl = `${baseLayerUrl}/query?where=1%3D1&outFields=*&returnGeometry=true&outSR=4326&resultOffset=${offset}&resultRecordCount=${PAGE}&f=json`;
        const data = await proxyFetch(queryUrl);
        if (data.error) throw new Error(data.error.message ?? JSON.stringify(data.error));

        const features = (data.features ?? []).map(featureToGeoJson);
        allFeatures = allFeatures.concat(features);
        setProgress(`Fetched ${allFeatures.length} features…`);

        if (!data.exceededTransferLimit || features.length === 0) break;
        offset += features.length;
      }

      if (allFeatures.length === 0) throw new Error("No features returned from service.");

      // Detect columns from attributes
      const allKeys = new Set<string>();
      allFeatures.forEach(f => Object.keys(f.properties ?? {}).forEach(k => allKeys.add(k)));
      columns = [...allKeys].map(key => {
        const vals = allFeatures.map(f => f.properties?.[key]).filter(v => v != null && v !== "");
        const allNum = vals.length > 0 && vals.every(v => !isNaN(Number(v)));
        return { name: sanitizeIdent(key), type: (allNum ? "numeric" : "text") as "text" | "numeric" };
      }).filter(c => c.name);

      // Create table
      setProgress("Creating table…");
      const createRes = await fetch("/api/pg/create-table", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dsn, schema, table: tableName, geomType, srid: parseInt(srid), columns, timestamps: false }),
      });
      const createData = await createRes.json();
      if (!createRes.ok) throw new Error(createData.error ?? "Failed to create table");

      // Bulk insert in batches
      const BATCH = 500;
      let inserted = 0;
      for (let i = 0; i < allFeatures.length; i += BATCH) {
        setProgress(`Inserting ${i + 1}–${Math.min(i + BATCH, allFeatures.length)} of ${allFeatures.length}…`);
        const batch = allFeatures.slice(i, i + BATCH);
        const rows = batch.map(f => ({
          geomJson: f.geometry ? JSON.stringify(f.geometry) : null,
          attrs: Object.fromEntries(
            (columns ?? []).map(c => {
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

  const selectedLayer = layers.find(l => l.id === selectedLayerId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Scrape Feature Server</DialogTitle>
          <DialogDescription>
            Pull data from an ArcGIS Feature Service into PostGIS. All features are fetched and inserted as a new table.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* URL input */}
          <div className="space-y-1.5">
            <Label className="text-xs">Feature Service URL</Label>
            <div className="flex gap-2">
              <Input
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="https://…/FeatureServer"
                className="h-8 text-sm font-mono flex-1"
                onKeyDown={e => { if (e.key === "Enter") fetchServiceInfo(); }}
                disabled={stage === "importing"}
              />
              <Button size="sm" className="h-8" onClick={fetchServiceInfo} disabled={!url.trim() || stage === "fetching-info" || stage === "importing"}>
                {stage === "fetching-info" ? "Loading…" : "Connect"}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">Supports ArcGIS FeatureServer and MapServer feature layer endpoints.</p>
          </div>

          {/* Layer picker */}
          {layers.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs">Layer</Label>
              <Select value={String(selectedLayerId ?? "")} onValueChange={v => { const l = layers.find(x => x.id === Number(v)); setSelectedLayerId(Number(v)); if (l) setTableName(sanitizeIdent(l.name)); }}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select a layer…" /></SelectTrigger>
                <SelectContent>
                  {layers.map(l => <SelectItem key={l.id} value={String(l.id)} className="text-sm">{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {selectedLayer?.geometryType && (
                <p className="text-[11px] text-muted-foreground">{arcgisGeomTypeToPostGIS(selectedLayer.geometryType)}</p>
              )}
            </div>
          )}

          {/* Target config */}
          {(stage === "ready" || stage === "importing" || stage === "done" || stage === "error") && selectedLayerId !== null && (
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
                <Label className="text-xs">SRID (output)</Label>
                <Input value={srid} onChange={e => setSrid(e.target.value)} className="h-8 text-sm font-mono" placeholder="4326" />
              </div>
            </div>
          )}

          {error && <p className="text-sm text-destructive break-words">{error}</p>}
          {stage === "importing" && <p className="text-sm text-muted-foreground">{progress}</p>}
          {stage === "done" && <p className="text-sm text-green-600 dark:text-green-400">{progress}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {stage === "done" ? "Close" : "Cancel"}
            </Button>
            {stage !== "done" && (
              <Button
                onClick={handleImport}
                disabled={stage !== "ready" || selectedLayerId === null || !tableName}
              >
                {stage === "importing" ? "Importing…" : "Import to PostGIS"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
