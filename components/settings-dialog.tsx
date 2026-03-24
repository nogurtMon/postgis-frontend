"use client";
import React from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Wrench } from "lucide-react";

// ─── cloud provider hostnames (for SSL detection) ────────────────────────────
const CLOUD_HOSTS = ["neon.tech", "supabase.co", "rds.amazonaws.com", "railway.app", "render.com"];

// ─── DSN analysis ─────────────────────────────────────────────────────────────
function analyzeDsn(raw: string) {
  const dsn = raw.trim();
  if (!dsn.startsWith("postgres")) return null;
  try {
    const url = new URL(dsn);
    const host = url.hostname;
    const params = new URLSearchParams(url.search);
    const isLocal = host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "";
    const isCloud = CLOUD_HOSTS.some((h) => host.includes(h));
    const needsSsl = isCloud && !params.has("sslmode");
    return { isLocal, needsSsl };
  } catch {
    return null;
  }
}

function addSslMode(dsn: string): string {
  try {
    const url = new URL(dsn.trim());
    url.searchParams.set("sslmode", "require");
    return url.toString();
  } catch {
    return dsn + (dsn.includes("?") ? "&" : "?") + "sslmode=require";
  }
}

// ─── component ────────────────────────────────────────────────────────────────
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dsn: string;
  onSave: (dsn: string) => void;
  onDisconnect: () => void;
}

export function SettingsDialog({ open, onOpenChange, dsn, onSave, onDisconnect }: Props) {
  const [draft, setDraft] = React.useState(dsn);

  React.useEffect(() => {
    if (open) setDraft(dsn);
  }, [open, dsn]);

  function handleSave() {
    onSave(draft.trim());
    onOpenChange(false);
  }

  function handleDisconnect() {
    onDisconnect();
    onOpenChange(false);
  }

  const analysis = analyzeDsn(draft);
  const canSave = draft.trim().startsWith("postgres");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Connection Settings</DialogTitle>
          <DialogDescription>
            Enter your PostgreSQL connection string. Stored only in your browser&apos;s local storage.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          {/* DSN input */}
          <div className="space-y-1.5">
            <Label htmlFor="dsn-input">PostgreSQL connection string</Label>
            <Input
              id="dsn-input"
              placeholder="postgresql://user:password@host:5432/dbname"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="font-mono text-sm"
            />
          </div>

          {/* SSL missing warning */}
          {analysis?.needsSsl && (
            <div className="flex items-start gap-2.5 rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 px-3 py-2.5 text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" />
              <div className="flex-1 min-w-0 space-y-1">
                <p className="font-medium text-amber-800 dark:text-amber-300">SSL required</p>
                <p className="text-amber-700 dark:text-amber-400 text-xs">
                  This host requires <code className="font-mono">sslmode=require</code>. Without it the connection will be refused.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 text-xs mt-1 border-amber-400 dark:border-amber-600 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40"
                  onClick={() => setDraft(addSslMode(draft))}
                >
                  <Wrench className="h-3 w-3 mr-1" /> Add sslmode=require
                </Button>
              </div>
            </div>
          )}



          {/* Actions */}
          <div className="flex justify-between gap-2 pt-1">
            {dsn && (
              <Button variant="destructive" onClick={handleDisconnect}>Disconnect</Button>
            )}
            <div className="flex gap-2 ml-auto">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={!canSave}>Save &amp; Connect</Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
