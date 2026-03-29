"use client";
import React from "react";
import dynamic from "next/dynamic";
import { decodeShareState } from "@/components/share-dialog";
import { DEFAULT_STYLE, BASEMAP_OPTIONS } from "@/lib/types";
import type { MapLayer } from "@/lib/types";
import Link from "next/link";
import { ModeToggle } from "@/components/mode-toggle";

const MaplibreMap = dynamic(() => import("@/components/maplibre-map"), { ssr: false });

export default function SharePage() {
  const [layers, setLayers] = React.useState<MapLayer[]>([]);
  const [basemap, setBasemap] = React.useState("liberty");
  const [initialView, setInitialView] = React.useState<{ longitude: number; latitude: number; zoom: number } | undefined>(undefined);
  const [status, setStatus] = React.useState<"loading" | "ready" | "error">("loading");

  const [isEmbed, setIsEmbed] = React.useState(false);
  React.useEffect(() => {
    try { setIsEmbed(window.self !== window.top); } catch { setIsEmbed(true); }
  }, []);

  React.useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!hash) { setStatus("error"); return; }
    const state = decodeShareState(hash);
    if (!state) { setStatus("error"); return; }
    setBasemap(state.basemap ?? "liberty");
    if (state.view) setInitialView(state.view);
    setLayers(state.layers.map((l) => ({
      ...l,
      dsn: l.dsn ?? "",
      dataVersion: 0,
      style: { ...DEFAULT_STYLE, ...l.style },
      filters: l.filters ?? [],
    })) as MapLayer[]);
    setStatus("ready");
  }, []);

  if (status === "loading") {
    return <div className="h-screen flex items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  }

  if (status === "error") {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center space-y-3 max-w-xs">
          <p className="text-sm font-medium">Share link not found or invalid.</p>
          <Link href="/map" className="text-xs text-muted-foreground underline underline-offset-2">Open app</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-hidden flex flex-col">
      {!isEmbed && (
        <header className="bg-background border-b px-3 py-1 flex items-center justify-between gap-4 text-[11px] font-mono shrink-0">
          <Link href="/map" className="flex items-center gap-1.5 font-bold tracking-widest text-primary uppercase text-xs shrink-0 hover:opacity-80 transition-opacity">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/favicon.ico" alt="" className="w-4 h-4 shrink-0" />
            PostGIS-Frontend
          </Link>
          <span className="text-muted-foreground text-[10px]">
            shared view · {layers.length} {layers.length === 1 ? "layer" : "layers"}
          </span>
          <ModeToggle />
        </header>
      )}
      <div className="flex-1 relative">
        <MaplibreMap layers={layers} basemap={basemap} initialView={initialView} />
        <div className="absolute top-2 right-2 z-10 flex gap-1 bg-background/80 backdrop-blur-sm border rounded-md px-1.5 py-1 shadow-sm">
          {BASEMAP_OPTIONS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setBasemap(key)}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                basemap === key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
