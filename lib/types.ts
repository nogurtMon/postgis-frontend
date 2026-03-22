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

export type FilterMode = "in" | "text" | "comparison" | "range" | "null_check";

export interface LayerFilter {
  id: string;
  column: string;
  mode: FilterMode;
  values?: string[];    // "in":          col = ANY(values)
  textValue?: string;  // "text":        col ILIKE '%textValue%'
  operator?: string;   // "comparison":  col {op} value
  value?: string;      // "comparison"
  min?: string;        // "range":       col >= min AND col <= max
  max?: string;        // "range"
  isNull?: boolean;    // "null_check":  IS NULL (true) / IS NOT NULL (false)
}

export interface RadiusScale {
  column: string;
  minValue: number;
  maxValue: number;
  minRadius: number;
  maxRadius: number;
}

export interface LayerStyle {
  color: string;         // hex — fill for points/polygons, line color for linestrings
  strokeColor: string;   // hex — outline for points/polygons (unused for linestrings)
  opacity: number;       // 0–1, fill opacity for points/polygons; overall opacity for lines
  strokeOpacity: number; // 0–1, outline opacity for points/polygons (unused for lines)
  radius: number;        // px, for point layers (used when radiusScale is null)
  lineWidth: number;     // px, stroke width for all types
  dashArray: number[] | null; // line dash pattern e.g. [8,4]; null = solid
  radiusScale: RadiusScale | null;
}

export interface MapLayer {
  id: string;
  table: TableRow;
  dsn: string;
  visible: boolean;
  style: LayerStyle;
  filters: LayerFilter[];
  dataVersion?: number;
  geomTypeOverride?: string | null; // user-set override when table's geom_type is generic
}

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
  lineWidth: 2,
  dashArray: null,
  radiusScale: null,
};
