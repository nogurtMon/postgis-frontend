"use client";
import React from "react";
import type { TableRow, MapLayer, LayerFilter, FilterOperator, RadiusScale } from "@/lib/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ChevronDown, ChevronRight, Eye, EyeOff, ChevronUp, ChevronDown as ChevronDownIcon, X, Plus,
  Check,
} from "lucide-react";

interface Props {
  dsn: string;
  martinCatalog: Record<string, string>;
  layers: MapLayer[];
  onAddLayer: (table: TableRow) => void;
  onRemoveLayer: (id: string) => void;
  onUpdateLayer: (id: string, patch: Partial<MapLayer>) => void;
  onMoveLayer: (id: string, dir: "up" | "down") => void;
}

const OPERATORS: FilterOperator[] = ["=", "!=", ">", "<", ">=", "<=", "LIKE", "IS NULL", "IS NOT NULL"];

function RadiusScaleEditor({
  layer, dsn, onUpdateLayer,
}: {
  layer: MapLayer;
  dsn: string;
  onUpdateLayer: (id: string, patch: Partial<MapLayer>) => void;
}) {
  const [columns, setColumns] = React.useState<string[]>([]);
  const [draft, setDraft] = React.useState<RadiusScale | null>(layer.style.radiusScale);
  const [dirty, setDirty] = React.useState(false);

  React.useEffect(() => {
    setDraft(layer.style.radiusScale);
    setDirty(false);
  }, [layer.id]);

  const NUMERIC_TYPES = new Set([
    "smallint", "integer", "bigint", "decimal", "numeric",
    "real", "double precision", "money",
  ]);

  React.useEffect(() => {
    if (!dsn || !layer.table.table_schema || !layer.table.table_name) return;
    fetch("/api/pg/columns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dsn, schema: layer.table.table_schema, table: layer.table.table_name }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.columns) {
          setColumns(
            data.columns
              .filter((c: { name: string; dataType: string }) => NUMERIC_TYPES.has(c.dataType))
              .map((c: { name: string }) => c.name)
          );
        }
      })
      .catch(() => {});
  }, [dsn, layer.table.table_schema, layer.table.table_name]);

  function updateDraft(patch: Partial<RadiusScale>) {
    setDraft((prev) => prev ? { ...prev, ...patch } : null);
    setDirty(true);
  }

  function enable() {
    const initial: RadiusScale = { column: "", minValue: 0, maxValue: 1000000, minRadius: 3, maxRadius: 20 };
    setDraft(initial);
    setDirty(true);
  }

  function disable() {
    setDraft(null);
    onUpdateLayer(layer.id, { style: { ...layer.style, radiusScale: null } });
    setDirty(false);
  }

  function apply() {
    onUpdateLayer(layer.id, { style: { ...layer.style, radiusScale: draft } });
    setDirty(false);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Radius by Value</p>
        <Button
          size="sm" variant={draft ? "secondary" : "ghost"}
          className="h-5 text-[10px] px-2"
          onClick={draft ? disable : enable}
        >
          {draft ? "On" : "Off"}
        </Button>
      </div>

      {draft && (
        <div className="space-y-2">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Column</Label>
            <Select value={draft.column} onValueChange={(v) => updateDraft({ column: v })}>
              <SelectTrigger className="h-7 text-xs">
                <SelectValue placeholder="Select a column…" />
              </SelectTrigger>
              <SelectContent>
                {columns.map((c) => (
                  <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Domain min</Label>
              <Input
                type="number"
                value={draft.minValue}
                onChange={(e) => updateDraft({ minValue: Number(e.target.value) })}
                className="h-7 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Domain max</Label>
              <Input
                type="number"
                value={draft.maxValue}
                onChange={(e) => updateDraft({ maxValue: Number(e.target.value) })}
                className="h-7 text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Min radius (px)</Label>
              <Input
                type="number"
                value={draft.minRadius}
                onChange={(e) => updateDraft({ minRadius: Number(e.target.value) })}
                className="h-7 text-xs"
                min={1}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Max radius (px)</Label>
              <Input
                type="number"
                value={draft.maxRadius}
                onChange={(e) => updateDraft({ maxRadius: Number(e.target.value) })}
                className="h-7 text-xs"
                min={1}
              />
            </div>
          </div>

          {dirty && (
            <div className="flex justify-end">
              <Button size="sm" className="h-7 text-xs px-3" onClick={apply}>
                Apply
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LayerFilterEditor({
  layer, dsn, onUpdateLayer,
}: {
  layer: MapLayer;
  dsn: string;
  onUpdateLayer: (id: string, patch: Partial<MapLayer>) => void;
}) {
  const [draft, setDraft] = React.useState<LayerFilter[]>(layer.filters);
  const [columns, setColumns] = React.useState<{ name: string; dataType: string }[]>([]);
  const [dirty, setDirty] = React.useState(false);

  React.useEffect(() => {
    setDraft(layer.filters);
    setDirty(false);
  }, [layer.id]);

  React.useEffect(() => {
    if (!dsn || !layer.table.table_schema || !layer.table.table_name) return;
    fetch("/api/pg/columns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dsn, schema: layer.table.table_schema, table: layer.table.table_name }),
    })
      .then((r) => r.json())
      .then((data) => { if (data.columns) setColumns(data.columns); })
      .catch(() => {});
  }, [dsn, layer.table.table_schema, layer.table.table_name]);

  function updateDraft(filterId: string, patch: Partial<LayerFilter>) {
    setDraft((prev) => prev.map((f) => (f.id === filterId ? { ...f, ...patch } : f)));
    setDirty(true);
  }

  function addFilter() {
    setDraft((prev) => [...prev, { id: crypto.randomUUID(), column: "", operator: "=", value: "" }]);
    setDirty(true);
  }

  function removeFilter(filterId: string) {
    setDraft((prev) => prev.filter((f) => f.id !== filterId));
    setDirty(true);
  }

  function apply() {
    onUpdateLayer(layer.id, { filters: draft });
    setDirty(false);
  }

  const listId = `cols-${layer.id}`;

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Filters</p>

      {columns.length > 0 && (
        <datalist id={listId}>
          {columns.map((c) => <option key={c.name} value={c.name} />)}
        </datalist>
      )}

      {draft.map((f) => (
        <div key={f.id} className="space-y-1.5 rounded-md border bg-background p-2">
          <div className="flex gap-1.5 items-center">
            <Input
              list={listId}
              placeholder="column"
              value={f.column}
              onChange={(e) => updateDraft(f.id, { column: e.target.value })}
              className="h-7 text-xs"
            />
            <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => removeFilter(f.id)}>
              <X className="h-3 w-3" />
            </Button>
          </div>
          <div className="flex gap-1.5">
            <Select value={f.operator} onValueChange={(v) => updateDraft(f.id, { operator: v as FilterOperator })}>
              <SelectTrigger className="h-7 text-xs w-32 shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OPERATORS.map((op) => <SelectItem key={op} value={op} className="text-xs">{op}</SelectItem>)}
              </SelectContent>
            </Select>
            {f.operator !== "IS NULL" && f.operator !== "IS NOT NULL" && (
              <Input
                placeholder="value"
                value={f.value}
                onChange={(e) => updateDraft(f.id, { value: e.target.value })}
                className="h-7 text-xs"
              />
            )}
          </div>
        </div>
      ))}

      <div className="flex items-center justify-between">
        <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={addFilter}>
          <Plus className="h-3 w-3 mr-1" /> Add filter
        </Button>
        {dirty && (
          <Button size="sm" className="h-7 text-xs px-3" onClick={apply}>
            Apply
          </Button>
        )}
      </div>
    </div>
  );
}

export function TableSidebar({
  dsn, martinCatalog, layers,
  onAddLayer, onRemoveLayer, onUpdateLayer, onMoveLayer,
}: Props) {
  const [tab, setTab] = React.useState("tables");
  const [tables, setTables] = React.useState<TableRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set());
  const [expandedLayer, setExpandedLayer] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!dsn) return;
    setLoading(true);
    setError(null);
    fetch("/api/pg/tables", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dsn }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setTables(data.tables);
        // Collapse all schemas by default
        const allSchemas = new Set<string>(data.tables.map((t: any) => t.table_schema));
        setCollapsed(allSchemas);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [dsn]);

  // Only show spatial tables — non-spatial tables can't be added to the map
  const spatialTables = React.useMemo(() => tables.filter((t) => t.geom_col), [tables]);

  const schemas = React.useMemo(() => {
    const map = new Map<string, TableRow[]>();
    for (const t of spatialTables) {
      if (!map.has(t.table_schema)) map.set(t.table_schema, []);
      map.get(t.table_schema)!.push(t);
    }
    return map;
  }, [spatialTables]);

  const layerKeys = new Set(layers.map((l) => `${l.table.table_schema}.${l.table.table_name}`));

  function toggleSchema(schema: string) {
    setCollapsed((prev) => {
      if (!prev.has(schema)) {
        // Collapsing this schema
        const next = new Set(prev);
        next.add(schema);
        return next;
      } else {
        // Expanding this schema — collapse all others (accordion)
        const allOthers = new Set([...schemas.keys()].filter((s) => s !== schema));
        return allOthers;
      }
    });
  }

  return (
    <aside className="w-70 shrink-0 border-r flex flex-col overflow-hidden bg-muted/30">
      {/* Tab bar */}
      <div className="flex shrink-0 border-b bg-muted/50">
        <button
          onClick={() => setTab("tables")}
          className={`flex-1 py-2 text-xs font-semibold transition-colors ${tab === "tables" ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"}`}
        >
          Tables
        </button>
        <button
          onClick={() => setTab("layers")}
          className={`flex-1 py-2 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${tab === "layers" ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"}`}
        >
          Layers
          {layers.length > 0 && (
            <Badge variant="secondary" className="h-4 px-1 text-[10px]">{layers.length}</Badge>
          )}
        </button>
      </div>

      {/* TABLES TAB */}
      {tab === "tables" && (
        <ScrollArea className="flex-1 min-h-0">
          {!dsn && <p className="p-4 text-sm text-muted-foreground">No database connected.</p>}
          {loading && <p className="p-4 text-sm text-muted-foreground">Loading…</p>}
          {error && <p className="p-4 text-sm text-destructive break-words">Error: {error}</p>}

          {!loading && !error && [...schemas.entries()].map(([schema, schemaTables]) => {
            const isCollapsed = collapsed.has(schema);
            return (
              <div key={schema}>
                <button
                  onClick={() => toggleSchema(schema)}
                  className="w-full flex items-center justify-between px-3 py-2 bg-muted hover:bg-muted/80 border-b text-left"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    {isCollapsed
                      ? <ChevronRight className="w-3 h-3 shrink-0 text-muted-foreground" />
                      : <ChevronDown className="w-3 h-3 shrink-0 text-muted-foreground" />
                    }
                    <span className="text-xs font-semibold truncate">{schema}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0 ml-1">
                    {schemaTables.length}
                  </span>
                </button>

                {!isCollapsed && schemaTables.map((t) => {
                  const key = `${t.table_schema}.${t.table_name}`;
                  const alreadyAdded = layerKeys.has(key);
                  return (
                    <div key={key} className="flex items-center border-b px-3 py-1.5 gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="max-w-48 text-sm truncate">{t.table_name}</p>
                        <div className="flex flex-row gap-2">
                        <p className="text-[10px] text-muted-foreground">{t.geom_type}</p>
                        <p className="text-[10px] text-muted-foreground">SRID {t.srid}</p>
                        </div>
                      </div>
                      <Button
                          size="sm"
                          variant={alreadyAdded ? "ghost" : "outline"}
                          className="h-6 text-xs px-2 shrink-0"
                          disabled={alreadyAdded}
                          onClick={() => { onAddLayer(t); setTab("layers"); }}
                          title={alreadyAdded ? "Already on map" : "Add to map"}
                        >
                          {alreadyAdded ? <Check className="h-3 w-3"/> : <Plus className="h-3 w-3" />}
                        </Button>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </ScrollArea>
      )}

      {/* LAYERS TAB */}
      {tab === "layers" && (
        <ScrollArea className="flex-1 min-h-0">
          {layers.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">No layers yet. Add tables from the Tables tab.</p>
          )}

          {[...layers].reverse().map((layer, uiIdx) => {
            const isExpanded = expandedLayer === layer.id;
            const isTop = uiIdx === 0;
            const isBottom = uiIdx === layers.length - 1;

            return (
              <div key={layer.id} className="border-b">
                {/* Layer row */}
                <div className="flex items-center gap-1 px-2 py-1.5">
                  <label className="shrink-0 cursor-pointer" title="Change color">
                    <span
                      className="block w-4 h-4 rounded border border-border"
                      style={{ backgroundColor: layer.style.color }}
                    />
                    <input
                      type="color"
                      className="sr-only"
                      value={layer.style.color}
                      onChange={(e) => onUpdateLayer(layer.id, { style: { ...layer.style, color: e.target.value } })}
                    />
                  </label>

                  <button
                    className="flex-1 text-xs max-w-32 truncate text-left font-medium"
                    onClick={() => setExpandedLayer(isExpanded ? null : layer.id)}
                  >
                    {layer.table.table_name}
                    {layer.filters.length > 0 && (
                      <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-[10px]">
                        {layer.filters.length}
                      </Badge>
                    )}
                  </button>

                  <Button
                    size="icon" variant="ghost"
                    className="h-6 w-6 shrink-0 text-muted-foreground"
                    onClick={() => onUpdateLayer(layer.id, { visible: !layer.visible })}
                    title={layer.visible ? "Hide" : "Show"}
                  >
                    {layer.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                  </Button>
                  <Button
                    size="icon" variant="ghost"
                    className="h-6 w-6 shrink-0 text-muted-foreground"
                    disabled={isTop}
                    onClick={() => onMoveLayer(layer.id, "up")}
                    title="Move up"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon" variant="ghost"
                    className="h-6 w-6 shrink-0 text-muted-foreground"
                    disabled={isBottom}
                    onClick={() => onMoveLayer(layer.id, "down")}
                    title="Move down"
                  >
                    <ChevronDownIcon className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon" variant="ghost"
                    className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => onRemoveLayer(layer.id)}
                    title="Remove"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>

                {/* Expanded panel */}
                {isExpanded && (() => {
                  const gt = layer.table.geom_type?.toLowerCase() ?? "";
                  const isLine = gt.includes("linestring");
                  const isPoly = gt.includes("polygon");
                  const isPoint = !isLine && !isPoly; // points + unknown GEOMETRY/GEOGRAPHY

                  function slider(label: string, key: keyof Pick<typeof layer.style, "opacity" | "radius" | "lineWidth">, min: number, max: number, step: number, fmt: (v: number) => string) {
                    return (
                      <div key={key} className="grid grid-cols-[3.5rem_1fr_2.5rem] items-center gap-2">
                        <Label className="text-xs text-muted-foreground">{label}</Label>
                        <Slider min={min} max={max} step={step}
                          value={[layer.style[key]]}
                          onValueChange={([v]) => onUpdateLayer(layer.id, { style: { ...layer.style, [key]: v } })}
                        />
                        <span className="text-xs text-muted-foreground text-right">{fmt(layer.style[key])}</span>
                      </div>
                    );
                  }

                  return (
                    <div className="px-3 pb-3 pt-2 space-y-4 bg-muted/20 border-t">
                      <div className="space-y-3">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Style</p>

                        {slider("Opacity", "opacity", 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`)}

                        {isPoint && !layer.style.radiusScale &&
                          slider("Radius", "radius", 1, 30, 1, (v) => `${v}px`)}

                        {slider(isLine ? "Width" : "Stroke", "lineWidth", 0, 10, 0.5, (v) => `${v}px`)}

                        {/* Stroke/outline color — points and polygons only */}
                        {!isLine && (
                          <div className="grid grid-cols-[3.5rem_1fr] items-center gap-2">
                            <Label className="text-xs text-muted-foreground">Outline</Label>
                            <label className="cursor-pointer flex items-center gap-1.5" title="Change outline color">
                              <span className="block w-4 h-4 rounded border border-border shrink-0"
                                style={{ backgroundColor: layer.style.strokeColor ?? "#ffffff" }} />
                              <span className="text-xs text-muted-foreground">{layer.style.strokeColor ?? "#ffffff"}</span>
                              <input type="color" className="sr-only"
                                value={layer.style.strokeColor ?? "#ffffff"}
                                onChange={(e) => onUpdateLayer(layer.id, { style: { ...layer.style, strokeColor: e.target.value } })}
                              />
                            </label>
                          </div>
                        )}
                      </div>

                      {isPoint && (
                        <RadiusScaleEditor layer={layer} dsn={dsn} onUpdateLayer={onUpdateLayer} />
                      )}

                      <LayerFilterEditor layer={layer} dsn={dsn} onUpdateLayer={onUpdateLayer} />
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </ScrollArea>
      )}
    </aside>
  );
}
