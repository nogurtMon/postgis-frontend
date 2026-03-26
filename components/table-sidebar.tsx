"use client";
import React from "react";
import type { TableRow, MapLayer, AttrFilter, AttrOperator, RadiusScale, ValueScale, CategoricalFill, FillColorRule } from "@/lib/types";
import { BASEMAP_OPTIONS } from "@/lib/types";
import { CreateTableDialog } from "@/components/create-table-dialog";
import { DeleteTableDialog } from "@/components/delete-table-dialog";
import { RenameTableDialog } from "@/components/rename-table-dialog";
import { AttributeTableDialog } from "@/components/attribute-table-dialog";
import { TableInfoDialog } from "@/components/table-info-dialog";
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
  ChevronDown, ChevronRight, Eye, EyeOff, X, Plus,
  Check, MapPin, TriangleAlert, Maximize2, Folder, GripVertical, Table2, Globe,
} from "lucide-react";

interface Props {
  dsn: string;
  layers: MapLayer[];
  onAddLayer: (table: TableRow) => void;
  onRemoveLayer: (id: string) => void;
  onUpdateLayer: (id: string, patch: Partial<MapLayer>) => void;
  onReorderLayers: (newOrder: string[]) => void;
  activeLayerId?: string | null;
  onActiveLayerChange?: (id: string | null) => void;
  onZoomToLayer?: (layer: MapLayer) => void;
  onZoomToTable?: (table: TableRow) => void;
  onOpenSettings?: () => void;
  basemap: string;
  onBasemapChange: (key: string) => void;
}

// ─── connection error helper ─────────────────────────────────────────────────
function friendlyConnError(msg: string): { title: string; detail: string } {
  if (/ETIMEDOUT|timeout|timed out/i.test(msg))
    return { title: "Connection timed out", detail: "If your database requires IP allowlisting, make sure this server's IP address is added to the allowlist." };
  if (/ssl.*required|no pg_hba|SSL SYSCALL|SSL connection/i.test(msg))
    return { title: "SSL required", detail: "Add sslmode=require to your connection string and try again." };
  if (/ECONNREFUSED/i.test(msg))
    return { title: "Connection refused", detail: "Check that the host and port are correct and the database server is running." };
  if (/password authentication failed/i.test(msg))
    return { title: "Authentication failed", detail: "The username or password in your connection string is incorrect." };
  if (/database .* does not exist/i.test(msg))
    return { title: "Database not found", detail: "Check that the database name in your connection string is correct." };
  if (/ENOTFOUND|getaddrinfo/i.test(msg))
    return { title: "Host not found", detail: "The hostname in your connection string could not be resolved. Check for typos." };
  return { title: "Connection error", detail: msg };
}

// ─── filter helpers ──────────────────────────────────────────────────────────

const OPERATOR_LABELS: Record<AttrOperator, string> = {
  ilike: "contains", eq: "equals", neq: "not equals",
  gt: ">", lt: "<", gte: "≥", lte: "≤",
  is_null: "is null", is_not_null: "is not null", starts_with: "starts with",
  in: "in", not_in: "not in",
};
const ALL_OPERATORS = Object.keys(OPERATOR_LABELS) as AttrOperator[];
const NULL_OPERATORS: AttrOperator[] = ["is_null", "is_not_null"];

const NUMERIC_TYPES_SET = new Set([
  "smallint", "integer", "bigint", "decimal", "numeric", "real", "double precision", "money",
]);

function RadiusScaleEditor({
  layer, dsn, onUpdateLayer, onRemove,
}: {
  layer: MapLayer;
  dsn: string;
  onUpdateLayer: (id: string, patch: Partial<MapLayer>) => void;
  onRemove: () => void;
}) {
  const [columns, setColumns] = React.useState<string[]>([]);
  const DEFAULT: RadiusScale = { column: "", minValue: 0, maxValue: 1000000, minRadius: 3, maxRadius: 20 };
  const [draft, setDraft] = React.useState<RadiusScale>(layer.style.radiusScale ?? DEFAULT);
  const [dirty, setDirty] = React.useState(!layer.style.radiusScale);

  React.useEffect(() => {
    setDraft(layer.style.radiusScale ?? DEFAULT);
    setDirty(!layer.style.radiusScale);
  }, [layer.id]);

  React.useEffect(() => {
    if (!dsn || !layer.table.table_schema || !layer.table.table_name) return;
    fetch("/api/pg/columns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dsn, schema: layer.table.table_schema, table: layer.table.table_name }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.columns)
          setColumns(data.columns.filter((c: any) => NUMERIC_TYPES_SET.has(c.dataType)).map((c: any) => c.name));
      })
      .catch(() => {});
  }, [dsn, layer.table.table_schema, layer.table.table_name]);

  function updateDraft(patch: Partial<RadiusScale>) {
    setDraft((prev) => ({ ...prev, ...patch }));
    setDirty(true);
  }

  function apply() {
    onUpdateLayer(layer.id, { style: { ...layer.style, radiusScale: draft } });
    setDirty(false);
  }

  return (
    <div className="space-y-2.5">
      <div className="space-y-1">
        <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">Column</Label>
        <Select value={draft.column} onValueChange={(v) => updateDraft({ column: v })}>
          <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Select column…" /></SelectTrigger>
          <SelectContent>
            {columns.map((c) => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">Min value</Label>
          <Input type="number" value={draft.minValue} onChange={(e) => updateDraft({ minValue: Number(e.target.value) })} className="h-7 text-xs" />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">Max value</Label>
          <Input type="number" value={draft.maxValue} onChange={(e) => updateDraft({ maxValue: Number(e.target.value) })} className="h-7 text-xs" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">Min radius (px)</Label>
          <Input type="number" value={draft.minRadius} min={1} onChange={(e) => updateDraft({ minRadius: Number(e.target.value) })} className="h-7 text-xs" />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">Max radius (px)</Label>
          <Input type="number" value={draft.maxRadius} min={1} onChange={(e) => updateDraft({ maxRadius: Number(e.target.value) })} className="h-7 text-xs" />
        </div>
      </div>
      <div className="flex items-center justify-between pt-1 border-t">
        <button onClick={onRemove} className="text-[11px] text-destructive hover:underline">Remove</button>
        <Button size="sm" className="h-7 text-xs px-3" onClick={apply} disabled={!dirty}>Apply</Button>
      </div>
    </div>
  );
}

function ValueScaleEditor({
  layer, dsn, onUpdateLayer, styleKey, outputLabel, defaultMinOut, defaultMaxOut, minOut, maxOut, outStep, onRemove,
}: {
  layer: MapLayer; dsn: string;
  onUpdateLayer: (id: string, patch: Partial<MapLayer>) => void;
  styleKey: "lineWidthScale" | "opacityScale" | "strokeOpacityScale";
  outputLabel: string; defaultMinOut: number; defaultMaxOut: number;
  minOut: number; maxOut: number; outStep: number;
  onRemove: () => void;
}) {
  const [columns, setColumns] = React.useState<string[]>([]);
  const DEFAULT: ValueScale = { column: "", minValue: 0, maxValue: 1000, minOutput: defaultMinOut, maxOutput: defaultMaxOut };
  const scale = (layer.style[styleKey] ?? null) as ValueScale | null;
  const [draft, setDraft] = React.useState<ValueScale>(scale ?? DEFAULT);
  const [dirty, setDirty] = React.useState(!scale);

  React.useEffect(() => {
    const s = (layer.style[styleKey] ?? null) as ValueScale | null;
    setDraft(s ?? DEFAULT);
    setDirty(!s);
  }, [layer.id]);

  React.useEffect(() => {
    if (!dsn || !layer.table.table_schema || !layer.table.table_name) return;
    fetch("/api/pg/columns", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dsn, schema: layer.table.table_schema, table: layer.table.table_name }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.columns) setColumns(data.columns.filter((c: any) => NUMERIC_TYPES_SET.has(c.dataType)).map((c: any) => c.name));
      })
      .catch(() => {});
  }, [dsn, layer.table.table_schema, layer.table.table_name]);

  function updateDraft(patch: Partial<ValueScale>) { setDraft((prev) => ({ ...prev, ...patch })); setDirty(true); }
  function apply() { onUpdateLayer(layer.id, { style: { ...layer.style, [styleKey]: draft } }); setDirty(false); }

  return (
    <div className="space-y-2.5">
      <div className="space-y-1">
        <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">Column</Label>
        <Select value={draft.column} onValueChange={(v) => updateDraft({ column: v })}>
          <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Select column…" /></SelectTrigger>
          <SelectContent>
            {columns.map((c) => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">Min value</Label>
          <Input type="number" value={draft.minValue} onChange={(e) => updateDraft({ minValue: Number(e.target.value) })} className="h-7 text-xs" />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">Max value</Label>
          <Input type="number" value={draft.maxValue} onChange={(e) => updateDraft({ maxValue: Number(e.target.value) })} className="h-7 text-xs" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">Min {outputLabel}</Label>
          <Input type="number" value={draft.minOutput} step={outStep} min={minOut} max={maxOut} onChange={(e) => updateDraft({ minOutput: Number(e.target.value) })} className="h-7 text-xs" />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">Max {outputLabel}</Label>
          <Input type="number" value={draft.maxOutput} step={outStep} min={minOut} max={maxOut} onChange={(e) => updateDraft({ maxOutput: Number(e.target.value) })} className="h-7 text-xs" />
        </div>
      </div>
      <div className="flex items-center justify-between pt-1 border-t">
        <button onClick={onRemove} className="text-[11px] text-destructive hover:underline">Remove</button>
        <Button size="sm" className="h-7 text-xs px-3" onClick={apply} disabled={!dirty}>Apply</Button>
      </div>
    </div>
  );
}

const CAT_COLORS = [
  "#e41a1c","#377eb8","#4daf4a","#984ea3","#ff7f00",
  "#a65628","#f781bf","#ffed6f","#66c2a5","#fc8d62",
  "#8da0cb","#e78ac3",
];

function CategoricalColorEditor({
  layer, dsn, onUpdateLayer, styleKey, onRemove,
}: {
  layer: MapLayer;
  dsn: string;
  onUpdateLayer: (id: string, patch: Partial<MapLayer>) => void;
  styleKey: "categoricalFill" | "categoricalStroke";
  onRemove: () => void;
}) {
  const [columns, setColumns] = React.useState<string[]>([]);
  const DEFAULT: CategoricalFill = { column: "", rules: [], defaultColor: "#aaaaaa" };
  const existing = (layer.style[styleKey] ?? null) as CategoricalFill | null;
  const [draft, setDraft] = React.useState<CategoricalFill>(existing ?? DEFAULT);
  const [dirty, setDirty] = React.useState(!existing);
  const [classifying, setClassifying] = React.useState(false);

  React.useEffect(() => {
    const e = (layer.style[styleKey] ?? null) as CategoricalFill | null;
    setDraft(e ?? DEFAULT);
    setDirty(!e);
  }, [layer.id, styleKey]);

  React.useEffect(() => {
    if (!dsn || !layer.table.table_schema || !layer.table.table_name) return;
    fetch("/api/pg/columns", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dsn, schema: layer.table.table_schema, table: layer.table.table_name }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.columns) setColumns(data.columns.filter((c: any) => !c.isGeom).map((c: any) => c.name));
      })
      .catch(() => {});
  }, [dsn, layer.table.table_schema, layer.table.table_name]);

  function updateDraft(patch: Partial<CategoricalFill>) {
    setDraft((prev) => ({ ...prev, ...patch }));
    setDirty(true);
  }

  async function classify() {
    if (!draft.column) return;
    setClassifying(true);
    try {
      const res = await fetch("/api/pg/column-values", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dsn, schema: layer.table.table_schema, table: layer.table.table_name, column: draft.column }),
      });
      const data = await res.json();
      if (data.values) {
        const rules: FillColorRule[] = (data.values as string[]).map((v, i) => ({
          value: v,
          color: CAT_COLORS[i % CAT_COLORS.length],
        }));
        setDraft((prev) => ({ ...prev, rules }));
        setDirty(true);
      }
    } catch {}
    setClassifying(false);
  }

  function apply() {
    onUpdateLayer(layer.id, { style: { ...layer.style, [styleKey]: draft } });
    setDirty(false);
  }

  return (
    <div className="space-y-2.5">
      <div className="space-y-1">
        <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">Column</Label>
        <Select value={draft.column} onValueChange={(v) => updateDraft({ column: v, rules: [] })}>
          <SelectTrigger className="h-7 text-xs w-full"><SelectValue placeholder="Select column…" /></SelectTrigger>
          <SelectContent>
            {columns.map((c) => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" className="h-7 text-xs w-full mt-1.5"
          onClick={classify} disabled={!draft.column || classifying}>
          {classifying ? "Classifying…" : "Classify from values"}
        </Button>
      </div>
      <div className="space-y-1 max-h-44 overflow-y-auto pr-0.5">
        {draft.rules.map((rule, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <label className="cursor-pointer shrink-0">
              <span className="block w-5 h-5 rounded border border-border" style={{ backgroundColor: rule.color }} />
              <input type="color" className="sr-only" value={rule.color}
                onChange={(e) => {
                  const next = draft.rules.map((r, j) => j === i ? { ...r, color: e.target.value } : r);
                  updateDraft({ rules: next });
                }} />
            </label>
            <Input
              value={rule.value}
              onChange={(e) => {
                const next = draft.rules.map((r, j) => j === i ? { ...r, value: e.target.value } : r);
                updateDraft({ rules: next });
              }}
              className="h-6 text-[11px] font-mono flex-1 min-w-0"
            />
            <button className="text-muted-foreground hover:text-destructive shrink-0"
              onClick={() => updateDraft({ rules: draft.rules.filter((_, j) => j !== i) })}>
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        <button
          className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 pt-0.5"
          onClick={() => updateDraft({ rules: [...draft.rules, { value: "", color: CAT_COLORS[draft.rules.length % CAT_COLORS.length] }] })}
        >
          <Plus className="h-3 w-3" /> Add rule
        </button>
      </div>
      <div className="space-y-1">
        <Label className="text-[10px] text-muted-foreground">Default color</Label>
        <label className="cursor-pointer flex items-center gap-2">
          <span className="block w-5 h-5 rounded border border-border shrink-0" style={{ backgroundColor: draft.defaultColor }} />
          <span className="text-xs text-muted-foreground">{draft.defaultColor}</span>
          <input type="color" className="sr-only" value={draft.defaultColor}
            onChange={(e) => updateDraft({ defaultColor: e.target.value })} />
        </label>
      </div>
      <div className="flex items-center justify-between pt-1 border-t">
        <button onClick={onRemove} className="text-[11px] text-destructive hover:underline">Remove</button>
        <Button size="sm" className="h-7 text-xs px-3" onClick={apply} disabled={!dirty || !draft.column}>Apply</Button>
      </div>
    </div>
  );
}

function InValuePicker({
  dsn, schema, table, column, value, onChange,
}: {
  dsn: string; schema: string; table: string; column: string;
  value: string; onChange: (v: string) => void;
}) {
  const [distinctValues, setDistinctValues] = React.useState<string[] | null>(null);
  const [truncated, setTruncated] = React.useState(false);

  React.useEffect(() => {
    if (!dsn || !schema || !table || !column) return;
    setDistinctValues(null);
    fetch("/api/pg/column-values", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dsn, schema, table, column }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.values) { setDistinctValues(data.values); setTruncated(!!data.truncated); }
      })
      .catch(() => {});
  }, [dsn, schema, table, column]);

  const selected = React.useMemo(() => new Set(value.split(",").map((v) => v.trim()).filter(Boolean)), [value]);

  function toggle(v: string) {
    const next = new Set(selected);
    if (next.has(v)) next.delete(v); else next.add(v);
    onChange([...next].join(","));
  }

  if (truncated || distinctValues === null && !truncated) {
    return (
      <Input
        value={value}
        placeholder={distinctValues === null ? "Loading…" : "comma-separated values"}
        onChange={(e) => onChange(e.target.value)}
        className="h-6 text-[11px] flex-1 min-w-0 max-w-30"
      />
    );
  }

  return (
    <div className="w-full min-w-0 border rounded max-h-28 overflow-x-hidden overflow-y-auto bg-background">
      {distinctValues!.map((v) => (
        <label key={v} className="flex items-center gap-1.5 px-2 py-0.5 hover:bg-muted/40 cursor-pointer min-w-0 max-w-50">
          <input type="checkbox" checked={selected.has(v)} onChange={() => toggle(v)} className="h-3 w-3 shrink-0" />
          <span className="text-[11px] truncate font-mono min-w-0 flex-1" title={v}>{v}</span>
        </label>
      ))}
      {distinctValues!.length === 0 && (
        <p className="text-[10px] text-muted-foreground px-2 py-1">No values</p>
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
  const [columns, setColumns] = React.useState<{ name: string; dataType: string; isGeom: boolean }[]>([]);
  // Local draft values for text inputs — applied on blur or Enter
  const [drafts, setDrafts] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(layer.filters.map((f) => [f.id, f.value]))
  );

  // Sync drafts when filters are added/removed
  React.useEffect(() => {
    setDrafts((prev) => {
      const next: Record<string, string> = {};
      layer.filters.forEach((f) => { next[f.id] = f.id in prev ? prev[f.id] : f.value; });
      return next;
    });
  }, [layer.filters.map((f) => f.id).join(",")]);

  React.useEffect(() => {
    if (!dsn || !layer.table.table_schema || !layer.table.table_name) return;
    fetch("/api/pg/columns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dsn, schema: layer.table.table_schema, table: layer.table.table_name }),
    })
      .then((r) => r.json())
      .then((data) => { if (data.columns) setColumns(data.columns); else console.error("[columns]", data.error); })
      .catch((e) => console.error("[columns fetch]", e));
  }, [dsn, layer.table.table_schema, layer.table.table_name]);

  const nonGeomCols = columns.filter((c) => !c.isGeom);

  function apply(next: AttrFilter[]) {
    onUpdateLayer(layer.id, { filters: next });
  }

  function applyDraft(id: string) {
    apply(layer.filters.map((fi) => fi.id === id ? { ...fi, value: drafts[id] ?? "" } : fi));
  }

  function addFilter() {
    const newFilter = { id: crypto.randomUUID(), column: nonGeomCols[0]?.name ?? "", operator: "ilike" as AttrOperator, value: "" };
    apply([...layer.filters, newFilter]);
  }

  function removeFilter(id: string) {
    apply(layer.filters.filter((f) => f.id !== id));
  }

  const IN_OPERATORS: AttrOperator[] = ["in", "not_in"];

  return (
    <div className="space-y-1.5 min-w-0">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Filters</p>

      {layer.filters.map((f, i) => {
        const isPending = !IN_OPERATORS.includes(f.operator) && !NULL_OPERATORS.includes(f.operator) && (drafts[f.id] ?? "") !== f.value;
        return (
          <div key={f.id} className="space-y-1 pb-1.5 border-b last:border-0">
            {/* Row 1: if/and + column + remove */}
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground w-6 shrink-0 text-right">{i === 0 ? "if" : "and"}</span>
              <Select value={f.column} onValueChange={(col) => { apply(layer.filters.map((fi) => fi.id === f.id ? { ...fi, column: col, value: "" } : fi)); setDrafts((p) => ({ ...p, [f.id]: "" })); }}>
                <SelectTrigger className="h-6 text-[11px] flex-1 min-w-0 font-mono overflow-hidden [&>span]:truncate">
                  <SelectValue placeholder="column" />
                </SelectTrigger>
                <SelectContent className="max-w-[var(--radix-select-trigger-width)]">
                  {nonGeomCols.map((c) => (
                    <SelectItem key={c.name} value={c.name} className="text-xs font-mono [&>span]:truncate">{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <button onClick={() => removeFilter(f.id)} className="shrink-0 text-muted-foreground hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </div>
            {/* Row 2: operator (full width) */}
            <div className="pl-7">
              <Select value={f.operator} onValueChange={(op) => { apply(layer.filters.map((fi) => fi.id === f.id ? { ...fi, operator: op as AttrOperator, value: "" } : fi)); setDrafts((p) => ({ ...p, [f.id]: "" })); }}>
                <SelectTrigger className="h-6 text-[11px] w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-w-[var(--radix-select-trigger-width)]">
                  {ALL_OPERATORS.map((op) => (
                    <SelectItem key={op} value={op} className="text-xs">{OPERATOR_LABELS[op]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Row 3: value */}
            {IN_OPERATORS.includes(f.operator) ? (
              <div className="pl-7">
                <InValuePicker
                  dsn={dsn} schema={layer.table.table_schema} table={layer.table.table_name} column={f.column}
                  value={f.value}
                  onChange={(v) => apply(layer.filters.map((fi) => fi.id === f.id ? { ...fi, value: v } : fi))}
                />
              </div>
            ) : !NULL_OPERATORS.includes(f.operator) && (
              <div className="pl-7 space-y-0.5">
                <Input
                  value={drafts[f.id] ?? ""}
                  placeholder="value"
                  onChange={(e) => setDrafts((p) => ({ ...p, [f.id]: e.target.value }))}
                  onBlur={() => applyDraft(f.id)}
                  onKeyDown={(e) => { if (e.key === "Enter") applyDraft(f.id); }}
                  className={`h-6 text-[11px] w-full ${isPending ? "border-amber-400 dark:border-amber-600" : ""}`}
                />
                {isPending && <p className="text-[10px] text-muted-foreground">Press Enter to apply</p>}
              </div>
            )}
          </div>
        );
      })}

      <Button size="sm" variant="ghost" className="h-6 text-xs px-2 w-full justify-start" onClick={addFilter}>
        <Plus className="h-3 w-3 mr-1" /> Add filter
      </Button>
    </div>
  );
}

export function TableSidebar({
  dsn, layers,
  onAddLayer, onRemoveLayer, onUpdateLayer, onReorderLayers,
  activeLayerId, onActiveLayerChange, onZoomToLayer, onZoomToTable, onOpenSettings,
  basemap, onBasemapChange,
}: Props) {
  const [tab, setTab] = React.useState("browser");
  const [tables, setTables] = React.useState<TableRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set());
  const [expandedLayer, setExpandedLayer] = React.useState<string | null>(null);
  const [expandedSection, setExpandedSection] = React.useState<"style" | "filters" | null>(null);
  type StylePopup = { x: number; y: number; type: "radius" | "lineWidth" | "opacity" | "strokeOpacity" | "categoricalFill" | "categoricalStroke"; layerId: string } | null;
  const [stylePopup, setStylePopup] = React.useState<StylePopup>(null);
  const stylePopupRef = React.useRef<HTMLDivElement>(null);
  const [dragId, setDragId] = React.useState<string | null>(null);
  const [dragOverId, setDragOverId] = React.useState<string | null>(null);
  type LayerCtx = { x: number; y: number; layerId: string } | null;
  const [layerCtx, setLayerCtx] = React.useState<LayerCtx>(null);
  const layerCtxRef = React.useRef<HTMLDivElement>(null);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [createDefaultSchema, setCreateDefaultSchema] = React.useState<string | undefined>(undefined);

  const [deleteTarget, setDeleteTarget] = React.useState<{ schema: string; table: string } | null>(null);
  const [renameTarget, setRenameTarget] = React.useState<{ schema: string; table: string } | null>(null);
  const [attrTableLayer, setAttrTableLayer] = React.useState<MapLayer | null>(null);
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

  const [connectionOpen, setConnectionOpen] = React.useState(false);
  const [basemapOpen, setBasemapOpen] = React.useState(false);
  type CtxTarget =
    | { type: "connection" }
    | { type: "schema"; schema: string }
    | { type: "table"; table: TableRow }
    | { type: "basemap"; key: string };
  const [contextMenu, setContextMenu] = React.useState<{ x: number; y: number; target: CtxTarget } | null>(null);
  const contextMenuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!contextMenu) return;
    function close(e: MouseEvent) {
      if (contextMenuRef.current?.contains(e.target as Node)) return;
      setContextMenu(null);
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setContextMenu(null); }
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [!!contextMenu]);

  React.useEffect(() => {
    if (!layerCtx) return;
    function close(e: MouseEvent) {
      if (layerCtxRef.current?.contains(e.target as Node)) return;
      setLayerCtx(null);
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setLayerCtx(null); }
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [!!layerCtx]);

  React.useEffect(() => {
    if (!stylePopup) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setStylePopup(null); }
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); };
  }, [!!stylePopup]);

  function handleLayerDrop(toId: string) {
    if (!dragId || dragId === toId) return;
    const visual = [...layers].reverse();
    const from = visual.findIndex((l) => l.id === dragId);
    const to = visual.findIndex((l) => l.id === toId);
    if (from < 0 || to < 0) return;
    const next = [...visual];
    next.splice(from, 1);
    next.splice(to, 0, visual[from]);
    onReorderLayers([...next].reverse().map((l) => l.id));
    setDragId(null);
    setDragOverId(null);
  }

  function toggleSection(layerId: string, section: "style" | "filters") {
    if (expandedLayer === layerId && expandedSection === section) {
      setExpandedLayer(null);
      setExpandedSection(null);
    } else {
      setExpandedLayer(layerId);
      setExpandedSection(section);
      if (section === "style") setStylePopup(null);
    }
  }

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
        setTables(data.tables ?? []);
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
          onClick={() => setTab("browser")}
          className={`flex-1 py-2 text-xs font-semibold transition-colors ${tab === "browser" ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"}`}
        >
          Browser
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

      {/* BROWSER TAB */}
      {tab === "browser" && (
        <ScrollArea className="flex-1 min-h-0">
          {/* PostgreSQL root node — always visible */}
          <button
            className="w-full flex items-center gap-1.5 px-2 py-1.5 hover:bg-muted/60 text-left select-none"
            onClick={() => dsn && setConnectionOpen((v) => !v)}
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu({ x: e.clientX, y: e.clientY, target: { type: "connection" } });
            }}
          >
            {connectionOpen
              ? <ChevronDown className="w-3 h-3 shrink-0 text-muted-foreground" />
              : <ChevronRight className="w-3 h-3 shrink-0 text-muted-foreground" />
            }
            <img src="/favicon.ico" className="w-4 h-4 shrink-0" alt="" />
            <span className="text-xs font-semibold flex-1 text-left">PostgreSQL</span>
            <span className={`w-2 h-2 rounded-full shrink-0 ${dsn ? "bg-green-500" : "bg-red-400"}`} title={dsn ? "Connected" : "Not connected"} />
          </button>

          {!dsn && <p className="pl-8 py-2 text-xs text-muted-foreground/60">Right-click to connect…</p>}
          {loading && <p className="pl-8 py-1.5 text-xs text-muted-foreground">Loading…</p>}
          {error && (() => { const { title, detail } = friendlyConnError(error); return (
            <div className="mx-3 my-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 space-y-0.5">
              <p className="text-xs font-medium text-destructive">{title}</p>
              <p className="text-xs text-muted-foreground">{detail}</p>
            </div>
          ); })()}

          {dsn && !loading && !error && (
            <>

              {connectionOpen && [...schemas.entries()].map(([schema, schemaTables]) => {
                const isCollapsed = collapsed.has(schema);
                return (
                  <div key={schema}>
                    {/* Schema node */}
                    <button
                      className="w-full flex items-center gap-1.5 pl-6 pr-3 py-1 hover:bg-muted/50 text-left select-none"
                      onClick={() => toggleSchema(schema)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setContextMenu({ x: e.clientX, y: e.clientY, target: { type: "schema", schema } });
                      }}
                    >
                      {isCollapsed
                        ? <ChevronRight className="w-3 h-3 shrink-0 text-muted-foreground" />
                        : <ChevronDown className="w-3 h-3 shrink-0 text-muted-foreground" />
                      }
                      <Folder className="w-3.5 h-3.5 shrink-0 text-amber-500" />
                      <span className="text-xs font-medium truncate flex-1" title={schema}>{schema}</span>
                      <span className="text-[10px] text-muted-foreground shrink-0">{schemaTables.length}</span>
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
                        <div key={key} className={`border-b ${alreadyAdded ? "bg-primary/5" : ""}`}>
                          <div
                            className="flex items-center gap-1.5 pl-11 pr-3 py-1.5 cursor-default select-none hover:bg-muted/40 min-w-0"
                            onDoubleClick={() => { if (!alreadyAdded) { onAddLayer(t); setTab("layers"); } }}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setContextMenu({ x: e.clientX, y: e.clientY, target: { type: "table", table: t } });
                            }}
                          >
                            <Table2 className="h-3 w-3 shrink-0 text-muted-foreground" />
                            <span className="text-xs truncate max-w-48" title={t.table_name}>{t.table_name}</span>
                            {alreadyAdded && <Check className="h-3 w-3 text-primary shrink-0" />}
                          </div>

                          {/* Warning badges */}
                          {(sridUnknown || t.has_pk === false || t.has_spatial_index === false || isGenericGeom) && (
                            <div className="flex flex-row gap-1.5 items-center pl-11 pb-1">
                              {sridUnknown && (
                                <button
                                  className="flex items-center gap-0.5 text-[10px] text-amber-500 hover:text-amber-600"
                                  onClick={() => { setAssigningSrid(isAssigning ? null : key); setSridInput("4326"); setAssignError(null); }}
                                  title="SRID unknown — tiles won't render. Click to assign."
                                >
                                  <TriangleAlert className="h-2.5 w-2.5" />
                                  SRID
                                </button>
                              )}
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
                                  title="No spatial index — click to fix"
                                  onClick={() => { setCreatingIdx(isCreatingIdx ? null : key); setIdxError(null); }}
                                >
                                  no index
                                </button>
                              )}
                              {isGenericGeom && (
                                <button
                                  className="text-[9px] font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-400 border border-violet-400 dark:border-violet-600 rounded px-1 leading-4 hover:bg-violet-50 dark:hover:bg-violet-950/40"
                                  title="Geometry type unspecified — click to cast"
                                  onClick={() => { setCastingGeom(isCastingGeom ? null : key); setCastSrid(String(t.srid ?? 4326)); setCastError(null); }}
                                >
                                  type unknown
                                </button>
                              )}
                            </div>
                          )}

                          {isAssigning && (
                            <div className="px-3 pb-2 space-y-1.5 bg-amber-50/50 dark:bg-amber-950/20 border-t">
                              <p className="text-[10px] text-muted-foreground pt-1.5">
                                Assigns an SRID label without reprojecting coordinates.
                                Use this when the data is already in the target CRS.
                              </p>
                              <div className="flex gap-1.5 items-center">
                                <Input value={sridInput} onChange={(e) => setSridInput(e.target.value)} className="h-7 text-xs font-mono w-24" placeholder="4326" />
                                <Button size="sm" className="h-7 text-xs" onClick={() => handleAssignSrid(t)} disabled={assignLoading}>
                                  {assignLoading ? "Saving…" : "Assign SRID"}
                                </Button>
                                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setAssigningSrid(null)}>Cancel</Button>
                              </div>
                              {assignError && <p className="text-[10px] text-destructive break-words">{assignError}</p>}
                            </div>
                          )}

                          {isFixingPk && (
                            <div className="px-3 pb-2 space-y-1.5 bg-amber-50/50 dark:bg-amber-950/20 border-t">
                              <p className="text-[10px] text-muted-foreground pt-1.5">
                                Adds an <span className="font-mono">id SERIAL PRIMARY KEY</span> column. Existing rows are assigned sequential IDs automatically.
                              </p>
                              <div className="flex gap-1.5 items-center">
                                <Button size="sm" className="h-7 text-xs" disabled={pkLoading} onClick={async () => {
                                  setPkLoading(true); setPkError(null);
                                  try {
                                    const res = await fetch("/api/pg/add-primary-key", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dsn, schema: t.table_schema, table: t.table_name }) });
                                    const data = await res.json();
                                    if (!res.ok) throw new Error(data.error);
                                    setFixingPk(null); setRefreshKey((k) => k + 1);
                                  } catch (e: any) { setPkError(e.message); } finally { setPkLoading(false); }
                                }}>
                                  {pkLoading ? "Adding…" : "Add primary key"}
                                </Button>
                                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setFixingPk(null)}>Cancel</Button>
                              </div>
                              {pkError && <p className="text-[10px] text-destructive break-words">{pkError}</p>}
                            </div>
                          )}

                          {isCreatingIdx && (
                            <div className="px-3 pb-2 space-y-1.5 bg-blue-50/50 dark:bg-blue-950/20 border-t">
                              <p className="text-[10px] text-muted-foreground pt-1.5">
                                Creates a <span className="font-mono">GIST</span> index on <span className="font-mono">{t.geom_col}</span> and runs <span className="font-mono">ANALYZE</span>.
                              </p>
                              <div className="flex gap-1.5 items-center">
                                <Button size="sm" className="h-7 text-xs" disabled={idxLoading} onClick={async () => {
                                  setIdxLoading(true); setIdxError(null);
                                  try {
                                    const res = await fetch("/api/pg/create-spatial-index", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dsn, schema: t.table_schema, table: t.table_name, geomCol: t.geom_col }) });
                                    const data = await res.json();
                                    if (!res.ok) throw new Error(data.error);
                                    setCreatingIdx(null); setRefreshKey((k) => k + 1);
                                  } catch (e: any) { setIdxError(e.message); } finally { setIdxLoading(false); }
                                }}>
                                  {idxLoading ? "Creating…" : "Create spatial index"}
                                </Button>
                                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setCreatingIdx(null)}>Cancel</Button>
                              </div>
                              {idxError && <p className="text-[10px] text-destructive break-words">{idxError}</p>}
                            </div>
                          )}

                          {isCastingGeom && (
                            <div className="px-3 pb-2 space-y-1.5 bg-violet-50/50 dark:bg-violet-950/20 border-t">
                              <p className="text-[10px] text-muted-foreground pt-1.5">
                                Casts the geometry column to a specific type. All existing rows must already be of that geometry type.
                              </p>
                              <div className="grid grid-cols-2 gap-1.5">
                                <Select value={castType} onValueChange={setCastType}>
                                  <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {["Point","MultiPoint","LineString","MultiLineString","Polygon","MultiPolygon","GeometryCollection"].map((gt) => (
                                      <SelectItem key={gt} value={gt} className="text-xs">{gt}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <Input value={castSrid} onChange={(e) => setCastSrid(e.target.value)} className="h-7 text-xs font-mono" placeholder="SRID e.g. 4326" />
                              </div>
                              <div className="flex gap-1.5 items-center">
                                <Button size="sm" className="h-7 text-xs" disabled={castLoading} onClick={async () => {
                                  setCastLoading(true); setCastError(null);
                                  try {
                                    const res = await fetch("/api/pg/cast-geometry-type", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dsn, schema: t.table_schema, table: t.table_name, geomCol: t.geom_col, newType: castType, srid: castSrid }) });
                                    const data = await res.json();
                                    if (!res.ok) throw new Error(data.error);
                                    setCastingGeom(null); setRefreshKey((k) => k + 1);
                                  } catch (e: any) { setCastError(e.message); } finally { setCastLoading(false); }
                                }}>
                                  {castLoading ? "Casting…" : "Cast type"}
                                </Button>
                                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setCastingGeom(null)}>Cancel</Button>
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
              {/* Empty states — only shown when the connection section is expanded */}
              {connectionOpen && !loading && tables.length === 0 && (
                <div className="pl-8 pr-3 py-3 space-y-1">
                  <p className="text-xs text-muted-foreground">No tables found in this database.</p>
                  <p className="text-xs text-muted-foreground/60">Create a table or import data to get started.</p>
                </div>
              )}
              {connectionOpen && !loading && tables.length > 0 && spatialTables.length === 0 && (
                <div className="pl-8 pr-3 py-3 space-y-1">
                  <p className="text-xs text-muted-foreground">{tables.length} table{tables.length !== 1 ? "s" : ""} found, but none have a geometry column.</p>
                  <p className="text-xs text-muted-foreground/60">Import spatial data or add a PostGIS geometry column to get started.</p>
                </div>
              )}
            </>
          )}

          {/* Basemaps root node */}
          <div className="border-t">
            <button
              className="w-full flex items-center gap-1.5 px-2 py-1.5 hover:bg-muted/60 text-left select-none"
              onClick={() => setBasemapOpen((v) => !v)}
            >
              {basemapOpen
                ? <ChevronDown className="w-3 h-3 shrink-0 text-muted-foreground" />
                : <ChevronRight className="w-3 h-3 shrink-0 text-muted-foreground" />
              }
              <Globe className="w-4 h-4 shrink-0 text-sky-400" />
              <span className="text-xs font-semibold flex-1 text-left">Basemaps</span>
            </button>

            {basemapOpen && (
              <>
                {BASEMAP_OPTIONS.map(({ key, label }) => (
                  <button
                    key={key}
                    className={`w-full flex items-center gap-2 pl-8 pr-3 py-1 text-left hover:bg-muted/40 text-xs text-muted-foreground`}
                    onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, target: { type: "basemap", key } }); }}
                    onDoubleClick={() => { onBasemapChange(key); setTab("layers"); }}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 border ${basemap === key ? "bg-primary border-primary" : "border-muted-foreground"}`} />
                    <span className="flex-1">{label}</span>
                  </button>
                ))}
              </>
            )}
          </div>
        </ScrollArea>
      )}

      {/* LAYERS TAB */}
      {tab === "layers" && (
        <ScrollArea className="flex-1 min-h-0">
          {layers.length === 0 && !basemap && (
            <div className="p-4 space-y-1">
              <p className="text-xs text-muted-foreground">No layers added yet.</p>
              <p className="text-xs text-muted-foreground/60">Double-click a table in the Browser tab, or right-click for more options.</p>
            </div>
          )}

          {[...layers].reverse().map((layer) => {
            const gt = (layer.geomTypeOverride ?? layer.table.geom_type ?? "").toLowerCase();
            const isLine = gt.includes("linestring");
            const isPoly = gt.includes("polygon");
            const isPoint = !isLine && !isPoly;
            const isDragOver = dragOverId === layer.id && dragId !== layer.id;

            function slider(label: string, key: keyof Pick<typeof layer.style, "opacity" | "strokeOpacity" | "radius" | "lineWidth">, min: number, max: number, step: number, fmt: (v: number) => string, popupType?: "radius" | "lineWidth" | "opacity" | "strokeOpacity") {
              const scaleActive = popupType === "radius" ? !!layer.style.radiusScale
                : popupType === "lineWidth" ? !!(layer.style.lineWidthScale ?? null)
                : popupType === "opacity" ? !!(layer.style.opacityScale ?? null)
                : popupType === "strokeOpacity" ? !!(layer.style.strokeOpacityScale ?? null)
                : false;
              return (
                <div key={key} className="grid grid-cols-[3.5rem_1fr_2.5rem] items-center gap-2">
                  {popupType ? (
                    <button
                      className={`text-xs text-left transition-colors hover:text-foreground flex items-center gap-0.5 ${scaleActive ? "text-primary" : "text-muted-foreground"}`}
                      onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const same = stylePopup?.type === popupType && stylePopup?.layerId === layer.id;
                        setStylePopup(same ? null : { x: rect.right + 8, y: rect.top, type: popupType, layerId: layer.id });
                      }}
                      title="Click to configure by-value scaling"
                    >
                      {label}
                      {scaleActive && <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
                    </button>
                  ) : (
                    <Label className="text-xs text-muted-foreground">{label}</Label>
                  )}
                  {scaleActive ? (
                    <span className="col-span-2 text-xs text-primary/60 text-right italic">by value</span>
                  ) : (
                    <>
                      <Slider min={min} max={max} step={step}
                        value={[layer.style[key]]}
                        onValueChange={([v]) => onUpdateLayer(layer.id, { style: { ...layer.style, [key]: v } })}
                      />
                      <span className="text-xs text-muted-foreground text-right">{fmt(layer.style[key])}</span>
                    </>
                  )}
                </div>
              );
            }

            return (
              <div
                key={layer.id}
                className={`border-b select-none ${isDragOver ? "border-t-2 border-t-primary" : ""} ${dragId === layer.id ? "opacity-40" : ""} ${activeLayerId === layer.id ? "bg-primary/5 border-l-2 border-l-primary" : ""}`}
                draggable
                onDragStart={() => setDragId(layer.id)}
                onDragEnd={() => { setDragId(null); setDragOverId(null); }}
                onDragOver={(e) => { e.preventDefault(); setDragOverId(layer.id); }}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverId(null); }}
                onDrop={(e) => { e.preventDefault(); handleLayerDrop(layer.id); }}
                onContextMenu={(e) => { e.preventDefault(); setLayerCtx({ x: e.clientX, y: e.clientY, layerId: layer.id }); }}
              >
                {/* Layer row */}
                <div className={`flex items-center gap-1 px-1.5 py-1.5 min-w-0 ${!layer.visible ? "opacity-40" : ""}`}>
                  <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40 cursor-grab" />
                  <label className="shrink-0 cursor-pointer" title={isLine ? "Change line color" : "Change fill color"}>
                    <span
                      className="block w-3.5 h-3.5 rounded-sm border border-border"
                      style={{ backgroundColor: isLine ? layer.style.strokeColor : layer.style.color }}
                    />
                    <input
                      type="color"
                      className="sr-only"
                      value={isLine ? layer.style.strokeColor : layer.style.color}
                      onChange={(e) => onUpdateLayer(layer.id, {
                        style: isLine
                          ? { ...layer.style, strokeColor: e.target.value }
                          : { ...layer.style, color: e.target.value },
                      })}
                    />
                  </label>
                  <span
                    className="flex-1 flex items-center gap-1 min-w-0 overflow-hidden"
                  >
                    <span className="flex flex-col min-w-0">
                      <span className="text-xs truncate font-medium leading-tight max-w-50" title={layer.table.table_name}>{layer.table.table_name}</span>
                      {layer.table.table_schema !== "public" && (
                        <span className="text-[10px] text-muted-foreground truncate leading-tight" title={layer.table.table_schema}>{layer.table.table_schema}</span>
                      )}
                    </span>
                    {layer.filters.length > 0 && (
                      <Badge variant="secondary" className="shrink-0 h-4 px-1 text-[10px]">
                        {layer.filters.length}
                      </Badge>
                    )}
                  </span>
                  <button
                    className="shrink-0 text-muted-foreground hover:text-foreground p-0.5"
                    onClick={(e) => { e.stopPropagation(); onUpdateLayer(layer.id, { visible: !layer.visible }); }}
                    title={layer.visible ? "Hide" : "Show"}
                  >
                    {layer.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                  </button>
                </div>

                {/* Style panel */}
                {expandedLayer === layer.id && expandedSection === "style" && (
                  <div className="px-3 pb-3 pt-2 space-y-4 bg-muted/20 border-t">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Style</span>
                      <button onClick={() => { setExpandedLayer(null); setExpandedSection(null); }} className="text-muted-foreground hover:text-foreground"><X className="h-3 w-3" /></button>
                    </div>
                    <div className="space-y-3">
                      {(layer.table.geom_type === "GEOMETRY" || layer.table.geom_type === "GEOGRAPHY") && (
                        <div className="grid grid-cols-[3.5rem_1fr] items-center gap-2">
                          <Label className="text-xs text-muted-foreground">Type</Label>
                          <Select value={layer.geomTypeOverride ?? ""} onValueChange={(v) => onUpdateLayer(layer.id, { geomTypeOverride: v || null })}>
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
                      {isLine && slider("Opacity", "strokeOpacity", 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`, "strokeOpacity")}
                      {isLine && slider("Width", "lineWidth", 0, 10, 0.5, (v) => `${v}px`, "lineWidth")}
                      {!isLine && (() => {
                        const catFillActive = !!(layer.style.categoricalFill ?? null);
                        const catStrokeActive = !!(layer.style.categoricalStroke ?? null);
                        function catLabel(label: string, popupType: "categoricalFill" | "categoricalStroke", active: boolean) {
                          return (
                            <button
                              className={`text-xs text-left transition-colors hover:text-foreground flex items-center gap-0.5 ${active ? "text-primary" : "text-muted-foreground"}`}
                              onClick={(e) => {
                                const rect = e.currentTarget.getBoundingClientRect();
                                const same = stylePopup?.type === popupType && stylePopup?.layerId === layer.id;
                                setStylePopup(same ? null : { x: rect.right + 8, y: rect.top, type: popupType, layerId: layer.id });
                              }}
                            >
                              {label}
                              {active && <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
                            </button>
                          );
                        }
                        return (
                          <>
                            <div className="grid grid-cols-[3.5rem_1fr] items-center gap-2">
                              {catLabel("Fill", "categoricalFill", catFillActive)}
                              {catFillActive
                                ? <span className="text-xs text-primary/60 italic">by category</span>
                                : <label className="cursor-pointer flex items-center gap-1.5">
                                    <span className="block w-4 h-4 rounded border border-border shrink-0" style={{ backgroundColor: layer.style.color }} />
                                    <span className="text-xs text-muted-foreground">{layer.style.color}</span>
                                    <input type="color" className="sr-only" value={layer.style.color}
                                      onChange={(e) => onUpdateLayer(layer.id, { style: { ...layer.style, color: e.target.value } })} />
                                  </label>
                              }
                            </div>
                            {isPoint && slider("Radius", "radius", 1, 30, 1, (v) => `${v}px`, "radius")}
                            {slider("Fill Opacity", "opacity", 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`, "opacity")}
                            <div className="grid grid-cols-[3.5rem_1fr] items-center gap-2">
                              {catLabel("Stroke", "categoricalStroke", catStrokeActive)}
                              {catStrokeActive
                                ? <span className="text-xs text-primary/60 italic">by category</span>
                                : <label className="cursor-pointer flex items-center gap-1.5">
                                    <span className="block w-4 h-4 rounded border border-border shrink-0" style={{ backgroundColor: layer.style.strokeColor ?? "#ffffff" }} />
                                    <span className="text-xs text-muted-foreground">{layer.style.strokeColor ?? "#ffffff"}</span>
                                    <input type="color" className="sr-only" value={layer.style.strokeColor ?? "#ffffff"}
                                      onChange={(e) => onUpdateLayer(layer.id, { style: { ...layer.style, strokeColor: e.target.value } })} />
                                  </label>
                              }
                            </div>
                            {slider("Stroke Opacity", "strokeOpacity", 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`, "strokeOpacity")}
                            {slider("Stroke Width", "lineWidth", 0, 10, 0.5, (v) => `${v}px`, "lineWidth")}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                )}

                {/* Filter panel */}
                {expandedLayer === layer.id && expandedSection === "filters" && (
                  <div className="px-3 pb-3 pt-2 bg-muted/20 border-t">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Filters</span>
                      <button onClick={() => { setExpandedLayer(null); setExpandedSection(null); }} className="text-muted-foreground hover:text-foreground"><X className="h-3 w-3" /></button>
                    </div>
                    <LayerFilterEditor layer={layer} dsn={dsn} onUpdateLayer={onUpdateLayer} />
                  </div>
                )}
              </div>
            );
          })}

          {/* Active basemap entry */}
          {basemap && (() => {
            const bDef = BASEMAP_OPTIONS.find((b) => b.key === basemap);
            return (
              <div className="flex items-center gap-1 px-1.5 py-1.5 border-t">
                <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground/20" />
                <Globe className="h-3.5 w-3.5 shrink-0 text-sky-400" />
                <span className="flex-1 flex flex-col min-w-0">
                  <span className="text-xs font-medium truncate leading-tight">{bDef?.label ?? basemap}</span>
                  <span className="text-[10px] text-muted-foreground leading-tight">Basemap</span>
                </span>
                <button
                  className="shrink-0 text-muted-foreground hover:text-foreground p-0.5"
                  title="Remove basemap"
                  onClick={() => onBasemapChange("")}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })()}
        </ScrollArea>
      )}
      <CreateTableDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        dsn={dsn}
        onCreated={() => setRefreshKey((k) => k + 1)}
        defaultSchema={createDefaultSchema}
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
      {attrTableLayer && (
        <AttributeTableDialog
          open={!!attrTableLayer}
          onOpenChange={(v) => { if (!v) setAttrTableLayer(null); }}
          dsn={dsn}
          schema={attrTableLayer.table.table_schema}
          table={attrTableLayer.table.table_name}
          filters={attrTableLayer.filters}
          onFiltersChange={(filters) => onUpdateLayer(attrTableLayer.id, { filters })}
          onDataChanged={() => {
            const current = layers.find((l) => l.id === attrTableLayer.id);
            if (current) onUpdateLayer(current.id, { dataVersion: (current.dataVersion ?? 0) + 1 });
          }}
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

      {/* Context menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 bg-background border rounded-md shadow-lg py-1 min-w-44 text-xs"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {contextMenu.target.type === "connection" && (
            <>
              <button className="w-full text-left px-3 py-1.5 hover:bg-muted" onClick={() => { onOpenSettings?.(); setContextMenu(null); }}>
                {dsn ? "Change connection" : "Connect…"}
              </button>
              {dsn && (
                <>
                  <button className="w-full text-left px-3 py-1.5 hover:bg-muted" onClick={() => { setCreateOpen(true); setContextMenu(null); }}>
                    Create table
                  </button>
                  <button className="w-full text-left px-3 py-1.5 hover:bg-muted" onClick={() => { setRefreshKey((k) => k + 1); setContextMenu(null); }}>
                    Refresh
                  </button>
                </>
              )}
            </>
          )}
          {contextMenu.target.type === "schema" && (() => {
            const { schema } = contextMenu.target as { type: "schema"; schema: string };
            return (
              <>
                <button className="w-full text-left px-3 py-1.5 hover:bg-muted" onClick={() => { setCreateDefaultSchema(schema); setCreateOpen(true); setContextMenu(null); }}>
                  New table
                </button>
                <button className="w-full text-left px-3 py-1.5 hover:bg-muted" onClick={() => { setRefreshKey((k) => k + 1); setContextMenu(null); }}>
                  Refresh
                </button>
              </>
            );
          })()}
          {contextMenu.target.type === "table" && (() => {
            const t = contextMenu.target.table;
            const alreadyAdded = layerKeys.has(`${t.table_schema}.${t.table_name}`);
            return (
              <>
                <button
                  className={`w-full text-left px-3 py-1.5 hover:bg-muted ${alreadyAdded ? "text-muted-foreground" : ""}`}
                  onClick={() => { if (!alreadyAdded) { onAddLayer(t); setTab("layers"); } setContextMenu(null); }}
                >
                  {alreadyAdded ? "Already on map" : "Add to map"}
                </button>
                <button className="w-full text-left px-3 py-1.5 hover:bg-muted" onClick={() => { setTableInfoTarget({ schema: t.table_schema, table: t.table_name }); setContextMenu(null); }}>
                  Table info / columns
                </button>
                {onZoomToTable && (
                  <button className="w-full text-left px-3 py-1.5 hover:bg-muted" onClick={() => { onZoomToTable(t); setContextMenu(null); }}>
                    Zoom to extent
                  </button>
                )}
                <div className="border-t my-1" />
                <button className="w-full text-left px-3 py-1.5 hover:bg-muted" onClick={() => { setRenameTarget({ schema: t.table_schema, table: t.table_name }); setContextMenu(null); }}>
                  Rename / Move
                </button>
                <button className="w-full text-left px-3 py-1.5 hover:bg-muted text-destructive" onClick={() => { setDeleteTarget({ schema: t.table_schema, table: t.table_name }); setContextMenu(null); }}>
                  Delete table
                </button>
              </>
            );
          })()}
          {contextMenu.target.type === "basemap" && (() => {
            const { key } = contextMenu.target as { type: "basemap"; key: string };
            const alreadyActive = basemap === key;
            return (
              <button
                className={`w-full text-left px-3 py-1.5 hover:bg-muted ${alreadyActive ? "text-muted-foreground" : ""}`}
                onClick={() => { if (!alreadyActive) { onBasemapChange(key); setTab("layers"); } setContextMenu(null); }}
              >
                {alreadyActive ? "Already on map" : "Add to map"}
              </button>
            );
          })()}
        </div>
      )}

      {/* Scale-by-value popup */}
      {stylePopup && (() => {
        const popLayer = layers.find((l) => l.id === stylePopup.layerId);
        if (!popLayer) return null;
        const titles = { radius: "Radius by value", lineWidth: "Width by value", opacity: "Opacity by value", strokeOpacity: "Stroke opacity by value", categoricalFill: "Fill by category", categoricalStroke: "Stroke by category" };
        return (
          <>
            {/* Backdrop — z-40 so popup (z-50) and Radix portals (z-50) are above it */}
            <div className="fixed inset-0 z-40" onPointerDown={() => setStylePopup(null)} />
            <div
              ref={stylePopupRef}
              className="fixed z-50 bg-background border rounded-lg shadow-xl w-56 p-3 space-y-3"
              style={{ left: stylePopup.x, top: Math.min(stylePopup.y, window.innerHeight - 320) }}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{titles[stylePopup.type]}</span>
                <button onClick={() => setStylePopup(null)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              {stylePopup.type === "radius" && (
                <RadiusScaleEditor
                  layer={popLayer} dsn={dsn} onUpdateLayer={onUpdateLayer}
                  onRemove={() => { onUpdateLayer(popLayer.id, { style: { ...popLayer.style, radiusScale: null } }); setStylePopup(null); }}
                />
              )}
              {stylePopup.type === "lineWidth" && (
                <ValueScaleEditor
                  layer={popLayer} dsn={dsn} onUpdateLayer={onUpdateLayer}
                  styleKey="lineWidthScale" outputLabel="Width (px)"
                  defaultMinOut={1} defaultMaxOut={8} minOut={0} maxOut={20} outStep={0.5}
                  onRemove={() => { onUpdateLayer(popLayer.id, { style: { ...popLayer.style, lineWidthScale: null } }); setStylePopup(null); }}
                />
              )}
              {stylePopup.type === "opacity" && (
                <ValueScaleEditor
                  layer={popLayer} dsn={dsn} onUpdateLayer={onUpdateLayer}
                  styleKey="opacityScale" outputLabel="Opacity"
                  defaultMinOut={0.2} defaultMaxOut={1} minOut={0} maxOut={1} outStep={0.05}
                  onRemove={() => { onUpdateLayer(popLayer.id, { style: { ...popLayer.style, opacityScale: null } }); setStylePopup(null); }}
                />
              )}
              {stylePopup.type === "strokeOpacity" && (
                <ValueScaleEditor
                  layer={popLayer} dsn={dsn} onUpdateLayer={onUpdateLayer}
                  styleKey="strokeOpacityScale" outputLabel="Stroke opacity"
                  defaultMinOut={0.2} defaultMaxOut={1} minOut={0} maxOut={1} outStep={0.05}
                  onRemove={() => { onUpdateLayer(popLayer.id, { style: { ...popLayer.style, strokeOpacityScale: null } }); setStylePopup(null); }}
                />
              )}
              {stylePopup.type === "categoricalFill" && (
                <CategoricalColorEditor
                  layer={popLayer} dsn={dsn} onUpdateLayer={onUpdateLayer}
                  styleKey="categoricalFill"
                  onRemove={() => { onUpdateLayer(popLayer.id, { style: { ...popLayer.style, categoricalFill: null } }); setStylePopup(null); }}
                />
              )}
              {stylePopup.type === "categoricalStroke" && (
                <CategoricalColorEditor
                  layer={popLayer} dsn={dsn} onUpdateLayer={onUpdateLayer}
                  styleKey="categoricalStroke"
                  onRemove={() => { onUpdateLayer(popLayer.id, { style: { ...popLayer.style, categoricalStroke: null } }); setStylePopup(null); }}
                />
              )}
            </div>
          </>
        );
      })()}

      {/* Layer context menu */}
      {layerCtx && (() => {
        const layer = layers.find((l) => l.id === layerCtx.layerId);
        if (!layer) return null;
        const isStyleOpen = expandedLayer === layer.id && expandedSection === "style";
        const isFiltersOpen = expandedLayer === layer.id && expandedSection === "filters";
        return (
          <div
            ref={layerCtxRef}
            className="fixed z-50 bg-background border rounded-md shadow-lg py-1 min-w-44 text-xs"
            style={{ left: layerCtx.x, top: layerCtx.y }}
          >
            <button className="w-full text-left px-3 py-1.5 hover:bg-muted flex items-center justify-between"
              onClick={() => { toggleSection(layer.id, "style"); setLayerCtx(null); }}>
              Style
              {isStyleOpen && <span className="text-[10px] text-primary">▸</span>}
            </button>
            <button className="w-full text-left px-3 py-1.5 hover:bg-muted flex items-center justify-between"
              onClick={() => { toggleSection(layer.id, "filters"); setLayerCtx(null); }}>
              Filters
              {layer.filters.length > 0 && <Badge variant="secondary" className="h-4 px-1 text-[10px]">{layer.filters.length}</Badge>}
              {isFiltersOpen && layer.filters.length === 0 && <span className="text-[10px] text-primary">▸</span>}
            </button>
            <button className="w-full text-left px-3 py-1.5 hover:bg-muted"
              onClick={() => { setAttrTableLayer(layer); setLayerCtx(null); }}>
              Open attribute table
            </button>
            <div className="border-t my-1" />
            {onZoomToLayer && (
              <button className="w-full text-left px-3 py-1.5 hover:bg-muted"
                onClick={() => { onZoomToLayer(layer); setLayerCtx(null); }}>
                <Maximize2 className="inline h-3 w-3 mr-1.5 mb-0.5" />Zoom to extent
              </button>
            )}
            <div className="border-t my-1" />
            <button className="w-full text-left px-3 py-1.5 hover:bg-muted"
              onClick={() => { onUpdateLayer(layer.id, { visible: !layer.visible }); setLayerCtx(null); }}>
              {layer.visible ? <EyeOff className="inline h-3 w-3 mr-1.5 mb-0.5" /> : <Eye className="inline h-3 w-3 mr-1.5 mb-0.5" />}
              {layer.visible ? "Hide layer" : "Show layer"}
            </button>
            <button className="w-full text-left px-3 py-1.5 hover:bg-muted text-destructive"
              onClick={() => { onRemoveLayer(layer.id); setLayerCtx(null); }}>
              Remove layer
            </button>
          </div>
        );
      })()}

    </aside>
  );
}
