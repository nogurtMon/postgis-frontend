"use client";
import React from "react";
import Map from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { MVTLayer } from "@deck.gl/geo-layers";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RowFormDialog } from "@/components/row-form-dialog";
import { GeocoderControl } from "@/components/geocoder-control";
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
    srid: String(layer.table.srid ?? 4326),
  });
  const validFilters = layer.filters.filter((f) => f.column.trim());
  if (validFilters.length > 0) {
    params.set("filters", JSON.stringify(validFilters.map((f) => ({
      column: f.column,
      operator: f.operator,
      value: f.value,
    }))));
  }
  if (layer.dataVersion !== undefined) {
    params.set("v", String(layer.dataVersion));
  }
  return `/api/pg/tiles/{z}/{x}/{y}?${params.toString()}`;
}

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

interface Selection {
  feature: any;
  layer: MapLayer;
}

interface RowFormState {
  mode: "insert" | "edit";
  layer: MapLayer;
  lng: number;
  lat: number;
  initialProps?: Record<string, any>;
}

interface Props {
  layers: MapLayer[];
  drawLayer?: MapLayer | null;
  onCancelDraw?: () => void;
  onLayerDataChanged?: (layerId: string) => void;
}

export default function MaplibreMap({ layers, drawLayer, onCancelDraw, onLayerDataChanged }: Props) {
  const mapRef = React.useRef<any>(null);
  const [selection, setSelection] = React.useState<Selection | null>(null);
  const [isPropsOpen, setIsPropsOpen] = React.useState(false);
  const [deleteConfirming, setDeleteConfirming] = React.useState(false);
  const [deleteLoading, setDeleteLoading] = React.useState(false);
  const [rowFormState, setRowFormState] = React.useState<RowFormState | null>(null);
  const [basemap, setBasemap] = React.useState<BasemapKey>("liberty");
  const [showBasemapPicker, setShowBasemapPicker] = React.useState(false);

  const overlay = React.useMemo(() => new MapboxOverlay({ interleaved: false }), []);

  // Cancel draw mode on Escape
  React.useEffect(() => {
    if (!drawLayer) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancelDraw?.();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawLayer, onCancelDraw]);

  // Draw mode: native map click listener + crosshair cursor
  // Using map.on("click") lets MapLibre handle the event normally (zoom/pan still work)
  React.useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    const canvas = map.getCanvas();

    if (!drawLayer) {
      canvas.style.cursor = "";
      return;
    }

    canvas.style.cursor = "crosshair";

    function handleMapClick(e: any) {
      if (!drawLayer) return;
      setRowFormState({
        mode: "insert",
        layer: drawLayer,
        lng: e.lngLat.lng,
        lat: e.lngLat.lat,
      });
      onCancelDraw?.();
    }

    map.on("click", handleMapClick);
    return () => {
      map.off("click", handleMapClick);
      canvas.style.cursor = "";
    };
  }, [drawLayer, onCancelDraw]);

  // Reset delete confirm when dialog closes
  React.useEffect(() => {
    if (!isPropsOpen) setDeleteConfirming(false);
  }, [isPropsOpen]);

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
          getLineColor: isLine
            ? [...rgb, alpha] as [number, number, number, number]
            : [...hexToRgb(layer.style.strokeColor ?? "#ffffff"), alpha] as [number, number, number, number],
          getLineWidth: layer.style.lineWidth,
          lineWidthUnits: "pixels",
          updateTriggers: {
            getPointRadius: [layer.style.radius, layer.style.radiusScale],
            getFillColor: [layer.style.color, layer.style.opacity],
            getLineColor: [layer.style.color, layer.style.strokeColor, layer.style.opacity],
          },
          onClick: (info: any) => {
            // In draw mode, let the transparent overlay handle clicks
            if (drawLayer) return;
            if (info.object) {
              const deckLayerId: string = info.layer?.id ?? "";
              const mapLayerId = deckLayerId.replace(/^layer-/, "");
              const mapLayer = layers.find((l) => l.id === mapLayerId) ?? null;
              if (mapLayer) {
                setSelection({ feature: info.object, layer: mapLayer });
                setIsPropsOpen(true);
              }
            }
          },
        });
      });
  }, [layers, drawLayer]);

  const onLoad = React.useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    map.addControl(overlay);
    overlay.setProps({ layers: deckLayers });
  }, [overlay, deckLayers]);

  React.useEffect(() => {
    overlay.setProps({
      layers: deckLayers,
      getCursor: ({ isHovering }: { isHovering: boolean }) => {
        if (drawLayer) return "crosshair";
        return isHovering ? "pointer" : "grab";
      },
    });
  }, [overlay, deckLayers, drawLayer]);

  function handleEditClick() {
    if (!selection) return;
    const coords = selection.feature.geometry?.coordinates;
    const lng = Array.isArray(coords) ? coords[0] : 0;
    const lat = Array.isArray(coords) ? coords[1] : 0;
    setRowFormState({
      mode: "edit",
      layer: selection.layer,
      lng,
      lat,
      initialProps: selection.feature.properties ?? {},
    });
    setIsPropsOpen(false);
  }

  async function handleDeleteClick() {
    if (!selection) return;
    if (!deleteConfirming) {
      setDeleteConfirming(true);
      return;
    }
    const id = selection.feature.properties?.id;
    if (id == null) return;
    setDeleteLoading(true);
    try {
      await fetch("/api/pg/rows", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dsn: selection.layer.dsn,
          schema: selection.layer.table.table_schema,
          table: selection.layer.table.table_name,
          id,
        }),
      });
      onLayerDataChanged?.(selection.layer.id);
      setIsPropsOpen(false);
    } finally {
      setDeleteLoading(false);
    }
  }

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
        mapStyle={BASEMAPS[basemap].style as any}
      />

      <GeocoderControl
        onSelect={(lng, lat, zoom) => {
          mapRef.current?.getMap().flyTo({ center: [lng, lat], zoom });
        }}
      />

      {/* Draw mode banner */}
      {drawLayer && (
        <>
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 rounded-full border bg-background/95 px-4 py-2 shadow-md backdrop-blur-sm text-sm pointer-events-auto">
            <span className="text-muted-foreground">
              Click to place a point in{" "}
              <span className="font-mono font-medium text-foreground">
                {drawLayer.table.table_name}
              </span>
            </span>
            <button
              className="text-xs text-muted-foreground hover:text-foreground underline"
              onClick={(e) => { e.stopPropagation(); onCancelDraw?.(); }}
            >
              Cancel
            </button>
          </div>
        </>
      )}

      {/* Basemap picker */}
      <div className="absolute top-2 right-2 z-10 flex flex-col items-end gap-1">
        {showBasemapPicker && (
          <div className="flex flex-col rounded-md border bg-background/95 shadow-sm backdrop-blur-sm overflow-hidden mb-1">
            {Object.entries(BASEMAPS).map(([key, { label }]) => (
              <button
                key={key}
                onClick={() => { setBasemap(key); setShowBasemapPicker(false); }}
                className={`px-3 py-1.5 text-xs text-left transition-colors hover:bg-muted ${
                  basemap === key ? "font-semibold text-primary" : "text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        <button
          onClick={() => setShowBasemapPicker((v) => !v)}
          className="rounded-md border bg-background/90 px-2.5 py-1.5 text-xs font-medium shadow-sm backdrop-blur-sm hover:bg-background transition-colors"
        >
          {BASEMAPS[basemap].label}
        </button>
      </div>

      {/* Feature properties dialog */}
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
            <>
              <ScrollArea className="max-h-[50vh] mt-2">
                <div className="space-y-0">
                  {Object.entries(selection.feature.properties || {}).map(([key, value]) => (
                    <div key={key} className="flex items-start justify-between gap-4 py-2 border-b last:border-0">
                      <span className="text-sm font-medium capitalize shrink-0">{key.replace(/_/g, " ")}</span>
                      <span className="text-sm text-muted-foreground text-right break-all">{String(value)}</span>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              {/* Edit / Delete — only show if table has an id column */}
              {selection.feature.properties?.id != null && (
                <div className="flex items-center justify-between pt-3 border-t mt-2">
                  <div className="flex gap-2">
                    {deleteConfirming ? (
                      <>
                        <span className="text-xs text-destructive self-center">Delete this row?</span>
                        <Button
                          size="sm" variant="destructive"
                          className="h-7 text-xs"
                          onClick={handleDeleteClick}
                          disabled={deleteLoading}
                        >
                          {deleteLoading ? "Deleting…" : "Confirm"}
                        </Button>
                        <Button
                          size="sm" variant="ghost"
                          className="h-7 text-xs"
                          onClick={() => setDeleteConfirming(false)}
                        >
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm" variant="outline"
                        className="h-7 text-xs text-destructive hover:text-destructive"
                        onClick={handleDeleteClick}
                      >
                        Delete
                      </Button>
                    )}
                  </div>
                  <Button size="sm" className="h-7 text-xs" onClick={handleEditClick}>
                    Edit
                  </Button>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Row insert / edit form */}
      {rowFormState && (
        <RowFormDialog
          mode={rowFormState.mode}
          layer={rowFormState.layer}
          lng={rowFormState.lng}
          lat={rowFormState.lat}
          initialProps={rowFormState.initialProps}
          open={true}
          onClose={() => setRowFormState(null)}
          onSaved={(layerId) => {
            onLayerDataChanged?.(layerId);
            setRowFormState(null);
          }}
        />
      )}
    </>
  );
}
