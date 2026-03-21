"use client";
import React from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, X } from "lucide-react";

const GEOM_TYPES = ["Point", "MultiPoint", "LineString", "MultiLineString", "Polygon", "MultiPolygon"];

interface UserColumn {
  id: string;
  name: string;
  type: "text" | "numeric";
  notNull: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dsn: string;
  onCreated: () => void;
}

export function CreateTableDialog({ open, onOpenChange, dsn, onCreated }: Props) {
  const [schema, setSchema] = React.useState("public");
  const [tableName, setTableName] = React.useState("");
  const [geomType, setGeomType] = React.useState("Point");
  const [srid, setSrid] = React.useState("4326");
  const [columns, setColumns] = React.useState<UserColumn[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  function reset() {
    setTableName("");
    setSchema("public");
    setGeomType("Point");
    setSrid("4326");
    setColumns([]);
    setError(null);
  }

  React.useEffect(() => {
    if (open) setError(null);
    else reset();
  }, [open]);

  function addColumn() {
    setColumns((prev) => [...prev, { id: crypto.randomUUID(), name: "", type: "text", notNull: false }]);
  }

  function updateColumn(id: string, patch: Partial<UserColumn>) {
    setColumns((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  function removeColumn(id: string) {
    setColumns((prev) => prev.filter((c) => c.id !== id));
  }

  async function handleCreate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/pg/create-table", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dsn, schema, table: tableName, geomType, srid, columns }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onCreated();
      onOpenChange(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const fixedColumns = [
    { name: "id", type: "SERIAL PRIMARY KEY" },
    { name: "created_at", type: "TIMESTAMP DEFAULT NOW()" },
    { name: "last_updated", type: "TIMESTAMP DEFAULT NOW()" },
    { name: "geom", type: `GEOMETRY(${geomType}, ${srid})` },
  ];

  const canCreate = tableName.trim().length > 0 && schema.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Table</DialogTitle>
          <DialogDescription>
            Creates a new PostGIS table with a spatial index and auto-updating timestamps.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 mt-2">
          {/* Schema + table name */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Schema</Label>
              <Input
                value={schema}
                onChange={(e) => setSchema(e.target.value)}
                placeholder="public"
                className="h-8 text-sm font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Table name</Label>
              <Input
                value={tableName}
                onChange={(e) => setTableName(e.target.value)}
                placeholder="my_table"
                className="h-8 text-sm font-mono"
              />
            </div>
          </div>

          {/* Geometry */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Geometry type</Label>
              <Select value={geomType} onValueChange={setGeomType}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GEOM_TYPES.map((t) => (
                    <SelectItem key={t} value={t} className="text-sm">{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">SRID</Label>
              <Input
                value={srid}
                onChange={(e) => setSrid(e.target.value)}
                className="h-8 text-sm font-mono"
              />
            </div>
          </div>

          {/* Fixed columns preview */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground uppercase tracking-wide">Fixed columns</Label>
            <div className="rounded-md border bg-muted/30 divide-y">
              {fixedColumns.map((col) => (
                <div key={col.name} className="flex items-center justify-between px-3 py-2">
                  <span className="text-xs font-mono font-medium">{col.name}</span>
                  <span className="text-xs font-mono text-muted-foreground">{col.type}</span>
                </div>
              ))}
            </div>
          </div>

          {/* User columns */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wide">Additional columns</Label>

            {columns.length === 0 && (
              <p className="text-xs text-muted-foreground">No additional columns. Click below to add one.</p>
            )}

            {columns.map((col) => (
              <div key={col.id} className="flex items-center gap-2">
                <Input
                  placeholder="column_name"
                  value={col.name}
                  onChange={(e) => updateColumn(col.id, { name: e.target.value })}
                  className="h-8 text-xs font-mono flex-1 min-w-0"
                />
                <Select
                  value={col.type}
                  onValueChange={(v) => updateColumn(col.id, { type: v as "text" | "numeric" })}
                >
                  <SelectTrigger className="h-8 text-xs w-28 shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text" className="text-xs">TEXT</SelectItem>
                    <SelectItem value="numeric" className="text-xs">NUMERIC</SelectItem>
                  </SelectContent>
                </Select>
                <label className="flex items-center gap-1 text-xs text-muted-foreground shrink-0 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={col.notNull}
                    onChange={(e) => updateColumn(col.id, { notNull: e.target.checked })}
                    className="h-3 w-3"
                  />
                  NOT NULL
                </label>
                <Button
                  size="icon" variant="ghost"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => removeColumn(col.id)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}

            <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={addColumn}>
              <Plus className="h-3 w-3 mr-1" /> Add column
            </Button>
          </div>

          {error && <p className="text-xs text-destructive break-words">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!canCreate || loading}>
              {loading ? "Creating…" : "Create table"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
