"use client";
import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy, Check, Loader2 } from "lucide-react";
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
    dsn: string;
    visible: boolean;
    style: MapLayer["style"];
    filters: MapLayer["filters"];
    geomTypeOverride?: string | null;
  }>;
  basemap: string;
}

export function encodeShareState(state: ShareState): string {
  const bytes = new TextEncoder().encode(JSON.stringify(state));
  return btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(""));
}

export function decodeShareState(encoded: string): ShareState | null {
  try {
    const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

export function ShareDialog({ open, onOpenChange, layers, basemap }: Props) {
  const [phase, setPhase] = React.useState<"idle" | "saving" | "done" | "error">("idle");
  const [shareUrl, setShareUrl] = React.useState("");
  const [embedCode, setEmbedCode] = React.useState("");
  const [copiedLink, setCopiedLink] = React.useState(false);
  const [copiedEmbed, setCopiedEmbed] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState("");

  // Reset when dialog opens
  React.useEffect(() => {
    if (open) {
      setPhase("idle");
      setShareUrl("");
      setEmbedCode("");
      setErrorMsg("");
    }
  }, [open]);

  async function createShare() {
    setPhase("saving");
    setErrorMsg("");
    try {
      const payload = {
        basemap,
        layers: layers.map((l) => ({
          id: l.id,
          table: l.table,
          dsn: l.dsn,
          visible: l.visible,
          style: l.style,
          filters: l.filters,
          geomTypeOverride: l.geomTypeOverride ?? null,
        })),
      };
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      let data: any = {};
      try { data = JSON.parse(text); } catch {}
      if (!res.ok) throw new Error(data.error ?? `Server error ${res.status}`);
      const url = `${window.location.origin}/share/${data.id}`;
      setShareUrl(url);
      setEmbedCode(`<iframe src="${url}" width="100%" height="500" style="border:none;border-radius:8px;" allowfullscreen></iframe>`);
      setPhase("done");
    } catch (e: any) {
      setErrorMsg(e.message ?? "Unknown error");
      setPhase("error");
    }
  }

  async function copy(text: string, which: "link" | "embed") {
    await navigator.clipboard.writeText(text);
    if (which === "link") {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } else {
      setCopiedEmbed(true);
      setTimeout(() => setCopiedEmbed(false), 2000);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Share Map</DialogTitle>
          <DialogDescription>
            Generate a public read-only link. Anyone with the link can view this map — no account or database credentials needed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {phase === "idle" && (
            <>
              <div className="bg-muted/40 rounded px-3 py-2 text-xs text-muted-foreground space-y-1">
                <p><span className="font-medium text-foreground">Includes:</span> {layers.length} {layers.length === 1 ? "layer" : "layers"}, styles, filters, basemap.</p>
                <p><span className="font-medium text-foreground">Access:</span> Public read-only — no login required to view.</p>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                <Button onClick={createShare}>Generate link</Button>
              </div>
            </>
          )}

          {phase === "saving" && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving…
            </div>
          )}

          {phase === "error" && (
            <>
              <p className="text-sm text-destructive">{errorMsg}</p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
                <Button onClick={createShare}>Retry</Button>
              </div>
            </>
          )}

          {phase === "done" && (
            <>
              <div className="space-y-1.5">
                <p className="text-xs font-medium">Share link</p>
                <div className="flex gap-2">
                  <Input value={shareUrl} readOnly className="font-mono text-xs flex-1" onClick={(e) => (e.target as HTMLInputElement).select()} />
                  <Button size="sm" variant="outline" className="shrink-0" onClick={() => copy(shareUrl, "link")}>
                    {copiedLink ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5">
                <p className="text-xs font-medium">Embed code</p>
                <div className="flex gap-2">
                  <Input value={embedCode} readOnly className="font-mono text-xs flex-1" onClick={(e) => (e.target as HTMLInputElement).select()} />
                  <Button size="sm" variant="outline" className="shrink-0" onClick={() => copy(embedCode, "embed")}>
                    {copiedEmbed ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Paste into any webpage to embed the map as an iframe.</p>
              </div>

              <div className="flex justify-end">
                <Button variant="outline" onClick={() => onOpenChange(false)}>Done</Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
