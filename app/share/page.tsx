"use client";
import React from "react";
import dynamic from "next/dynamic";
import { decodeShareState } from "@/components/share-dialog";
import { SettingsDialog } from "@/components/settings-dialog";
import { useDsn } from "@/hooks/use-dsn";
import { DEFAULT_STYLE, LAYER_COLORS } from "@/lib/types";
import type { MapLayer } from "@/lib/types";
import type { ZoomTarget } from "@/components/maplibre-map";
import { Button } from "@/components/ui/button";
import { Settings, Share2 } from "lucide-react";
import { ModeToggle } from "@/components/mode-toggle";

const MaplibreMap = dynamic(() => import("@/components/maplibre-map"), { ssr: false });

export default function SharePage() {
  const { dsn, setDsn, loaded } = useDsn();
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [layers, setLayers] = React.useState<MapLayer[]>([]);
  const [basemap, setBasemap] = React.useState("liberty");
  const [decoded, setDecoded] = React.useState(false);
  const [zoomTarget] = React.useState<ZoomTarget | null>(null);

  // Decode share state from URL hash
  React.useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    const state = decodeShareState(hash);
    if (!state) return;
    setBasemap(state.basemap ?? "liberty");
    setDecoded(true);
    // Store layers without DSN — will be filled in when DSN is set
    const pending = state.layers.map((l, i) => ({
      ...l,
      dsn: "",
      dataVersion: 0,
      style: { ...DEFAULT_STYLE, ...l.style },
      filters: l.filters ?? [],
    }));
    setLayers(pending as MapLayer[]);
  }, []);

  // Once DSN is known, attach it to all layers
  React.useEffect(() => {
    if (!dsn || !decoded) return;
    setLayers(prev => prev.map(l => ({ ...l, dsn })));
  }, [dsn, decoded]);

  // Auto-open settings if no connection
  React.useEffect(() => {
    if (loaded && !dsn) setSettingsOpen(true);
  }, [loaded]);

  return (
    <div className="h-screen overflow-hidden grid grid-rows-[auto_1fr]">
      <header className="bg-background border-b px-3 py-1 flex items-center justify-between gap-4 text-[11px] font-mono shrink-0">
        <span className="flex items-center gap-1.5 font-bold tracking-widest text-primary uppercase text-xs shrink-0">
          <img src="/favicon.ico" alt="" className="w-4 h-4 shrink-0" />
          PostGIS-Frontend
          <span className="text-[10px] text-muted-foreground font-normal normal-case tracking-normal ml-1">shared view</span>
        </span>

        <button
          className="flex items-center gap-1.5 min-w-0 hover:text-foreground text-muted-foreground transition-colors"
          onClick={() => setSettingsOpen(true)}
        >
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dsn ? "bg-green-500" : "bg-red-500"}`} />
          <span className="truncate max-w-xs text-xs">
            {dsn ? "Connected" : "Connect to view layers"}
          </span>
        </button>

        <div className="flex items-center gap-2 shrink-0">
          <ModeToggle />
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setSettingsOpen(true)}>
            <Settings className="h-3.5 w-3.5" />
          </Button>
        </div>
      </header>

      <div className="relative">
        <MaplibreMap
          layers={layers}
          basemap={basemap}
          customBasemaps={[]}
        />
        {!dsn && loaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm">
            <div className="text-center space-y-3 max-w-xs">
              <Share2 className="h-8 w-8 mx-auto text-muted-foreground" />
              <p className="text-sm font-medium">Connect your database to view this shared map</p>
              <p className="text-xs text-muted-foreground">The layer configurations are encoded in this URL. You need database access to render the data.</p>
              <Button size="sm" onClick={() => setSettingsOpen(true)}>Connect database</Button>
            </div>
          </div>
        )}
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
