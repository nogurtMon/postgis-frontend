"use client";
import React from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy, Check, Trash2, RefreshCw, Plus, Loader2, ExternalLink } from "lucide-react";
import type { MapLayer } from "@/lib/types";

interface ViewEntry {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  layers: MapLayer[];
  basemap: string;
}

function layerPayload(layers: MapLayer[], basemap: string) {
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

export function SavedViewsDialog({ open, onOpenChange, layers, basemap }: Props) {
  const [views, setViews] = React.useState<ViewEntry[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [showNewForm, setShowNewForm] = React.useState(false);
  const [error, setError] = React.useState("");
  const [copied, setCopied] = React.useState<string | null>(null);
  const [updating, setUpdating] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setError("");
    setShowNewForm(false);
    setNewName("");
    fetchViews();
  }, [open]);

  async function fetchViews() {
    setLoading(true);
    try {
      const res = await fetch("/api/share");
      if (!res.ok) throw new Error("Failed to load views");
      setViews(await res.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function createView() {
    if (!newName.trim()) return;
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...layerPayload(layers, basemap), name: newName.trim() }),
      });
      const text = await res.text();
      let data: any = {};
      try { data = JSON.parse(text); } catch {}
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
      setNewName("");
      setShowNewForm(false);
      await fetchViews();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  }

  async function updateView(id: string) {
    setUpdating(id);
    setError("");
    try {
      const res = await fetch(`/api/share/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(layerPayload(layers, basemap)),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? `Error ${res.status}`);
      }
      await fetchViews();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUpdating(null);
    }
  }

  async function deleteView(id: string) {
    setDeleting(id);
    setError("");
    try {
      await fetch(`/api/share/${id}`, { method: "DELETE" });
      setViews((prev) => prev.filter((v) => v.id !== id));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setDeleting(null);
    }
  }

  function copyLink(id: string) {
    const url = `${window.location.origin}/share/${id}`;
    navigator.clipboard.writeText(url);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  function shareUrl(id: string) {
    return `${window.location.origin}/share/${id}`;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Saved Views</DialogTitle>
          <DialogDescription>
            Create shareable read-only map links for different audiences.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-1">
          {error && <p className="text-xs text-destructive">{error}</p>}

          {/* View list */}
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : views.length === 0 && !showNewForm ? (
            <p className="text-sm text-muted-foreground text-center py-4">No saved views yet.</p>
          ) : (
            <div className="space-y-1">
              {views.map((v) => (
                <div key={v.id} className="flex items-center gap-2 rounded-md border px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{v.name}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{shareUrl(v.id)}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <a href={shareUrl(v.id)} target="_blank" rel="noopener noreferrer" title="Open view">
                      <Button size="icon" variant="ghost" className="h-7 w-7">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </a>
                    <Button size="icon" variant="ghost" className="h-7 w-7" title="Copy link" onClick={() => copyLink(v.id)}>
                      {copied === v.id ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" title="Update with current map state" onClick={() => updateView(v.id)} disabled={updating === v.id}>
                      {updating === v.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" title="Delete view" onClick={() => deleteView(v.id)} disabled={deleting === v.id}>
                      {deleting === v.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* New view form */}
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
              <Button size="sm" onClick={createView} disabled={creating || !newName.trim()}>
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowNewForm(false)}>Cancel</Button>
            </div>
          )}

          {/* Footer */}
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
