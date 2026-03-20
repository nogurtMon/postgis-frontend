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
import type { MapLayer } from "@/lib/types";

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function buildTileUrl(layer: MapLayer): string {
  const params = new URLSearchParams({
    dsn: layer.dsn,
    schema: layer.table.table_schema,
    table: layer.table.table_name,
    geomCol: layer.table.geom_col ?? "geom",
  });
  const validFilters = layer.filters.filter((f) => f.column.trim());
  if (validFilters.length > 0) {
    params.set("filters", JSON.stringify(validFilters.map((f) => ({
      column: f.column,
      operator: f.operator,
      value: f.value,
    }))));
  }
  return `/api/pg/tiles/{z}/{x}/{y}?${params.toString()}`;
}

export default function MaplibreMap({ layers }: { layers: MapLayer[] }) {
  const mapRef = React.useRef<any>(null);
  const [selectedPoint, setSelectedPoint] = React.useState<any>(null);
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);

  const overlay = React.useMemo(() => new MapboxOverlay({ interleaved: false }), []);

  const deckLayers = React.useMemo(() => {
    return layers
      .filter((l) => l.visible && l.table.geom_col)
      .map((layer) => {
        const rgb = hexToRgb(layer.style.color);
        const alpha = Math.round(layer.style.opacity * 255);
        const tileUrl = buildTileUrl(layer);
        const geomType = layer.table.geom_type?.toLowerCase() ?? "";
        const isLine = geomType.includes("linestring");

        return new MVTLayer({
          id: `layer-${layer.id}`,
          data: tileUrl,
          minZoom: 0,
          maxZoom: 20,
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
          getFillColor: [...rgb, alpha] as [number, number, number, number],
          getLineColor: isLine ? [...rgb, alpha] as [number, number, number, number] : [...hexToRgb(layer.style.strokeColor ?? "#ffffff"), alpha] as [number, number, number, number],
          getLineWidth: layer.style.lineWidth,
          lineWidthUnits: "pixels",
          updateTriggers: {
            getPointRadius: [layer.style.radius, layer.style.radiusScale],
            getFillColor: [layer.style.color, layer.style.opacity],
            getLineColor: [layer.style.color, layer.style.strokeColor, layer.style.opacity],
          },
          onClick: (info: any) => {
            if (info.object) {
              setSelectedPoint(info.object);
              setIsDialogOpen(true);
            }
          },
        });
      });
    // layers last = top of visual stack in deck.gl
  }, [layers]);

  const onLoad = React.useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    map.addControl(overlay);
    overlay.setProps({ layers: deckLayers });
  }, [overlay, deckLayers]);

  React.useEffect(() => {
    overlay.setProps({ layers: deckLayers });
  }, [overlay, deckLayers]);

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
        initialViewState={{ longitude: -98.5556199, latitude: 39.8097343, zoom: 4 }}
        style={{ width: "100%", height: "100%" }}
        mapStyle="https://api.maptiler.com/maps/hybrid/style.json?key=GYDRZyFt8oPZKclvC77i"
      />

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Feature Properties</DialogTitle>
            <DialogDescription>Attributes for the selected feature</DialogDescription>
          </DialogHeader>
          {selectedPoint && (
            <ScrollArea className="max-h-[60vh] mt-2">
              <div className="space-y-0">
                {Object.entries(selectedPoint.properties || {}).map(([key, value]) => (
                  <div key={key} className="flex items-start justify-between gap-4 py-2 border-b last:border-0">
                    <span className="text-sm font-medium capitalize shrink-0">{key.replace(/_/g, " ")}</span>
                    <span className="text-sm text-muted-foreground text-right break-all">{String(value)}</span>
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
