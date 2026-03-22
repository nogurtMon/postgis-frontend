"use client";
import React from "react";
import type { TableRow, MapLayer, LayerFilter, FilterMode, RadiusScale } from "@/lib/types";
import { CreateTableDialog } from "@/components/create-table-dialog";
import { DeleteTableDialog } from "@/components/delete-table-dialog";
import { RenameTableDialog } from "@/components/rename-table-dialog";
import { AttributeTableDialog } from "@/components/attribute-table-dialog";
import { TableInfoDialog } from "@/components/table-info-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  Check, MapPin, TriangleAlert, MoreHorizontal, Maximize2,
} from "lucide-react";

interface Props {
  dsn: string;
  layers: MapLayer[];
  onAddLayer: (table: TableRow) => void;
  onRemoveLayer: (id: string) => void;
  onUpdateLayer: (id: string, patch: Partial<MapLayer>) => void;
  onMoveLayer: (id: string, dir: "up" | "down") => void;
  drawLayerId?: string | null;
  onStartDraw?: (layer: MapLayer) => void;
  onStopDraw?: () => void;
  onZoomToLayer?: (layer: MapLayer) => void;
}

// ─── filter helpers ──────────────────────────────────────────────────────────

const NUMERIC_TYPES = new Set([
  "integer", "bigint", "smallint", "numeric", "real", "double precision", "money",
]);
const DATE_TYPES = new Set([
  "date", "time without time zone", "time with time zone",
  "timestamp without time zone", "timestamp with time zone",
]);

type ColMeta = { dataType: string; values: string[]; truncated: boolean };

function inferMode(dataType: string, truncated: boolean): FilterMode {
  if (dataType === "boolean") return "in";
  if (NUMERIC_TYPES.has(dataType)) return "range";
  if (DATE_TYPES.has(dataType)) return "comparison";
  return truncated ? "text" : "in";
}

function availableModes(dataType: string, truncated: boolean): FilterMode[] {
  if (dataType === "boolean") return ["in", "null_check"];
  if (NUMERIC_TYPES.has(dataType)) return ["range", "comparison", "null_check"];
  if (DATE_TYPES.has(dataType)) return ["comparison", "null_check"];
  // text: show "in" only when cardinality is low enough
  return truncated ? ["text", "comparison", "null_check"] : ["in", "text", "comparison", "null_check"];
}

const MODE_LABELS: Record<FilterMode, string> = {
  in: "list", text: "contains", comparison: "compare", range: "range", null_check: "null",
};

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
  // Per-column meta cache: name → { dataType, values, truncated }
  const [colMeta, setColMeta] = React.useState<Record<string, ColMeta>>({});
  const [loadingCol, setLoadingCol] = React.useState<string | null>(null);

  React.useEffect(() => {
    setDraft(layer.filters);
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

  async function fetchColMeta(col: string): Promise<ColMeta | null> {
    if (colMeta[col]) return colMeta[col];
    setLoadingCol(col);
    try {
      const res = await fetch("/api/pg/column-values", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dsn, schema: layer.table.table_schema, table: layer.table.table_name, column: col }),
      });
      const data = await res.json();
      if (data.error) return null;
      const meta: ColMeta = { dataType: data.dataType, values: data.values, truncated: data.truncated };
      setColMeta((prev) => ({ ...prev, [col]: meta }));
      return meta;
    } catch { return null; }
    finally { setLoadingCol(null); }
  }

  async function handleColumnChange(filterId: string, col: string) {
    if (!col) {
      const newDraft = draft.map((f) => (f.id === filterId ? { ...f, column: "" } : f));
      setDraft(newDraft);
      return;
    }
    const meta = await fetchColMeta(col);
    const mode = meta ? inferMode(meta.dataType, meta.truncated) : "text";
    const newDraft = draft.map((f) =>
      f.id === filterId
        ? { id: f.id, column: col, mode, values: [], textValue: "", operator: "=", value: "", min: "", max: "", isNull: false }
        : f
    );
    setDraft(newDraft);
    onUpdateLayer(layer.id, { filters: newDraft });
  }

  function updateDraft(filterId: string, patch: Partial<LayerFilter>) {
    setDraft((prev) => prev.map((f) => (f.id === filterId ? { ...f, ...patch } : f)));
  }

  // "in" mode auto-applies on every checkbox change
  function handleCheckbox(filterId: string, val: string, checked: boolean) {
    const newDraft = draft.map((f) => {
      if (f.id !== filterId) return f;
      const vals = f.values ?? [];
      return { ...f, values: checked ? [...vals, val] : vals.filter((v) => v !== val) };
    });
    setDraft(newDraft);
    onUpdateLayer(layer.id, { filters: newDraft });
  }

  function addFilter() {
    setDraft((prev) => [...prev, { id: crypto.randomUUID(), column: "", mode: "text" as FilterMode }]);
  }

  function removeFilter(filterId: string) {
    const next = draft.filter((f) => f.id !== filterId);
    setDraft(next);
    onUpdateLayer(layer.id, { filters: next });
  }

  const nonGeomCols = columns.filter((c) => c.dataType !== "USER-DEFINED");

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Filters</p>

      {draft.map((f) => {
        const meta = colMeta[f.column];
        const modes = meta ? availableModes(meta.dataType, meta.truncated) : [];

        return (
          <div key={f.id} className="rounded-md border bg-background p-2 space-y-1.5">
            {/* Column selector + remove */}
            <div className="flex gap-1.5 items-center">
              <Select
                value={f.column}
                onValueChange={(col) => handleColumnChange(f.id, col)}
              >
                <SelectTrigger className="h-7 text-xs flex-1">
                  <SelectValue placeholder="Select column…" />
                </SelectTrigger>
                <SelectContent>
                  {nonGeomCols.map((c) => (
                    <SelectItem key={c.name} value={c.name} className="text-xs font-mono">{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="icon" variant="ghost"
                className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => removeFilter(f.id)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>

            {/* Loading indicator */}
            {loadingCol === f.column && (
              <p className="text-[10px] text-muted-foreground">Loading values…</p>
            )}

            {/* Mode pills */}
            {f.column && modes.length > 1 && (
              <div className="flex gap-1 flex-wrap">
                {modes.map((m) => (
                  <button
                    key={m}
                    onClick={() => updateDraft(f.id, { mode: m })}
                    className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                      f.mode === m
                        ? "bg-primary text-primary-foreground border-primary"
                        : "text-muted-foreground border-border hover:border-foreground"
                    }`}
                  >
                    {MODE_LABELS[m]}
                  </button>
                ))}
              </div>
            )}

            {/* Filter controls */}
            {f.column && f.mode === "in" && meta && (
              <div className="max-h-40 overflow-y-auto space-y-0.5 border rounded p-1.5 bg-muted/30">
                {meta.values.length === 0 && (
                  <p className="text-[10px] text-muted-foreground px-1">No values found</p>
                )}
                {meta.values.map((v) => {
                  const label = meta.dataType === "boolean"
                    ? (v === "true" || v === "t" ? "True" : "False")
                    : v;
                  return (
                    <label key={v} className="flex items-center gap-1.5 cursor-pointer hover:bg-muted rounded px-1 py-0.5">
                      <input
                        type="checkbox"
                        className="h-3 w-3 shrink-0"
                        checked={f.values?.includes(v) ?? false}
                        onChange={(e) => handleCheckbox(f.id, v, e.target.checked)}
                      />
                      <span className="text-xs truncate">{label}</span>
                    </label>
                  );
                })}
                {meta.truncated && (
                  <p className="text-[10px] text-muted-foreground px-1 pt-0.5 border-t">
                    Showing top {meta.values.length} values
                  </p>
                )}
              </div>
            )}

            {f.column && f.mode === "text" && (
              <Input
                placeholder="contains…"
                value={f.textValue ?? ""}
                onChange={(e) => updateDraft(f.id, { textValue: e.target.value })}
                onBlur={() => onUpdateLayer(layer.id, { filters: draft })}
                onKeyDown={(e) => { if (e.key === "Enter") onUpdateLayer(layer.id, { filters: draft }); }}
                className="h-7 text-xs"
              />
            )}

            {f.column && f.mode === "comparison" && (
              <div className="flex gap-1.5">
                <Select
                  value={f.operator ?? "="}
                  onValueChange={(v) => updateDraft(f.id, { operator: v })}
                >
                  <SelectTrigger className="h-7 text-xs w-16 shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["=", "!=", ">", "<", ">=", "<="].map((op) => (
                      <SelectItem key={op} value={op} className="text-xs font-mono">{op}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="value"
                  value={f.value ?? ""}
                  onChange={(e) => updateDraft(f.id, { value: e.target.value })}
                  onBlur={() => onUpdateLayer(layer.id, { filters: draft })}
                  onKeyDown={(e) => { if (e.key === "Enter") onUpdateLayer(layer.id, { filters: draft }); }}
                  className="h-7 text-xs"
                />
              </div>
            )}

            {f.column && f.mode === "range" && (
              <div className="flex items-center gap-1.5">
                <Input
                  placeholder="min"
                  value={f.min ?? ""}
                  onChange={(e) => updateDraft(f.id, { min: e.target.value })}
                  onBlur={() => onUpdateLayer(layer.id, { filters: draft })}
                  onKeyDown={(e) => { if (e.key === "Enter") onUpdateLayer(layer.id, { filters: draft }); }}
                  className="h-7 text-xs"
                />
                <span className="text-[10px] text-muted-foreground shrink-0">–</span>
                <Input
                  placeholder="max"
                  value={f.max ?? ""}
                  onChange={(e) => updateDraft(f.id, { max: e.target.value })}
                  onBlur={() => onUpdateLayer(layer.id, { filters: draft })}
                  onKeyDown={(e) => { if (e.key === "Enter") onUpdateLayer(layer.id, { filters: draft }); }}
                  className="h-7 text-xs"
                />
              </div>
            )}

            {f.column && f.mode === "null_check" && (
              <Select
                value={f.isNull ? "null" : "not_null"}
                onValueChange={(v) => {
                  const newDraft = draft.map((fi) => fi.id === f.id ? { ...fi, isNull: v === "null" } : fi);
                  setDraft(newDraft);
                  onUpdateLayer(layer.id, { filters: newDraft });
                }}
              >
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="not_null" className="text-xs">IS NOT NULL</SelectItem>
                  <SelectItem value="null" className="text-xs">IS NULL</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
        );
      })}

      <div className="flex items-center">
        <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={addFilter}>
          <Plus className="h-3 w-3 mr-1" /> Add filter
        </Button>
      </div>
    </div>
  );
}

export function TableSidebar({
  dsn, layers,
  onAddLayer, onRemoveLayer, onUpdateLayer, onMoveLayer,
  drawLayerId, onStartDraw, onStopDraw, onZoomToLayer,
}: Props) {
  const [tab, setTab] = React.useState("tables");
  const [tables, setTables] = React.useState<TableRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set());
  const [expandedLayer, setExpandedLayer] = React.useState<string | null>(null);
  const [createOpen, setCreateOpen] = React.useState(false);

  const [deleteTarget, setDeleteTarget] = React.useState<{ schema: string; table: string } | null>(null);
  const [renameTarget, setRenameTarget] = React.useState<{ schema: string; table: string } | null>(null);
  const [attrTableTarget, setAttrTableTarget] = React.useState<{ schema: string; table: string } | null>(null);
  const [tableInfoTarget, setTableInfoTarget] = React.useState<{ schema: string; table: string } | null>(null);
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [assigningSrid, setAssigningSrid] = React.useState<string | null>(null);
  const [sridInput, setSridInput] = React.useState("4326");
  const [assignLoading, setAssignLoading] = React.useState(false);
  const [assignError, setAssignError] = React.useState<string | null>(null);

  const [fixingPk, setFixingPk] = React.useState<string | null>(null);
  const [pkLoading, setPkLoading] = React.useState(false);
  const [pkError, setPkError] = React.useState<string | null>(null);

  const [creatingIdx, setCreatingIdx] = React.useState<string | null>(null);
  const [idxLoading, setIdxLoading] = React.useState(false);
  const [idxError, setIdxError] = React.useState<string | null>(null);

  const [castingGeom, setCastingGeom] = React.useState<string | null>(null);
  const [castType, setCastType] = React.useState("LineString");
  const [castSrid, setCastSrid] = React.useState("4326");
  const [castLoading, setCastLoading] = React.useState(false);
  const [castError, setCastError] = React.useState<string | null>(null);

  async function handleAssignSrid(t: TableRow) {
    setAssignLoading(true);
    setAssignError(null);
    try {
      const res = await fetch("/api/pg/assign-srid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dsn,
          schema: t.table_schema,
          table: t.table_name,
          geomCol: t.geom_col,
          srid: sridInput,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAssigningSrid(null);
      setRefreshKey((k) => k + 1);
    } catch (e: any) {
      setAssignError(e.message);
    } finally {
      setAssignLoading(false);
    }
  }

  React.useEffect(() => {
    if (!dsn) {
      setTables([]);
      setError(null);
      return;
    }
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
  }, [dsn, refreshKey]);

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
          {dsn && !loading && (
            <div className="px-3 py-2 border-b">
              <Button size="sm" variant="outline" className="h-7 text-xs w-full" onClick={() => setCreateOpen(true)}>
                <Plus className="h-3 w-3 mr-1" /> New table
              </Button>
            </div>
          )}

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
                  const sridUnknown = !t.srid || t.srid === 0;
                  const isAssigning = assigningSrid === key;
                  const isFixingPk = fixingPk === key;
                  const isCreatingIdx = creatingIdx === key;
                  const isCastingGeom = castingGeom === key;
                  const isGenericGeom = t.geom_type === "GEOMETRY" || t.geom_type === "GEOGRAPHY";
                  return (
                    <div key={key} className="border-b">
                      <div className="flex items-center px-3 py-1.5 gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="max-w-44 text-sm truncate" title={t.table_name}>{t.table_name}</p>
                          <div className="flex flex-row gap-2 items-center">
                            <p className="text-[10px] text-muted-foreground">{t.geom_type}</p>
                            {t.row_count != null && (
                              <p className="text-[10px] text-muted-foreground" title="Estimated row count from PostgreSQL statistics. May be stale for recently modified tables.">
                                ~{t.row_count.toLocaleString()} rows
                              </p>
                            )}
                            {sridUnknown ? (
                              <button
                                className="flex items-center gap-0.5 text-[10px] text-amber-500 hover:text-amber-600"
                                onClick={() => {
                                  setAssigningSrid(isAssigning ? null : key);
                                  setSridInput("4326");
                                  setAssignError(null);
                                }}
                                title="SRID unknown — tiles won't render. Click to assign."
                              >
                                <TriangleAlert className="h-2.5 w-2.5" />
                                SRID unknown
                              </button>
                            ) : (
                              <p className="text-[10px] text-muted-foreground">SRID {t.srid}</p>
                            )}
                          </div>
                          {(t.has_pk === false || t.has_spatial_index === false || isGenericGeom) && (
                            <div className="flex flex-row gap-1.5 items-center mt-0.5">
                              {t.has_pk === false && (
                                <button
                                  className="text-[9px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400 border border-amber-400 dark:border-amber-600 rounded px-1 leading-4 hover:bg-amber-50 dark:hover:bg-amber-950/40"
                                  title="No primary key — click to fix"
                                  onClick={() => { setFixingPk(isFixingPk ? null : key); setPkError(null); }}
                                >
                                  no pk
                                </button>
                              )}
                              {t.has_spatial_index === false && (
                                <button
                                  className="text-[9px] font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400 border border-blue-400 dark:border-blue-600 rounded px-1 leading-4 hover:bg-blue-50 dark:hover:bg-blue-950/40"
                                  title="No spatial index — map rendering will be slow. Click to fix."
                                  onClick={() => { setCreatingIdx(isCreatingIdx ? null : key); setIdxError(null); }}
                                >
                                  no index
                                </button>
                              )}
                              {isGenericGeom && (
                                <button
                                  className="text-[9px] font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-400 border border-violet-400 dark:border-violet-600 rounded px-1 leading-4 hover:bg-violet-50 dark:hover:bg-violet-950/40"
                                  title="Geometry type is unspecified — click to cast the column type in the database"
                                  onClick={() => {
                                    setCastingGeom(isCastingGeom ? null : key);
                                    setCastSrid(String(t.srid ?? 4326));
                                    setCastError(null);
                                  }}
                                >
                                  type unknown
                                </button>
                              )}
                            </div>
                          )}
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
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0 text-muted-foreground">
                              <MoreHorizontal className="h-3 w-3" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setAttrTableTarget({ schema: t.table_schema, table: t.table_name })}>
                              Open attribute table
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setTableInfoTarget({ schema: t.table_schema, table: t.table_name })}>
                              Table info / columns
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setRenameTarget({ schema: t.table_schema, table: t.table_name })}>
                              Rename / Move
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setDeleteTarget({ schema: t.table_schema, table: t.table_name })}
                            >
                              Delete table
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>

                      {isAssigning && (
                        <div className="px-3 pb-2 space-y-1.5 bg-amber-50/50 dark:bg-amber-950/20 border-t">
                          <p className="text-[10px] text-muted-foreground pt-1.5">
                            Assigns an SRID label without reprojecting coordinates.
                            Use this when the data is already in the target CRS.
                          </p>
                          <div className="flex gap-1.5 items-center">
                            <Input
                              value={sridInput}
                              onChange={(e) => setSridInput(e.target.value)}
                              className="h-7 text-xs font-mono w-24"
                              placeholder="4326"
                            />
                            <Button
                              size="sm" className="h-7 text-xs"
                              onClick={() => handleAssignSrid(t)}
                              disabled={assignLoading}
                            >
                              {assignLoading ? "Saving…" : "Assign SRID"}
                            </Button>
                            <Button
                              size="sm" variant="ghost" className="h-7 text-xs"
                              onClick={() => setAssigningSrid(null)}
                            >
                              Cancel
                            </Button>
                          </div>
                          {assignError && (
                            <p className="text-[10px] text-destructive break-words">{assignError}</p>
                          )}
                        </div>
                      )}

                      {isFixingPk && (
                        <div className="px-3 pb-2 space-y-1.5 bg-amber-50/50 dark:bg-amber-950/20 border-t">
                          <p className="text-[10px] text-muted-foreground pt-1.5">
                            Adds an <span className="font-mono">id SERIAL PRIMARY KEY</span> column.
                            Existing rows are assigned sequential IDs automatically.
                          </p>
                          <div className="flex gap-1.5 items-center">
                            <Button
                              size="sm" className="h-7 text-xs"
                              disabled={pkLoading}
                              onClick={async () => {
                                setPkLoading(true);
                                setPkError(null);
                                try {
                                  const res = await fetch("/api/pg/add-primary-key", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ dsn, schema: t.table_schema, table: t.table_name }),
                                  });
                                  const data = await res.json();
                                  if (!res.ok) throw new Error(data.error);
                                  setFixingPk(null);
                                  setRefreshKey((k) => k + 1);
                                } catch (e: any) {
                                  setPkError(e.message);
                                } finally {
                                  setPkLoading(false);
                                }
                              }}
                            >
                              {pkLoading ? "Adding…" : "Add primary key"}
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setFixingPk(null)}>
                              Cancel
                            </Button>
                          </div>
                          {pkError && <p className="text-[10px] text-destructive break-words">{pkError}</p>}
                        </div>
                      )}

                      {isCreatingIdx && (
                        <div className="px-3 pb-2 space-y-1.5 bg-blue-50/50 dark:bg-blue-950/20 border-t">
                          <p className="text-[10px] text-muted-foreground pt-1.5">
                            Creates a <span className="font-mono">GIST</span> index on <span className="font-mono">{t.geom_col}</span> and runs <span className="font-mono">ANALYZE</span>. Required for fast tile rendering on large tables.
                          </p>
                          <div className="flex gap-1.5 items-center">
                            <Button
                              size="sm" className="h-7 text-xs"
                              disabled={idxLoading}
                              onClick={async () => {
                                setIdxLoading(true);
                                setIdxError(null);
                                try {
                                  const res = await fetch("/api/pg/create-spatial-index", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ dsn, schema: t.table_schema, table: t.table_name, geomCol: t.geom_col }),
                                  });
                                  const data = await res.json();
                                  if (!res.ok) throw new Error(data.error);
                                  setCreatingIdx(null);
                                  setRefreshKey((k) => k + 1);
                                } catch (e: any) {
                                  setIdxError(e.message);
                                } finally {
                                  setIdxLoading(false);
                                }
                              }}
                            >
                              {idxLoading ? "Creating…" : "Create spatial index"}
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setCreatingIdx(null)}>
                              Cancel
                            </Button>
                          </div>
                          {idxError && <p className="text-[10px] text-destructive break-words">{idxError}</p>}
                        </div>
                      )}

                      {isCastingGeom && (
                        <div className="px-3 pb-2 space-y-1.5 bg-violet-50/50 dark:bg-violet-950/20 border-t">
                          <p className="text-[10px] text-muted-foreground pt-1.5">
                            Casts the geometry column to a specific type. All existing rows must already be of that geometry type or the operation will fail.
                          </p>
                          <div className="grid grid-cols-2 gap-1.5">
                            <Select value={castType} onValueChange={setCastType}>
                              <SelectTrigger className="h-7 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {["Point","MultiPoint","LineString","MultiLineString","Polygon","MultiPolygon","GeometryCollection"].map((gt) => (
                                  <SelectItem key={gt} value={gt} className="text-xs">{gt}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Input
                              value={castSrid}
                              onChange={(e) => setCastSrid(e.target.value)}
                              className="h-7 text-xs font-mono"
                              placeholder="SRID e.g. 4326"
                            />
                          </div>
                          <div className="flex gap-1.5 items-center">
                            <Button
                              size="sm" className="h-7 text-xs"
                              disabled={castLoading}
                              onClick={async () => {
                                setCastLoading(true);
                                setCastError(null);
                                try {
                                  const res = await fetch("/api/pg/cast-geometry-type", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                      dsn,
                                      schema: t.table_schema,
                                      table: t.table_name,
                                      geomCol: t.geom_col,
                                      newType: castType,
                                      srid: castSrid,
                                    }),
                                  });
                                  const data = await res.json();
                                  if (!res.ok) throw new Error(data.error);
                                  setCastingGeom(null);
                                  setRefreshKey((k) => k + 1);
                                } catch (e: any) {
                                  setCastError(e.message);
                                } finally {
                                  setCastLoading(false);
                                }
                              }}
                            >
                              {castLoading ? "Casting…" : "Cast type"}
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setCastingGeom(null)}>
                              Cancel
                            </Button>
                          </div>
                          {castError && <p className="text-[10px] text-destructive break-words">{castError}</p>}
                        </div>
                      )}
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
            const rowGeomType = (layer.geomTypeOverride ?? layer.table.geom_type ?? "").toLowerCase();
            const rowIsLine = rowGeomType.includes("linestring");

            return (
              <div key={layer.id} className="border-b">
                {/* Layer row */}
                <div className="flex items-center gap-1 px-2 py-1.5">
                  <label className="shrink-0 cursor-pointer" title={rowIsLine ? "Change line color" : "Change fill color"}>
                    <span
                      className="block w-4 h-4 rounded border border-border"
                      style={{ backgroundColor: rowIsLine ? layer.style.strokeColor : layer.style.color }}
                    />
                    <input
                      type="color"
                      className="sr-only"
                      value={rowIsLine ? layer.style.strokeColor : layer.style.color}
                      onChange={(e) => onUpdateLayer(layer.id, {
                        style: rowIsLine
                          ? { ...layer.style, strokeColor: e.target.value }
                          : { ...layer.style, color: e.target.value },
                      })}
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
                  const gt = (layer.geomTypeOverride ?? layer.table.geom_type ?? "").toLowerCase();
                  const isLine = gt.includes("linestring");
                  const isPoly = gt.includes("polygon");
                  const isPoint = !isLine && !isPoly; // points + unknown GEOMETRY/GEOGRAPHY

                  function slider(label: string, key: keyof Pick<typeof layer.style, "opacity" | "strokeOpacity" | "radius" | "lineWidth">, min: number, max: number, step: number, fmt: (v: number) => string) {
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

                        {/* Geometry type override — shown when table column is generic GEOMETRY/GEOGRAPHY */}
                        {(layer.table.geom_type === "GEOMETRY" || layer.table.geom_type === "GEOGRAPHY") && (
                          <div className="grid grid-cols-[3.5rem_1fr] items-center gap-2">
                            <Label className="text-xs text-muted-foreground">Type</Label>
                            <Select
                              value={layer.geomTypeOverride ?? ""}
                              onValueChange={(v) => onUpdateLayer(layer.id, { geomTypeOverride: v || null })}
                            >
                              <SelectTrigger className={`h-7 text-xs ${!layer.geomTypeOverride ? "border-amber-400 dark:border-amber-600" : ""}`}>
                                <SelectValue placeholder="Select type…" />
                              </SelectTrigger>
                              <SelectContent>
                                {["Point","MultiPoint","LineString","MultiLineString","Polygon","MultiPolygon"].map((t) => (
                                  <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}

                        {isLine
                          ? slider("Opacity", "strokeOpacity", 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`)
                          : slider(isPoly ? "Fill" : "Opacity", "opacity", 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`)
                        }

                        {isPoint && !layer.style.radiusScale &&
                          slider("Radius", "radius", 1, 30, 1, (v) => `${v}px`)}

                        {slider(isLine ? "Width" : "Stroke W", "lineWidth", 0, 10, 0.5, (v) => `${v}px`)}

                        {/* Stroke/outline color + opacity — points and polygons only */}
                        {!isLine && (
                          <>
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
                            {slider("Outline %", "strokeOpacity", 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`)}
                          </>
                        )}

                        {/* Dash pattern — line layers only */}
                        {isLine && (
                          <div className="grid grid-cols-[3.5rem_1fr] items-center gap-2">
                            <Label className="text-xs text-muted-foreground">Pattern</Label>
                            <Select
                              value={layer.style.dashArray ? JSON.stringify(layer.style.dashArray) : "solid"}
                              onValueChange={(v) => {
                                const dashArray = v === "solid" ? null : JSON.parse(v) as number[];
                                onUpdateLayer(layer.id, { style: { ...layer.style, dashArray } });
                              }}
                            >
                              <SelectTrigger className="h-7 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="solid" className="text-xs">Solid</SelectItem>
                                <SelectItem value="[8,4]" className="text-xs">Dashed</SelectItem>
                                <SelectItem value="[2,4]" className="text-xs">Dotted</SelectItem>
                                <SelectItem value="[12,4,2,4]" className="text-xs">Dash-dot</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>

                      {isPoint && (
                        <RadiusScaleEditor layer={layer} dsn={dsn} onUpdateLayer={onUpdateLayer} />
                      )}

                      <LayerFilterEditor layer={layer} dsn={dsn} onUpdateLayer={onUpdateLayer} />

                      {onZoomToLayer && (
                        <div className="pt-1">
                          <Button
                            size="sm" variant="outline"
                            className="h-7 text-xs w-full"
                            onClick={() => onZoomToLayer(layer)}
                          >
                            <Maximize2 className="h-3 w-3 mr-1" /> Zoom to extent
                          </Button>
                        </div>
                      )}

                      {isPoint && onStartDraw && (
                        <div className="pt-1">
                          {drawLayerId === layer.id ? (
                            <Button
                              size="sm" variant="secondary"
                              className="h-7 text-xs w-full"
                              onClick={onStopDraw}
                            >
                              <MapPin className="h-3 w-3 mr-1" /> Drawing… (click to cancel)
                            </Button>
                          ) : (
                            <Button
                              size="sm" variant="outline"
                              className="h-7 text-xs w-full"
                              onClick={() => onStartDraw(layer)}
                            >
                              <MapPin className="h-3 w-3 mr-1" /> Add point
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </ScrollArea>
      )}
      <CreateTableDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        dsn={dsn}
        onCreated={() => setRefreshKey((k) => k + 1)}
      />
      {renameTarget && (
        <RenameTableDialog
          open={!!renameTarget}
          onOpenChange={(v) => { if (!v) setRenameTarget(null); }}
          dsn={dsn}
          schema={renameTarget.schema}
          table={renameTarget.table}
          onRenamed={() => {
            setRenameTarget(null);
            setRefreshKey((k) => k + 1);
          }}
        />
      )}
      {tableInfoTarget && (
        <TableInfoDialog
          open={!!tableInfoTarget}
          onOpenChange={(v) => { if (!v) setTableInfoTarget(null); }}
          dsn={dsn}
          schema={tableInfoTarget.schema}
          table={tableInfoTarget.table}
          onChanged={() => setRefreshKey((k) => k + 1)}
        />
      )}
      {attrTableTarget && (
        <AttributeTableDialog
          open={!!attrTableTarget}
          onOpenChange={(v) => { if (!v) setAttrTableTarget(null); }}
          dsn={dsn}
          schema={attrTableTarget.schema}
          table={attrTableTarget.table}
        />
      )}
      {deleteTarget && (
        <DeleteTableDialog
          open={!!deleteTarget}
          onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}
          dsn={dsn}
          schema={deleteTarget.schema}
          table={deleteTarget.table}
          onDeleted={() => {
            setDeleteTarget(null);
            setRefreshKey((k) => k + 1);
          }}
        />
      )}

    </aside>
  );
}
