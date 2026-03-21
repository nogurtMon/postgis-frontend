"use client";
import React from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Connection Settings</DialogTitle>
          <DialogDescription>
            Enter your PostgreSQL connection string. Stored only in
            your browser&apos;s local storage.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="dsn-input">PostgreSQL DSN</Label>
            <Input
              id="dsn-input"
              placeholder="postgres://user:password@host:5432/dbname"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="font-mono text-sm"
            />
          </div>

          <p className="text-sm text-muted-foreground">
            Don&apos;t have a PostgreSQL database with PostGIS?{" Try "}
            <a
              href="https://neon.tech"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground underline underline-offset-2 hover:text-primary"
            >
              Neon
            </a>{" "}
          </p>

          <div className="flex justify-between gap-2">
            {dsn && (
              <Button variant="destructive" onClick={handleDisconnect}>
                Disconnect
              </Button>
            )}
            <div className="flex gap-2 ml-auto">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={!draft.trim().startsWith("postgres")}>
                Save &amp; Connect
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
