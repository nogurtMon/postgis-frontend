"use client";
import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy, Check } from "lucide-react";
import type { MapLayer } from "@/lib/types";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  layers: MapLayer[];
  basemap: string;
}

export interface ShareState {
  layers: Array<{
    id: string;
    table: MapLayer["table"];
    visible: boolean;
    style: MapLayer["style"];
    filters: MapLayer["filters"];
    geomTypeOverride?: string | null;
  }>;
  basemap: string;
}

export function encodeShareState(state: ShareState): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(state))));
}

export function decodeShareState(encoded: string): ShareState | null {
  try {
    return JSON.parse(decodeURIComponent(escape(atob(encoded))));
  } catch {
    return null;
  }
}

export function ShareDialog({ open, onOpenChange, layers, basemap }: Props) {
  const [copied, setCopied] = React.useState(false);

  const shareState: ShareState = {
    layers: layers.map(l => ({
      id: l.id,
      table: l.table,
      visible: l.visible,
      style: l.style,
      filters: l.filters,
      geomTypeOverride: l.geomTypeOverride,
    })),
    basemap,
  };

  const encoded = encodeShareState(shareState);
  const shareUrl = typeof window !== "undefined"
    ? `${window.location.origin}/share#${encoded}`
    : "";

  async function copy() {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Share Map View</DialogTitle>
          <DialogDescription>
            This link encodes your current layers, styles, and filters. Anyone with database access can open it and see the same map configuration.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="flex gap-2">
            <Input value={shareUrl} readOnly className="font-mono text-xs flex-1" onClick={e => (e.target as HTMLInputElement).select()} />
            <Button size="sm" variant="outline" className="shrink-0" onClick={copy}>
              {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>

          <div className="bg-muted/40 rounded px-3 py-2 text-xs space-y-1 text-muted-foreground">
            <p><span className="font-medium text-foreground">What's included:</span> layer selection, styles, filters, basemap.</p>
            <p><span className="font-medium text-foreground">What's not included:</span> database credentials. The viewer will need to connect their own database to render the layers.</p>
            <p className="pt-1">{layers.length} {layers.length === 1 ? "layer" : "layers"} encoded.</p>
          </div>

          <div className="flex justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
