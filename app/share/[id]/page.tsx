"use client";
import React from "react";
import dynamic from "next/dynamic";
import { use } from "react";
import { DEFAULT_STYLE } from "@/lib/types";
import type { MapLayer } from "@/lib/types";
import Link from "next/link";

const MaplibreMap = dynamic(() => import("@/components/maplibre-map"), { ssr: false });

export default function ShareViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [layers, setLayers] = React.useState<MapLayer[]>([]);
  const [basemap, setBasemap] = React.useState("liberty");
  const [status, setStatus] = React.useState<"loading" | "ready" | "error">("loading");
  const [errorMsg, setErrorMsg] = React.useState("");

  // Check if opened inside an iframe (embed mode)
  const [isEmbed, setIsEmbed] = React.useState(false);
  React.useEffect(() => {
    try { setIsEmbed(window.self !== window.top); } catch { setIsEmbed(true); }
  }, []);

  React.useEffect(() => {
    fetch(`/api/share/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 404 ? "Share link not found." : "Failed to load share.");
        return r.json();
      })
      .then((config) => {
        setBasemap(config.basemap ?? "liberty");
        const loaded: MapLayer[] = (config.layers ?? []).map((l: any) => ({
          ...l,
          dataVersion: 0,
          style: { ...DEFAULT_STYLE, ...l.style },
          filters: l.filters ?? [],
        }));
        setLayers(loaded);
        setStatus("ready");
      })
      .catch((e) => {
        setErrorMsg(e.message ?? "Unknown error");
        setStatus("error");
      });
  }, [id]);

  if (status === "loading") {
    return (
      <div className="h-screen flex items-center justify-center text-sm text-muted-foreground">
        Loading shared map…
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center space-y-3 max-w-xs">
          <p className="text-sm font-medium">{errorMsg}</p>
          <Link href="/" className="text-xs text-muted-foreground underline underline-offset-2">
            Go to PostGIS Frontend
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-hidden flex flex-col">
      {!isEmbed && (
        <header className="bg-background border-b px-3 py-1 flex items-center justify-between gap-4 text-[11px] font-mono shrink-0">
          <Link href="/" className="flex items-center gap-1.5 font-bold tracking-widest text-primary uppercase text-xs shrink-0 hover:opacity-80 transition-opacity">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/favicon.ico" alt="" className="w-4 h-4 shrink-0" />
            PostGIS-Frontend
          </Link>
          <span className="text-muted-foreground text-[10px] font-normal normal-case tracking-normal">
            shared view · {layers.length} {layers.length === 1 ? "layer" : "layers"}
          </span>
          <Link
            href="/map"
            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            Open app →
          </Link>
        </header>
      )}
      <div className="flex-1 relative">
        <MaplibreMap layers={layers} basemap={basemap} />
      </div>
    </div>
  );
}
