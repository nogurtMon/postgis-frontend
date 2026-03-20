"use client";
import React from "react";
import MaplibreMap from "../components/maplibre-map";
import { SettingsDialog } from "../components/settings-dialog";
import { TableSidebar } from "../components/table-sidebar";
import { useDsn } from "../hooks/use-dsn";
import { LAYER_COLORS, DEFAULT_STYLE } from "../lib/types";
import type { TableRow, MapLayer } from "../lib/types";
import { Button } from "@/components/ui/button";
import { Settings } from "lucide-react";
import { ModeToggle } from "@/components/mode-toggle";

export default function Home() {
  const { dsn, setDsn } = useDsn();
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [layers, setLayers] = React.useState<MapLayer[]>([]);

  // Clear layers when DSN changes
  React.useEffect(() => { setLayers([]); }, [dsn]);

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
        />
        <div className="flex-1 relative">
          <MaplibreMap layers={layers} />
        </div>
      </div>

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        dsn={dsn}
        onSave={setDsn}
      />
    </div>
  );
}
