"use client";
import React from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy, Check, Trash2, RefreshCw, Plus, ExternalLink } from "lucide-react";
import type { MapLayer } from "@/lib/types";
import { encodeShareState, type ShareState } from "@/components/share-dialog";

const STORAGE_KEY = "postgis_saved_views";

interface StoredView {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  state: ShareState;
}

function readViews(): StoredView[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"); }
  catch { return []; }
}

function writeViews(views: StoredView[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(views));
}

function toState(layers: MapLayer[], basemap: string): ShareState {
  return {
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
}

function shareUrl(view: StoredView): string {
  return `${window.location.origin}/share#${encodeShareState(view.state)}`;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  layers: MapLayer[];
  basemap: string;
}

export function SavedViewsDialog({ open, onOpenChange, layers, basemap }: Props) {
  const [views, setViews] = React.useState<StoredView[]>([]);
  const [newName, setNewName] = React.useState("");
  const [showNewForm, setShowNewForm] = React.useState(false);
  const [copied, setCopied] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setViews(readViews());
    setShowNewForm(false);
    setNewName("");
  }, [open]);

  function createView() {
    if (!newName.trim()) return;
    const now = new Date().toISOString();
    const view: StoredView = {
      id: crypto.randomUUID(),
      name: newName.trim(),
      createdAt: now,
      updatedAt: now,
      state: toState(layers, basemap),
    };
    const updated = [...views, view];
    writeViews(updated);
    setViews(updated);
    setNewName("");
    setShowNewForm(false);
  }

  function updateView(id: string) {
    const updated = views.map((v) =>
      v.id === id ? { ...v, state: toState(layers, basemap), updatedAt: new Date().toISOString() } : v
    );
    writeViews(updated);
    setViews(updated);
  }

  function deleteView(id: string) {
    const updated = views.filter((v) => v.id !== id);
    writeViews(updated);
    setViews(updated);
  }

  function copyLink(view: StoredView) {
    navigator.clipboard.writeText(shareUrl(view));
    setCopied(view.id);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Saved Views</DialogTitle>
          <DialogDescription>
            Create shareable read-only map links. Anyone with the link can view — no login needed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-1">
          {views.length === 0 && !showNewForm ? (
            <p className="text-sm text-muted-foreground text-center py-4">No saved views yet.</p>
          ) : (
            <div className="space-y-1">
              {views.map((v) => (
                <div key={v.id} className="flex items-center gap-2 rounded-md border px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{v.name}</p>
                    <p className="text-[10px] text-muted-foreground">{v.state.layers.length} {v.state.layers.length === 1 ? "layer" : "layers"}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <a href={shareUrl(v)} target="_blank" rel="noopener noreferrer" title="Open view">
                      <Button size="icon" variant="ghost" className="h-7 w-7">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </a>
                    <Button size="icon" variant="ghost" className="h-7 w-7" title="Copy link" onClick={() => copyLink(v)}>
                      {copied === v.id ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" title="Update with current map state" onClick={() => updateView(v.id)}>
                      <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" title="Delete view" onClick={() => deleteView(v.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {showNewForm && (
            <div className="flex gap-2">
              <Input
                autoFocus
                placeholder="View name (e.g. Client Projects)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") createView(); if (e.key === "Escape") setShowNewForm(false); }}
                className="text-sm"
              />
              <Button size="sm" onClick={createView} disabled={!newName.trim()}>Save</Button>
              <Button size="sm" variant="ghost" onClick={() => setShowNewForm(false)}>Cancel</Button>
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <p className="text-xs text-muted-foreground">
              {layers.length} {layers.length === 1 ? "layer" : "layers"} in current view
            </p>
            {!showNewForm && (
              <Button size="sm" onClick={() => setShowNewForm(true)} disabled={layers.length === 0}>
                <Plus className="h-3.5 w-3.5 mr-1" /> New View
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
