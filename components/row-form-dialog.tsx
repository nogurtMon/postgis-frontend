"use client";
import React from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Command, CommandItem, CommandList, CommandGroup } from "@/components/ui/command";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MapLayer } from "@/lib/types";

interface ColInfo { name: string; dataType: string; hasDefault: boolean; }

const SKIP_COLS = new Set(["id", "created_at", "last_updated", "latitude", "longitude", "lat", "lon", "lng"]);

function shouldSkip(col: ColInfo, geomCol: string) {
  if (col.name === geomCol) return true;
  if (SKIP_COLS.has(col.name)) return true;
  return false;
}
const TEXT_TYPES = new Set(["text", "character varying", "varchar", "char", "character", "name"]);
const MAX_DROPDOWN_VALUES = 15;

// Combobox: free-text input + dropdown of existing values (when ≤15 distinct exist)
function CreatableCombobox({
  value, onChange, options, placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const filtered = value.trim()
    ? options.filter((o) => o.toLowerCase().includes(value.toLowerCase()))
    : options;

  return (
    <Popover open={open && filtered.length > 0} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => { onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          className="h-8 text-sm"
          placeholder={placeholder ?? "NULL"}
        />
      </PopoverAnchor>
      <PopoverContent
        className="p-0 w-[var(--radix-popover-anchor-width)]"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onFocusOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => {
          if (inputRef.current?.contains(e.target as Node)) {
            e.preventDefault();
          }
        }}
      >
        <Command>
          <CommandList>
            <CommandGroup>
              {filtered.map((opt) => (
                <CommandItem
                  key={opt}
                  value={opt}
                  onSelect={() => {
                    onChange(opt);
                    setOpen(false);
                    inputRef.current?.focus();
                  }}
                  className="text-sm"
                >
                  <Check className={cn("mr-2 h-3.5 w-3.5 shrink-0", value === opt ? "opacity-100" : "opacity-0")} />
                  {opt}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

interface Props {
  mode: "insert" | "edit";
  layer: MapLayer;
  lng: number;
  lat: number;
  initialProps?: Record<string, any>;
  open: boolean;
  onClose: () => void;
  onSaved: (layerId: string) => void;
}

export function RowFormDialog({
  mode, layer, lng: initLng, lat: initLat, initialProps, open, onClose, onSaved,
}: Props) {
  const [columns, setColumns] = React.useState<ColInfo[]>([]);
  const [lng, setLng] = React.useState(String(initLng));
  const [lat, setLat] = React.useState(String(initLat));
  const [attrs, setAttrs] = React.useState<Record<string, string>>({});
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [distinctValues, setDistinctValues] = React.useState<Record<string, string[]>>({});
  const fetchedCols = React.useRef<Set<string>>(new Set());

  const geomCol = layer.table.geom_col ?? "geom";

  function fetchDistinct(colName: string) {
    if (fetchedCols.current.has(colName)) return;
    fetchedCols.current.add(colName);
    fetch("/api/pg/distinct-values", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dsn: layer.dsn,
        schema: layer.table.table_schema,
        table: layer.table.table_name,
        column: colName,
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        // Only store if within the dropdown limit
        if (data.values?.length > 0 && data.values.length <= MAX_DROPDOWN_VALUES) {
          setDistinctValues((prev) => ({ ...prev, [colName]: data.values }));
        }
      })
      .catch(() => {});
  }

  React.useEffect(() => {
    if (!open) return;
    setLng(String(initLng));
    setLat(String(initLat));
    setError(null);
    setDistinctValues({});
    fetchedCols.current = new Set();

    fetch("/api/pg/columns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dsn: layer.dsn,
        schema: layer.table.table_schema,
        table: layer.table.table_name,
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.columns) {
          const cols: ColInfo[] = data.columns.filter(
            (c: ColInfo) => !shouldSkip(c, geomCol)
          );
          setColumns(cols);
          const initial: Record<string, string> = {};
          for (const col of cols) {
            initial[col.name] =
              initialProps?.[col.name] != null ? String(initialProps[col.name]) : "";
          }
          setAttrs(initial);
        }
      })
      .catch(() => {});
  }, [open, layer.id]);

  async function handleSave() {
    setLoading(true);
    setError(null);
    try {
      const body: Record<string, any> = {
        dsn: layer.dsn,
        schema: layer.table.table_schema,
        table: layer.table.table_name,
        geomCol,
        srid: layer.table.srid ?? 4326,
        lng: parseFloat(lng),
        lat: parseFloat(lat),
        attrs,
      };
      if (mode === "edit") body.id = initialProps?.id;

      const res = await fetch("/api/pg/rows", {
        method: mode === "insert" ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      onSaved(layer.id);
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "insert" ? "Add Point" : "Edit Point"}</DialogTitle>
          <DialogDescription className="font-mono text-xs">
            {layer.table.table_schema}.{layer.table.table_name}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Longitude</Label>
              <Input
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                className="h-8 text-sm font-mono"
                placeholder="-98.55"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Latitude</Label>
              <Input
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                className="h-8 text-sm font-mono"
                placeholder="39.81"
              />
            </div>
          </div>

          {columns.map((col) => {
            const isText = TEXT_TYPES.has(col.dataType);
            const options = distinctValues[col.name];
            return (
              <div key={col.name} className="space-y-1.5">
                <Label className="text-xs">
                  {col.name}{" "}
                  <span className="text-muted-foreground normal-case font-normal">
                    ({col.dataType})
                  </span>
                </Label>
                {isText && options ? (
                  <CreatableCombobox
                    value={attrs[col.name] ?? ""}
                    onChange={(v) => setAttrs((prev) => ({ ...prev, [col.name]: v }))}
                    options={options}
                  />
                ) : (
                  <Input
                    value={attrs[col.name] ?? ""}
                    onChange={(e) =>
                      setAttrs((prev) => ({ ...prev, [col.name]: e.target.value }))
                    }
                    onFocus={() => isText && fetchDistinct(col.name)}
                    className="h-8 text-sm"
                    placeholder="NULL"
                  />
                )}
              </div>
            );
          })}

          {error && <p className="text-xs text-destructive break-words">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={loading}>
              {loading ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
