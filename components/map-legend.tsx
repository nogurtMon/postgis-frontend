"use client";
import React from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { MapLayer } from "@/lib/types";

// ─── geometry helpers ─────────────────────────────────────────────────────────
function geomKind(layer: MapLayer): "point" | "line" | "polygon" {
  const raw = (layer.geomTypeOverride || layer.table.geom_type || "").toLowerCase();
  if (raw.includes("linestring") || raw.includes("line")) return "line";
  if (raw.includes("polygon")) return "polygon";
  return "point";
}

// ─── tiny SVG swatches ────────────────────────────────────────────────────────
function PointSwatch({ fill, stroke }: { fill: string; stroke: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" className="shrink-0">
      <circle cx="7" cy="7" r="5" fill={fill} stroke={stroke} strokeWidth="1.5" />
    </svg>
  );
}

function LineSwatch({ color }: { color: string }) {
  return (
    <svg width="18" height="10" viewBox="0 0 18 10" className="shrink-0">
      <line x1="1" y1="5" x2="17" y2="5" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function PolygonSwatch({ fill, stroke }: { fill: string; stroke: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" className="shrink-0">
      <rect x="1" y="1" width="12" height="12" rx="1.5" fill={fill} stroke={stroke} strokeWidth="1.5" />
    </svg>
  );
}

function Swatch({ layer, fill, stroke }: { layer: MapLayer; fill: string; stroke: string }) {
  const kind = geomKind(layer);
  if (kind === "line") return <LineSwatch color={stroke} />;
  if (kind === "polygon") return <PolygonSwatch fill={fill} stroke={stroke} />;
  return <PointSwatch fill={fill} stroke={stroke} />;
}

// ─── per-layer legend entry ───────────────────────────────────────────────────
function LayerEntry({ layer }: { layer: MapLayer }) {
  const [open, setOpen] = React.useState(true);
  const { style } = layer;
  const name = layer.table.table_name;
  const kind = geomKind(layer);

  // Categorical fill
  if (style.categoricalFill) {
    const cf = style.categoricalFill;
    return (
      <div>
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1 w-full group"
        >
          <Swatch layer={layer} fill={cf.rules[0]?.color ?? cf.defaultColor} stroke={style.strokeColor} />
          <span className="font-medium truncate text-[11px] flex-1 text-left" title={name}>{name}</span>
          {open
            ? <ChevronUp className="h-2.5 w-2.5 shrink-0 text-muted-foreground" />
            : <ChevronDown className="h-2.5 w-2.5 shrink-0 text-muted-foreground" />}
        </button>
        {open && (
          <div className="mt-1 space-y-0.5">
            {cf.rules.map((rule) => (
              <div key={rule.value} className="flex items-center gap-1.5 pl-1">
                <Swatch layer={layer} fill={rule.color} stroke={style.strokeColor} />
                <span className="truncate text-[10px]" title={rule.value}>{rule.value}</span>
              </div>
            ))}
            <div className="flex items-center gap-1.5 pl-1">
              <Swatch layer={layer} fill={cf.defaultColor} stroke={style.strokeColor} />
              <span className="truncate text-[10px] text-muted-foreground">Other</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Categorical stroke (lines)
  if (style.categoricalStroke && kind === "line") {
    const cs = style.categoricalStroke;
    return (
      <div>
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1 w-full"
        >
          <LineSwatch color={cs.rules[0]?.color ?? cs.defaultColor} />
          <span className="font-medium truncate text-[11px] flex-1 text-left" title={name}>{name}</span>
          {open
            ? <ChevronUp className="h-2.5 w-2.5 shrink-0 text-muted-foreground" />
            : <ChevronDown className="h-2.5 w-2.5 shrink-0 text-muted-foreground" />}
        </button>
        {open && (
          <div className="mt-1 space-y-0.5">
            {cs.rules.map((rule) => (
              <div key={rule.value} className="flex items-center gap-1.5 pl-1">
                <LineSwatch color={rule.color} />
                <span className="truncate text-[10px]" title={rule.value}>{rule.value}</span>
              </div>
            ))}
            <div className="flex items-center gap-1.5 pl-1">
              <LineSwatch color={cs.defaultColor} />
              <span className="truncate text-[10px] text-muted-foreground">Other</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Simple / scale-annotated entry
  const scaleNote =
    style.radiusScale ? `Size by ${style.radiusScale.column}` :
    style.opacityScale ? `Opacity by ${style.opacityScale.column}` :
    style.lineWidthScale ? `Width by ${style.lineWidthScale.column}` :
    null;

  return (
    <div className="flex items-center gap-1.5">
      <Swatch layer={layer} fill={style.color} stroke={style.strokeColor} />
      <div className="min-w-0">
        <span className="font-medium truncate text-[11px] block" title={name}>{name}</span>
        {scaleNote && <span className="text-[9px] text-muted-foreground truncate block" title={scaleNote}>{scaleNote}</span>}
      </div>
    </div>
  );
}

// ─── legend panel ─────────────────────────────────────────────────────────────
export function MapLegend({ layers }: { layers: MapLayer[] }) {
  const [collapsed, setCollapsed] = React.useState(false);
  // Reverse so the topmost layer (last in render order) appears first
  const visible = [...layers].reverse().filter((l) => l.visible && l.table.geom_col);
  if (visible.length === 0) return null;

  return (
    <div className="absolute bottom-10 left-2 z-10 bg-background/90 backdrop-blur-sm rounded-md border shadow-sm text-foreground max-w-52">
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="flex items-center justify-between w-full px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
      >
        <span>Legend</span>
        {collapsed ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
      </button>

      {!collapsed && (
        <div className="px-2.5 pb-2.5 space-y-2.5 max-h-72 overflow-y-auto">
          {visible.map((layer) => (
            <LayerEntry key={layer.id} layer={layer} />
          ))}
        </div>
      )}
    </div>
  );
}
