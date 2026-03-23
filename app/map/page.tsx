"use client";
import React from "react";
import dynamic from "next/dynamic";
const MaplibreMap = dynamic(() => import("@/components/maplibre-map"), { ssr: false });
import { SettingsDialog } from "@/components/settings-dialog";
import { TableSidebar } from "@/components/table-sidebar";
import { useDsn } from "@/hooks/use-dsn";
import { LAYER_COLORS, DEFAULT_STYLE } from "@/lib/types";
import type { TableRow, MapLayer, BasemapDef } from "@/lib/types";
import type { ZoomTarget } from "@/components/maplibre-map";

import { Button } from "@/components/ui/button";
import { Settings } from "lucide-react";
import { ModeToggle } from "@/components/mode-toggle";

function dbLabel(dsn: string) {
  try {
    const url = new URL(dsn);
    return `${url.hostname}${url.pathname}`;
  } catch { return dsn.slice(0, 40); }
}

const LAYERS_KEY = "postgis-layers";
const DSN_LS_KEY = "pg_dsn"; // must match the key used in use-dsn.ts
const CUSTOM_BASEMAPS_KEY = "postgis-custom-basemaps";

function loadLayers(dsn: string): MapLayer[] {
  try {
    const all = JSON.parse(localStorage.getItem(LAYERS_KEY) ?? "{}");
    return (all[dsn] ?? []).map((l: MapLayer) => ({ ...l, dataVersion: 0 }));
  } catch { return []; }
}

function saveLayers(dsn: string, layers: MapLayer[]) {
  try {
    const all = JSON.parse(localStorage.getItem(LAYERS_KEY) ?? "{}");
    all[dsn] = layers;
    localStorage.setItem(LAYERS_KEY, JSON.stringify(all));
  } catch {}
}

function loadCustomBasemaps(): BasemapDef[] {
  try { return JSON.parse(localStorage.getItem(CUSTOM_BASEMAPS_KEY) ?? "[]"); }
  catch { return []; }
}

export default function Home() {
  const { dsn, setDsn, loaded } = useDsn();
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [layers, setLayers] = React.useState<MapLayer[]>([]);
  const [drawLayer, setDrawLayer] = React.useState<MapLayer | null>(null);
  const [zoomTarget, setZoomTarget] = React.useState<ZoomTarget | null>(null);
  const [basemap, setBasemap] = React.useState("liberty");
  const [customBasemaps, setCustomBasemaps] = React.useState<BasemapDef[]>(() => loadCustomBasemaps());

  async function zoomToLayer(layer: MapLayer) {
    try {
      const res = await fetch("/api/pg/extent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dsn: layer.dsn,
          schema: layer.table.table_schema,
          table: layer.table.table_name,
          geomCol: layer.table.geom_col,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) return;
      setZoomTarget({ bounds: [[data.xmin, data.ymin], [data.xmax, data.ymax]] });
    } catch {}
  }

  // Load layers once on mount — read DSN directly from localStorage so there's
  // no timing dependency on the useDsn state being populated yet.
  React.useEffect(() => {
    const storedDsn = localStorage.getItem(DSN_LS_KEY) ?? "";
    if (storedDsn) setLayers(loadLayers(storedDsn));
  }, []);

  // Auto-open settings on first load if no database is configured
  React.useEffect(() => {
    if (loaded && !dsn) setSettingsOpen(true);
  }, [loaded]);

  // Clear layers on disconnect
  React.useEffect(() => {
    if (loaded && !dsn) setLayers([]);
  }, [dsn, loaded]);

  // Persist whenever layers change — guard with loaded+dsn so we never
  // save before the DSN is known or while disconnected.
  React.useEffect(() => {
    if (!loaded || !dsn) return;
    saveLayers(dsn, layers);
  }, [layers, loaded, dsn]);

  function addLayer(table: TableRow) {
    const key = `${table.table_schema}.${table.table_name}`;
    if (layers.some((l) => `${l.table.table_schema}.${l.table.table_name}` === key)) return;
    const color = LAYER_COLORS[layers.length % LAYER_COLORS.length];
    setLayers((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        table,
        dsn,
        visible: true,
        style: { ...DEFAULT_STYLE, color },
        filters: [],
      },
    ]);
  }

  function removeLayer(id: string) {
    setLayers((prev) => prev.filter((l) => l.id !== id));
  }

  function updateLayer(id: string, patch: Partial<MapLayer>) {
    setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  function onLayerDataChanged(id: string) {
    setLayers((prev) =>
      prev.map((l) => l.id === id ? { ...l, dataVersion: (l.dataVersion ?? 0) + 1 } : l)
    );
  }

  function reorderLayers(newOrder: string[]) {
    setLayers((prev) => newOrder.map((id) => prev.find((l) => l.id === id)!).filter(Boolean));
  }

  function addCustomBasemap(b: BasemapDef) {
    setCustomBasemaps((prev) => {
      const next = [...prev, b];
      localStorage.setItem(CUSTOM_BASEMAPS_KEY, JSON.stringify(next));
      return next;
    });
  }

  function removeCustomBasemap(key: string) {
    setCustomBasemaps((prev) => {
      const next = prev.filter((b) => b.key !== key);
      localStorage.setItem(CUSTOM_BASEMAPS_KEY, JSON.stringify(next));
      if (basemap === key) setBasemap("");
      return next;
    });
  }

  return (
    <div className="h-screen overflow-hidden grid grid-rows-[auto_1fr]">
      <header className="bg-background border-b px-3 py-1 flex items-center justify-between gap-4 text-[11px] font-mono shrink-0">
        {/* Brand */}
        <span className="flex items-center gap-1.5 font-bold tracking-widest text-primary uppercase text-xs shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/favicon.ico" alt="" className="w-4 h-4 shrink-0" />
          PostGIS-Frontend
        </span>

        {/* Connection status — click to open settings */}
        <button
          className="flex items-center gap-1.5 min-w-0 hover:text-foreground text-muted-foreground transition-colors"
          onClick={() => setSettingsOpen(true)}
          title="Connection settings"
        >
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dsn ? "bg-green-500" : "bg-red-500"}`} />
          <span className="truncate max-w-xs">
            {dsn ? dbLabel(dsn) : "NOT CONNECTED"}
          </span>
        </button>

        {/* Right actions */}
        <div className="flex items-center gap-2 shrink-0">
          {layers.length > 0 && (
            <span className="text-muted-foreground tabular-nums">
              {layers.length} {layers.length === 1 ? "LAYER" : "LAYERS"}
            </span>
          )}
          <ModeToggle />
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setSettingsOpen(true)} title="Connection settings">
            <Settings className="h-3.5 w-3.5" />
          </Button>
        </div>
      </header>

      <div className="flex overflow-hidden">
        <TableSidebar
          dsn={dsn}
          layers={layers}
          onAddLayer={addLayer}
          onRemoveLayer={removeLayer}
          onUpdateLayer={updateLayer}
          onReorderLayers={reorderLayers}
          drawLayerId={drawLayer?.id ?? null}
          onStartDraw={setDrawLayer}
          onStopDraw={() => setDrawLayer(null)}
          onZoomToLayer={zoomToLayer}
          onOpenSettings={() => setSettingsOpen(true)}
          basemap={basemap}
          onBasemapChange={setBasemap}
          customBasemaps={customBasemaps}
          onAddCustomBasemap={addCustomBasemap}
          onRemoveCustomBasemap={removeCustomBasemap}
        />
        <div className="flex-1 relative">
          <MaplibreMap
            layers={layers}
            drawLayer={drawLayer}
            onCancelDraw={() => setDrawLayer(null)}
            onLayerDataChanged={onLayerDataChanged}
            basemap={basemap}
            customBasemaps={customBasemaps}
          />
        </div>
      </div>

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        dsn={dsn}
        onSave={setDsn}
        onDisconnect={() => setDsn("")}
      />
    </div>
  );
}
