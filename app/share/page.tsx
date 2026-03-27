"use client";
import React from "react";
import dynamic from "next/dynamic";
import { decodeShareState } from "@/components/share-dialog";
import { DEFAULT_STYLE } from "@/lib/types";
import type { MapLayer } from "@/lib/types";
import Link from "next/link";
import { ModeToggle } from "@/components/mode-toggle";

const MaplibreMap = dynamic(() => import("@/components/maplibre-map"), { ssr: false });

export default function SharePage() {
  const [layers, setLayers] = React.useState<MapLayer[]>([]);
  const [basemap, setBasemap] = React.useState("liberty");
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
          <div className="flex items-center gap-2 shrink-0">
            <ModeToggle />
            <Link href="/map" className="text-[10px] text-muted-foreground hover:text-foreground transition-colors">
              Open app →
            </Link>
          </div>
        </header>
      )}
      <div className="flex-1 relative">
        <MaplibreMap layers={layers} basemap={basemap} />
      </div>
    </div>
  );
}
