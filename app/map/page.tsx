"use client";
import React from "react";
import dynamic from "next/dynamic";
const MaplibreMap = dynamic(() => import("@/components/maplibre-map"), { ssr: false });
import { SettingsDialog } from "@/components/settings-dialog";
import { TableSidebar } from "@/components/table-sidebar";
import { useDsn } from "@/hooks/use-dsn";
import { LAYER_COLORS, DEFAULT_STYLE } from "@/lib/types";
import type { TableRow, MapLayer } from "@/lib/types";

import { Button } from "@/components/ui/button";
import { Settings } from "lucide-react";
import { ModeToggle } from "@/components/mode-toggle";

const LAYERS_KEY = "postgis-layers";
const DSN_LS_KEY = "pg_dsn"; // must match the key used in use-dsn.ts

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

export default function Home() {
  const { dsn, setDsn, loaded } = useDsn();
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [layers, setLayers] = React.useState<MapLayer[]>([]);
  const [drawLayer, setDrawLayer] = React.useState<MapLayer | null>(null);

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

  function moveLayer(id: string, dir: "up" | "down") {
    setLayers((prev) => {
      const i = prev.findIndex((l) => l.id === id);
      if (i < 0) return prev;
      const next = [...prev];
      const swapIdx = dir === "up" ? i + 1 : i - 1;
      if (swapIdx < 0 || swapIdx >= next.length) return prev;
      [next[i], next[swapIdx]] = [next[swapIdx], next[i]];
      return next;
    });
  }

  return (
    <div className="font-sans h-screen overflow-hidden grid grid-rows-[auto_1fr]">
      <header className="bg-background shadow-sm px-4 py-2 border-b">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2 w-40">
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dsn ? "bg-green-500" : "bg-slate-400"}`} />
            <span className="text-xs text-muted-foreground">{dsn ? "Connected" : "Not connected"}</span>
          </div>

          <h1 className="text-lg font-semibold tracking-tight">PostGIS Frontend</h1>

          <div className="flex justify-end w-40">
            <ModeToggle />
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setSettingsOpen(true)}
              title="Connection settings"
            >
              <Settings className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <div className="flex overflow-hidden">
        <TableSidebar
          dsn={dsn}
          layers={layers}
          onAddLayer={addLayer}
          onRemoveLayer={removeLayer}
          onUpdateLayer={updateLayer}
          onMoveLayer={moveLayer}
          drawLayerId={drawLayer?.id ?? null}
          onStartDraw={setDrawLayer}
          onStopDraw={() => setDrawLayer(null)}
        />
        <div className="flex-1 relative">
          <MaplibreMap
            layers={layers}
            drawLayer={drawLayer}
            onCancelDraw={() => setDrawLayer(null)}
            onLayerDataChanged={onLayerDataChanged}
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
