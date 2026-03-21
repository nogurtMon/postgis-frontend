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
  onRenamed: () => void;
}

export function RenameTableDialog({ open, onOpenChange, dsn, schema, table, onRenamed }: Props) {
  const [newSchema, setNewSchema] = React.useState(schema);
  const [newTable, setNewTable] = React.useState(table);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setNewSchema(schema);
      setNewTable(table);
      setError(null);
    }
  }, [open, schema, table]);

  const unchanged = newSchema === schema && newTable === table;
  const VALID = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
  const valid = VALID.test(newSchema) && VALID.test(newTable);

  async function handleSave() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/pg/rename-table", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dsn, schema, table, newSchema, newTable }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onRenamed();
      onOpenChange(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Rename / Move Table</DialogTitle>
          <DialogDescription className="font-mono text-xs">
            {schema}.{table}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="rename-schema">Schema</Label>
            <Input
              id="rename-schema"
              value={newSchema}
              onChange={(e) => setNewSchema(e.target.value)}
              className="font-mono"
              placeholder="public"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rename-table">Table name</Label>
            <Input
              id="rename-table"
              value={newTable}
              onChange={(e) => setNewTable(e.target.value)}
              className="font-mono"
              placeholder={table}
            />
          </div>

          {error && <p className="text-sm text-destructive break-words">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={unchanged || !valid || loading}>
              {loading ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
