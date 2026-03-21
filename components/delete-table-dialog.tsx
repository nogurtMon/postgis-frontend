"use client";
import React from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dsn: string;
  schema: string;
  table: string;
  onDeleted: () => void;
}

export function DeleteTableDialog({ open, onOpenChange, dsn, schema, table, onDeleted }: Props) {
  const [confirm, setConfirm] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setConfirm("");
      setError(null);
    }
  }, [open]);

  async function handleDelete() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/pg/drop-table", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dsn, schema, table }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onDeleted();
      onOpenChange(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const confirmed = confirm === table;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-destructive">Delete Table</DialogTitle>
          <DialogDescription>
            This action is permanent and cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 space-y-1.5 text-sm">
            <p className="font-semibold text-destructive">Warning: You are about to permanently delete:</p>
            <p className="font-mono text-sm">{schema}.{table}</p>
            <p className="text-muted-foreground">
              All rows, indexes, triggers, and constraints in this table will be destroyed.
              There is no way to recover this data once deleted.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="delete-confirm">
              Type <span className="font-mono font-semibold">{table}</span> to confirm
            </Label>
            <Input
              id="delete-confirm"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder={table}
              className="font-mono"
              autoComplete="off"
            />
          </div>

          {error && <p className="text-sm text-destructive break-words">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={!confirmed || loading}
            >
              {loading ? "Deleting…" : "Delete table"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
