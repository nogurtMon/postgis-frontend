export interface TableRow {
  table_schema: string;
  table_name: string;
  geom_col: string | null;
  geom_type: string | null;
  srid: number | null;
}

export type FilterOperator =
  | "=" | "!=" | ">" | "<" | ">=" | "<="
  | "LIKE" | "IS NULL" | "IS NOT NULL";

export interface LayerFilter {
  id: string;
  column: string;
  operator: FilterOperator;
  value: string;
}

export interface RadiusScale {
  column: string;
  minValue: number;
  maxValue: number;
  minRadius: number;
  maxRadius: number;
}

export interface LayerStyle {
  color: string;       // hex — fill for points/polygons, line color for linestrings
  strokeColor: string; // hex — outline for points/polygons (unused for linestrings)
  opacity: number;     // 0–1
  radius: number;      // px, for point layers (used when radiusScale is null)
  lineWidth: number;   // px, stroke width for all types
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
}

export const LAYER_COLORS = [
  "#3b82f6", "#ef4444", "#10b981", "#f59e0b",
  "#8b5cf6", "#06b6d4", "#f97316", "#ec4899",
];

export const DEFAULT_STYLE: LayerStyle = {
  color: "#3b82f6",
  strokeColor: "#ffffff",
  opacity: 0.85,
  radius: 6,
  lineWidth: 2,
  radiusScale: null,
};
