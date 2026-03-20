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
}

export function SettingsDialog({ open, onOpenChange, dsn, onSave }: Props) {
  const [draft, setDraft] = React.useState(dsn);

  React.useEffect(() => {
    if (open) setDraft(dsn);
  }, [open, dsn]);

  function handleSave() {
    onSave(draft.trim());
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Connection Settings</DialogTitle>
          <DialogDescription>
            Enter your PostgreSQL / PostGIS connection string. Stored only in
            your browser&apos;s local storage. A Martin tile server will be
            started automatically.
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

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!draft.trim().startsWith("postgres")}>
              Save &amp; Connect
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
