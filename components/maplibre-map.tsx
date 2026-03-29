"use client";
import React from "react";
import Map from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { MVTLayer } from "@deck.gl/geo-layers";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { GeocoderControl } from "@/components/geocoder-control";
import { MapLegend } from "@/components/map-legend";
import type { MapLayer } from "@/lib/types";

// ─── colour helpers ───────────────────────────────────────────────────────────
function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// ─── tile URL ─────────────────────────────────────────────────────────────────
function buildTileUrl(layer: MapLayer): string {
  const params = new URLSearchParams({
    dsn: layer.dsn,
    schema: layer.table.table_schema,
    table: layer.table.table_name,
    geomCol: layer.table.geom_col ?? "geom",
    srid: String(layer.table.srid ?? 4326),
  });
  const validFilters = layer.filters.filter((f) => {
    if (!f.column || !f.operator) return false;
    if (f.operator === "is_null" || f.operator === "is_not_null") return true;
    return (f.value ?? "").trim() !== "";
  });
  if (validFilters.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    params.set("filters", JSON.stringify(validFilters.map(({ id, ...rest }) => rest)));
  }
  if (layer.dataVersion !== undefined) params.set("v", String(layer.dataVersion));
  return `/api/pg/tiles/{z}/{x}/{y}?${params.toString()}`;
}

// ─── basemap definitions ──────────────────────────────────────────────────────
const SATELLITE_STYLE = {
  version: 8 as const,
  sources: {
    "esri-satellite": {
      type: "raster" as const,
      tiles: ["https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      attribution: "Esri, Maxar, Earthstar Geographics",
    },
  },
  layers: [{ id: "esri-satellite", type: "raster" as const, source: "esri-satellite" }],
};

const BASEMAPS: Record<string, { label: string; style: string | typeof SATELLITE_STYLE }> = {
  liberty:   { label: "Liberty",   style: "https://tiles.openfreemap.org/styles/liberty" },
  bright:    { label: "Bright",    style: "https://tiles.openfreemap.org/styles/bright" },
  positron:  { label: "Positron",  style: "https://tiles.openfreemap.org/styles/positron" },
  satellite: { label: "Satellite", style: SATELLITE_STYLE },
};
type BasemapKey = keyof typeof BASEMAPS;

const BLANK_STYLE = {
  version: 8 as const,
  sources: {},
  layers: [],
  glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
};


// ─── types ────────────────────────────────────────────────────────────────────
interface Selection { feature: any; layer: MapLayer; }
export type ZoomTarget = { bounds: [[number, number], [number, number]] };

// ─── props ────────────────────────────────────────────────────────────────────
export interface MapView { longitude: number; latitude: number; zoom: number; }

interface Props {
  layers: MapLayer[];
  activeLayerId?: string | null;
  onActiveLayerChange?: (id: string | null) => void;
  onLayerDataChanged?: (layerId: string) => void;
  flyTo?: ZoomTarget | null;
  basemap?: string;
  initialView?: MapView;
  onViewChange?: (view: MapView) => void;
}

// ─── component ────────────────────────────────────────────────────────────────
export default function MaplibreMap({
  layers,
  flyTo,
  basemap: basemapProp,
  initialView,
  onViewChange,
}: Props) {
  const mapRef = React.useRef<any>(null);
  const basemap = basemapProp ?? "";

  // ── selection / properties dialog
  const [selection, setSelection] = React.useState<Selection | null>(null);
  const [isPropsOpen, setIsPropsOpen] = React.useState(false);
  const [zoom, setZoom] = React.useState(4);

  // ── DeckGL overlay (stable reference)
  const overlay = React.useMemo(() => new MapboxOverlay({ interleaved: false }), []);


  // ─── basemap style resolver ──────────────────────────────────────────────
  function resolveBasemapStyle() {
    if (!basemap) return BLANK_STYLE as any;
    if (basemap in BASEMAPS) return BASEMAPS[basemap as BasemapKey].style as any;
    return BLANK_STYLE as any;
  }

  // ─── fly to bounds ────────────────────────────────────────────────────────
  React.useEffect(() => {
    if (!flyTo) return;
    const map = mapRef.current?.getMap();
    if (map) map.fitBounds(flyTo.bounds, { padding: 60, maxZoom: 18 });
  }, [flyTo]);

  // ─── DeckGL deck layers ───────────────────────────────────────────────────
  const deckLayers = React.useMemo(() => {
    const mvtLayers = layers
      .filter((l) => l.visible && l.table.geom_col)
      .map((layer) => {
        const fillRgb = hexToRgb(layer.style.color);
        const strokeRgb = hexToRgb(layer.style.strokeColor ?? "#ffffff");
        const fillAlpha = Math.round(layer.style.opacity * 255);
        const strokeAlpha = Math.round((layer.style.strokeOpacity ?? 1) * 255);
        const tileUrl = buildTileUrl(layer);
        return new MVTLayer({
          id: `layer-${layer.id}`,
          data: tileUrl,
          minZoom: 0,
          maxZoom: 14,
          refinementStrategy: "best-available",
          pickable: true,
          autoHighlight: true,
          pointType: "circle",
          getPointRadius: layer.style.radiusScale
            ? (d: any) => {
                const rs = layer.style.radiusScale!;
                const v = Number(d.properties?.[rs.column] ?? 0);
                const t = rs.maxValue === rs.minValue
                  ? 0
                  : Math.max(0, Math.min(1, (v - rs.minValue) / (rs.maxValue - rs.minValue)));
                return rs.minRadius + t * (rs.maxRadius - rs.minRadius);
              }
            : layer.style.radius,
          pointRadiusUnits: "pixels",
          getFillColor: (layer.style.categoricalFill ?? null)
            ? (d: any) => {
                const cf = layer.style.categoricalFill!;
                const val = String(d.properties?.[cf.column] ?? "");
                const rule = cf.rules.find((r) => r.value === val);
                const rgb = hexToRgb(rule ? rule.color : cf.defaultColor);
                return [...rgb, fillAlpha] as [number, number, number, number];
              }
            : (layer.style.opacityScale ?? null)
            ? (d: any) => {
                const s = layer.style.opacityScale!;
                const v = Number(d.properties?.[s.column] ?? 0);
                const t = s.maxValue === s.minValue ? 0 : Math.max(0, Math.min(1, (v - s.minValue) / (s.maxValue - s.minValue)));
                const alpha = Math.round((s.minOutput + t * (s.maxOutput - s.minOutput)) * 255);
                return [...fillRgb, alpha] as [number, number, number, number];
              }
            : [...fillRgb, fillAlpha] as [number, number, number, number],
          getLineColor: (layer.style.categoricalStroke ?? null)
            ? (d: any) => {
                const cs = layer.style.categoricalStroke!;
                const val = String(d.properties?.[cs.column] ?? "");
                const rule = cs.rules.find((r) => r.value === val);
                const rgb = hexToRgb(rule ? rule.color : cs.defaultColor);
                return [...rgb, strokeAlpha] as [number, number, number, number];
              }
            : (layer.style.strokeOpacityScale ?? null)
            ? (d: any) => {
                const s = layer.style.strokeOpacityScale!;
                const v = Number(d.properties?.[s.column] ?? 0);
                const t = s.maxValue === s.minValue ? 0 : Math.max(0, Math.min(1, (v - s.minValue) / (s.maxValue - s.minValue)));
                const alpha = Math.round((s.minOutput + t * (s.maxOutput - s.minOutput)) * 255);
                return [...strokeRgb, alpha] as [number, number, number, number];
              }
            : [...strokeRgb, strokeAlpha] as [number, number, number, number],
          getLineWidth: (layer.style.lineWidthScale ?? null)
            ? (d: any) => {
                const s = layer.style.lineWidthScale!;
                const v = Number(d.properties?.[s.column] ?? 0);
                const t = s.maxValue === s.minValue ? 0 : Math.max(0, Math.min(1, (v - s.minValue) / (s.maxValue - s.minValue)));
                return s.minOutput + t * (s.maxOutput - s.minOutput);
              }
            : layer.style.lineWidth,
          lineWidthUnits: "pixels",
          updateTriggers: {
            getPointRadius: [layer.style.radius, layer.style.radiusScale],
            getFillColor: [layer.style.color, layer.style.opacity, layer.style.opacityScale, layer.style.categoricalFill],
            getLineColor: [layer.style.strokeColor, layer.style.strokeOpacity, layer.style.categoricalStroke, layer.style.strokeOpacityScale],
            getLineWidth: [layer.style.lineWidth, layer.style.lineWidthScale],
          },
          onClick: (info: any) => {
            if (!info.object) return;
            const mapLayerId = (info.layer?.id ?? "").replace(/^layer-/, "");
            const mapLayer = layers.find((l) => l.id === mapLayerId) ?? null;
            if (!mapLayer) return;
            setSelection({ feature: info.object, layer: mapLayer });
            setIsPropsOpen(true);
          },
        });
      });

    return mvtLayers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layers]);

  // ─── overlay drag events ──────────────────────────────────────────────────
  const onLoad = React.useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    map.addControl(overlay);
    overlay.setProps({ layers: deckLayers });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlay]);

  React.useEffect(() => {
    overlay.setProps({
      layers: deckLayers,
      getCursor: ({ isHovering }: { isHovering: boolean }) => isHovering ? "pointer" : "",
      onHover: (info: any) => {
        const canvas = mapRef.current?.getMap()?.getCanvas();
        if (!canvas) return;
        canvas.style.cursor = info.object ? "pointer" : "";
      },
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlay, deckLayers]);

  // ─── render ──────────────────────────────────────────────────────────────
  return (
    <>
      {layers.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <p className="text-slate-400 text-sm">Add a layer from the sidebar to get started.</p>
        </div>
      )}

      <Map
        ref={mapRef}
        onLoad={onLoad}
        onZoom={(e) => setZoom(e.viewState.zoom)}
        initialViewState={initialView ?? { longitude: -98.5556199, latitude: 39.8097343, zoom: 4 }}
        onMoveEnd={(e) => onViewChange?.({ longitude: e.viewState.longitude, latitude: e.viewState.latitude, zoom: e.viewState.zoom })}
        style={{ width: "100%", height: "100%" }}
        mapStyle={resolveBasemapStyle()}
      />

      <div className="absolute bottom-8 right-2 z-10 pointer-events-none bg-black/50 text-white text-xs font-mono px-1.5 py-0.5 rounded">
        z{zoom.toFixed(1)}
      </div>

      <GeocoderControl
        onSelect={(lng, lat, zoom) => {
          mapRef.current?.getMap().flyTo({ center: [lng, lat], zoom });
        }}
      />

      <MapLegend layers={layers} />

      {/* ── Feature properties dialog ── */}
      <Dialog open={isPropsOpen} onOpenChange={setIsPropsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Feature Properties</DialogTitle>
            <DialogDescription>
              {selection
                ? `${selection.layer.table.table_schema}.${selection.layer.table.table_name}`
                : "Attributes for the selected feature"}
            </DialogDescription>
          </DialogHeader>
          {selection && (
            <ScrollArea className="max-h-[50vh] mt-2">
              <div className="space-y-0">
                {Object.entries(selection.feature.properties || {}).map(([key, value]) => (
                  <div key={key} className="py-2 border-b last:border-0">
                    <span className="text-xs font-medium capitalize text-muted-foreground block" title={key}>{key.replace(/_/g, " ")}</span>
                    <span className="text-sm break-words whitespace-pre-wrap" title={String(value)}>{String(value)}</span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
