export interface TableRow {
  table_schema: string;
  table_name: string;
  geom_col: string | null;
  geom_type: string | null;
  srid: number | null;
  row_count?: number | null;
  has_pk?: boolean | null;
  has_spatial_index?: boolean | null;
}

export type AttrOperator = "ilike" | "eq" | "neq" | "gt" | "lt" | "gte" | "lte" | "is_null" | "is_not_null" | "starts_with" | "in" | "not_in";

export interface ValueScale {
  column: string;
  minValue: number;
  maxValue: number;
  minOutput: number;
  maxOutput: number;
}

export interface AttrFilter {
  id: string;
  column: string;
  operator: AttrOperator;
  value: string;
}

export interface RadiusScale {
  column: string;
  minValue: number;
  maxValue: number;
  minRadius: number;
  maxRadius: number;
}

export interface FillColorRule {
  value: string;
  color: string; // hex
}

export interface CategoricalFill {
  column: string;
  rules: FillColorRule[];
  defaultColor: string; // hex fallback
}

export interface LayerStyle {
  color: string;         // hex — fill for points/polygons, line color for linestrings
  strokeColor: string;   // hex — outline for points/polygons (unused for linestrings)
  opacity: number;       // 0–1, fill opacity for points/polygons; overall opacity for lines
  strokeOpacity: number; // 0–1, outline opacity for points/polygons (unused for lines)
  radius: number;        // px, for point layers (used when radiusScale is null)
  lineWidth: number;     // px, stroke width for all types
  radiusScale: RadiusScale | null;
  lineWidthScale: ValueScale | null;
  opacityScale: ValueScale | null;
  strokeOpacityScale: ValueScale | null;
  categoricalFill: CategoricalFill | null;
  categoricalStroke: CategoricalFill | null;
}

export interface MapLayer {
  id: string;
  table: TableRow;
  dsn: string;
  visible: boolean;
  style: LayerStyle;
  filters: AttrFilter[];
  dataVersion?: number;
  geomTypeOverride?: string | null; // user-set override when table's geom_type is generic
}


export const BASEMAP_OPTIONS: { key: string; label: string }[] = [
  { key: "liberty",   label: "Street"    },
  { key: "satellite", label: "Satellite" },
];

export const LAYER_COLORS = [
  "#3b82f6", "#ef4444", "#10b981", "#f59e0b",
  "#8b5cf6", "#06b6d4", "#f97316", "#ec4899",
];

export const DEFAULT_STYLE: LayerStyle = {
  color: "#3b82f6",
  strokeColor: "#ffffff",
  opacity: 0.85,
  strokeOpacity: 1.0,
  radius: 6,
  lineWidth: 1,
  radiusScale: null,
  lineWidthScale: null,
  opacityScale: null,
  categoricalFill: null,
  categoricalStroke: null,
  strokeOpacityScale: null,
};
