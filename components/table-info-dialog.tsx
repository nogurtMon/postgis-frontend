"use client";
import React from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Pencil, Plus, Trash2, Check, X } from "lucide-react";

interface ColumnInfo {
  column_name: string;
  data_type: string;
  udt_name: string;
  is_nullable: string;
  column_default: string | null;
  is_identity: string;
  character_maximum_length: number | null;
  numeric_precision: number | null;
  numeric_scale: number | null;
}

interface IndexInfo {
  index_name: string;
  access_method: string;
  is_unique: boolean;
  is_primary: boolean;
  columns: string[];
}

interface TriggerInfo {
  trigger_name: string;
  event: string;
  timing: string;
  table_name: string;
  definition: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  dsn: string;
  schema: string;
  table: string;
  onChanged?: () => void;
}

const ALLOWED_TYPES = [
  "text", "integer", "bigint", "smallint", "numeric", "real", "double precision",
  "boolean", "date", "timestamp", "timestamptz", "uuid", "jsonb", "json",
];

const VALID_IDENT = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export function TableInfoDialog({ open, onOpenChange, dsn, schema, table, onChanged }: Props) {
  const [columns, setColumns] = React.useState<ColumnInfo[]>([]);
  const [indexes, setIndexes] = React.useState<IndexInfo[]>([]);
  const [triggers, setTriggers] = React.useState<TriggerInfo[]>([]);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  // Add column state
  const [addOpen, setAddOpen] = React.useState(false);
  const [addName, setAddName] = React.useState("");
  const [addType, setAddType] = React.useState("text");
  const [addNotNull, setAddNotNull] = React.useState(false);
  const [addDefault, setAddDefault] = React.useState("");
  const [addLoading, setAddLoading] = React.useState(false);
  const [addError, setAddError] = React.useState<string | null>(null);

  // Rename column state
  const [renamingCol, setRenamingCol] = React.useState<string | null>(null);
  const [renameVal, setRenameVal] = React.useState("");
  const [renameLoading, setRenameLoading] = React.useState(false);
  const [renameError, setRenameError] = React.useState<string | null>(null);

  // Drop column state
  const [droppingCol, setDroppingCol] = React.useState<string | null>(null);
  const [dropLoading, setDropLoading] = React.useState(false);
  const [dropError, setDropError] = React.useState<string | null>(null);

  // Truncate state
  const [truncateConfirm, setTruncateConfirm] = React.useState(false);
  const [truncateLoading, setTruncateLoading] = React.useState(false);
  const [truncateError, setTruncateError] = React.useState<string | null>(null);

  function loadInfo() {
    if (!dsn || !schema || !table) return;
    setLoading(true);
    setLoadError(null);
    fetch("/api/pg/table-info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dsn, schema, table }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setColumns(data.columns);
        setIndexes(data.indexes);
        setTriggers(data.triggers);
      })
      .catch((e) => setLoadError(e.message))
      .finally(() => setLoading(false));
  }

  React.useEffect(() => {
    if (open) {
      loadInfo();
      setAddOpen(false);
      setRenamingCol(null);
      setDroppingCol(null);
      setTruncateConfirm(false);
    }
  }, [open, dsn, schema, table]);

  async function alterColumn(action: string, extra: object) {
    const res = await fetch("/api/pg/alter-column", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dsn, schema, table, action, ...extra }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
  }

  async function handleAddColumn() {
    if (!VALID_IDENT.test(addName)) { setAddError("Invalid column name"); return; }
    setAddLoading(true);
    setAddError(null);
    try {
      await alterColumn("add", { column: addName, type: addType, notNull: addNotNull, defaultValue: addDefault || null });
      setAddOpen(false);
      setAddName(""); setAddType("text"); setAddNotNull(false); setAddDefault("");
      loadInfo();
      onChanged?.();
    } catch (e: any) {
      setAddError(e.message);
    } finally {
      setAddLoading(false);
    }
  }

  async function handleRenameColumn(column: string) {
    if (!VALID_IDENT.test(renameVal)) { setRenameError("Invalid column name"); return; }
    setRenameLoading(true);
    setRenameError(null);
    try {
      await alterColumn("rename", { column, newName: renameVal });
      setRenamingCol(null);
      loadInfo();
      onChanged?.();
    } catch (e: any) {
      setRenameError(e.message);
    } finally {
      setRenameLoading(false);
    }
  }

  async function handleDropColumn(column: string) {
    setDropLoading(true);
    setDropError(null);
    try {
      await alterColumn("drop", { column });
      setDroppingCol(null);
      loadInfo();
      onChanged?.();
    } catch (e: any) {
      setDropError(e.message);
    } finally {
      setDropLoading(false);
    }
  }

  async function handleTruncate() {
    setTruncateLoading(true);
    setTruncateError(null);
    try {
      const res = await fetch("/api/pg/truncate-table", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dsn, schema, table }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTruncateConfirm(false);
      onChanged?.();
    } catch (e: any) {
      setTruncateError(e.message);
    } finally {
      setTruncateLoading(false);
    }
  }

  function displayType(col: ColumnInfo) {
    if (col.data_type === "USER-DEFINED") return col.udt_name;
    if (col.data_type === "character varying") {
      return col.character_maximum_length ? `varchar(${col.character_maximum_length})` : "varchar";
    }
    if (col.data_type === "numeric" && col.numeric_precision != null) {
      return col.numeric_scale != null
        ? `numeric(${col.numeric_precision},${col.numeric_scale})`
        : `numeric(${col.numeric_precision})`;
    }
    return col.data_type;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-full h-[80vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 shrink-0">
          <DialogTitle className="text-base font-semibold">
            {schema}.{table}
          </DialogTitle>
        </DialogHeader>

        {loadError && (
          <p className="px-5 pb-3 text-sm text-destructive">{loadError}</p>
        )}
        {loading && (
          <p className="px-5 pb-3 text-sm text-muted-foreground">Loading…</p>
        )}

        <Tabs defaultValue="columns" className="flex flex-col flex-1 min-h-0">
          <TabsList className="mx-5 shrink-0 w-fit">
            <TabsTrigger value="columns" className="text-xs">
              Columns
              {columns.length > 0 && (
                <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-[10px]">{columns.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="indexes" className="text-xs">
              Indexes
              {indexes.length > 0 && (
                <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-[10px]">{indexes.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="triggers" className="text-xs">
              Triggers
              {triggers.length > 0 && (
                <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-[10px]">{triggers.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="danger" className="text-xs text-destructive data-[state=active]:text-destructive">
              Danger
            </TabsTrigger>
          </TabsList>

          {/* COLUMNS */}
          <TabsContent value="columns" className="flex-1 min-h-0 flex flex-col mt-0 px-5 pb-5">
            <ScrollArea className="flex-1 min-h-0 mt-3">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground border-b">
                    <th className="text-left py-1.5 pr-3 font-medium">Name</th>
                    <th className="text-left py-1.5 pr-3 font-medium">Type</th>
                    <th className="text-left py-1.5 pr-3 font-medium">Nullable</th>
                    <th className="text-left py-1.5 pr-3 font-medium">Default</th>
                    <th className="text-right py-1.5 font-medium w-14"></th>
                  </tr>
                </thead>
                <tbody>
                  {columns.map((col) => {
                    const isRenaming = renamingCol === col.column_name;
                    const isDropping = droppingCol === col.column_name;
                    return (
                      <React.Fragment key={col.column_name}>
                        <tr className="border-b last:border-0 hover:bg-muted/30 group">
                          <td className="py-1.5 pr-3 font-mono">
                            {col.column_name}
                            {col.is_identity === "YES" && (
                              <Badge variant="secondary" className="ml-1.5 h-3.5 px-1 text-[9px] font-normal">identity</Badge>
                            )}
                          </td>
                          <td className="py-1.5 pr-3 text-muted-foreground">{displayType(col)}</td>
                          <td className="py-1.5 pr-3 text-muted-foreground">{col.is_nullable === "YES" ? "yes" : "no"}</td>
                          <td className="py-1.5 pr-3 text-muted-foreground truncate max-w-32" title={col.column_default ?? ""}>
                            {col.column_default ?? <span className="opacity-40">—</span>}
                          </td>
                          <td className="py-1.5 text-right">
                            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button
                                size="icon" variant="ghost"
                                className="h-5 w-5 text-muted-foreground"
                                title="Rename column"
                                onClick={() => {
                                  setRenamingCol(isRenaming ? null : col.column_name);
                                  setRenameVal(col.column_name);
                                  setRenameError(null);
                                  setDroppingCol(null);
                                }}
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button
                                size="icon" variant="ghost"
                                className="h-5 w-5 text-muted-foreground hover:text-destructive"
                                title="Drop column"
                                onClick={() => {
                                  setDroppingCol(isDropping ? null : col.column_name);
                                  setDropError(null);
                                  setRenamingCol(null);
                                }}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                        {isRenaming && (
                          <tr>
                            <td colSpan={5} className="py-2 px-2 bg-muted/40 border-b">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-muted-foreground shrink-0">New name:</span>
                                <Input
                                  value={renameVal}
                                  onChange={(e) => setRenameVal(e.target.value)}
                                  className="h-6 text-xs font-mono w-40"
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") handleRenameColumn(col.column_name);
                                    if (e.key === "Escape") setRenamingCol(null);
                                  }}
                                  autoFocus
                                />
                                <Button
                                  size="icon" variant="ghost" className="h-6 w-6"
                                  disabled={renameLoading}
                                  onClick={() => handleRenameColumn(col.column_name)}
                                >
                                  <Check className="h-3 w-3" />
                                </Button>
                                <Button
                                  size="icon" variant="ghost" className="h-6 w-6"
                                  onClick={() => setRenamingCol(null)}
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                                {renameError && <p className="text-[10px] text-destructive">{renameError}</p>}
                              </div>
                            </td>
                          </tr>
                        )}
                        {isDropping && (
                          <tr>
                            <td colSpan={5} className="py-2 px-2 bg-destructive/5 border-b">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-muted-foreground">
                                  Drop <span className="font-mono font-semibold">{col.column_name}</span>?
                                  This cannot be undone.
                                </span>
                                <Button
                                  size="sm" variant="destructive" className="h-6 text-[11px] px-2"
                                  disabled={dropLoading}
                                  onClick={() => handleDropColumn(col.column_name)}
                                >
                                  {dropLoading ? "Dropping…" : "Drop"}
                                </Button>
                                <Button
                                  size="sm" variant="ghost" className="h-6 text-[11px] px-2"
                                  onClick={() => setDroppingCol(null)}
                                >
                                  Cancel
                                </Button>
                                {dropError && <p className="text-[10px] text-destructive">{dropError}</p>}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </ScrollArea>

            {/* Add column */}
            <div className="border-t pt-3 mt-3 shrink-0">
              {!addOpen ? (
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAddOpen(true)}>
                  <Plus className="h-3 w-3 mr-1" /> Add column
                </Button>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs font-medium">Add column</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Name</Label>
                      <Input
                        value={addName}
                        onChange={(e) => setAddName(e.target.value)}
                        className="h-7 text-xs font-mono"
                        placeholder="column_name"
                        autoFocus
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Type</Label>
                      <Select value={addType} onValueChange={setAddType}>
                        <SelectTrigger className="h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ALLOWED_TYPES.map((t) => (
                            <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Default value</Label>
                      <Input
                        value={addDefault}
                        onChange={(e) => setAddDefault(e.target.value)}
                        className="h-7 text-xs"
                        placeholder="optional"
                      />
                    </div>
                    <div className="flex items-end pb-0.5">
                      <label className="flex items-center gap-1.5 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={addNotNull}
                          onChange={(e) => setAddNotNull(e.target.checked)}
                          className="h-3.5 w-3.5"
                        />
                        <span className="text-xs text-muted-foreground">NOT NULL</span>
                      </label>
                    </div>
                  </div>
                  {addError && <p className="text-xs text-destructive">{addError}</p>}
                  <div className="flex gap-2">
                    <Button size="sm" className="h-7 text-xs" disabled={addLoading} onClick={handleAddColumn}>
                      {addLoading ? "Adding…" : "Add column"}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setAddOpen(false); setAddError(null); }}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          {/* INDEXES */}
          <TabsContent value="indexes" className="flex-1 min-h-0 mt-0 px-5 pb-5">
            <ScrollArea className="h-full mt-3">
              {indexes.length === 0 ? (
                <p className="text-sm text-muted-foreground">No indexes.</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-muted-foreground border-b">
                      <th className="text-left py-1.5 pr-3 font-medium">Name</th>
                      <th className="text-left py-1.5 pr-3 font-medium">Method</th>
                      <th className="text-left py-1.5 pr-3 font-medium">Columns</th>
                      <th className="text-left py-1.5 font-medium">Flags</th>
                    </tr>
                  </thead>
                  <tbody>
                    {indexes.map((idx) => (
                      <tr key={idx.index_name} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="py-1.5 pr-3 font-mono">{idx.index_name}</td>
                        <td className="py-1.5 pr-3 uppercase text-muted-foreground">{idx.access_method}</td>
                        <td className="py-1.5 pr-3 font-mono text-muted-foreground">
                          {(Array.isArray(idx.columns)
                            ? idx.columns
                            : String(idx.columns).replace(/^{|}$/g, "").split(",")
                          ).join(", ")}
                        </td>
                        <td className="py-1.5">
                          <div className="flex gap-1">
                            {idx.is_primary && (
                              <Badge variant="secondary" className="h-4 px-1 text-[9px]">PK</Badge>
                            )}
                            {idx.is_unique && !idx.is_primary && (
                              <Badge variant="secondary" className="h-4 px-1 text-[9px]">UNIQUE</Badge>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </ScrollArea>
          </TabsContent>

          {/* TRIGGERS */}
          <TabsContent value="triggers" className="flex-1 min-h-0 mt-0 px-5 pb-5">
            <ScrollArea className="h-full mt-3">
              {triggers.length === 0 ? (
                <p className="text-sm text-muted-foreground">No triggers.</p>
              ) : (
                <div className="space-y-3">
                  {triggers.map((trig) => (
                    <div key={trig.trigger_name} className="rounded-md border p-3 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-semibold">{trig.trigger_name}</span>
                        <Badge variant="secondary" className="h-4 px-1 text-[9px]">{trig.timing} {trig.event}</Badge>
                      </div>
                      <pre className="text-[10px] text-muted-foreground whitespace-pre-wrap break-words font-mono leading-relaxed">
                        {trig.definition}
                      </pre>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          {/* DANGER */}
          <TabsContent value="danger" className="mt-0 px-5 pb-5 pt-4">
            <div className="rounded-md border border-destructive/30 p-4 space-y-3">
              <div>
                <p className="text-sm font-semibold">Truncate table</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Deletes all rows from <span className="font-mono">{schema}.{table}</span> but keeps the table structure.
                  This cannot be undone.
                </p>
              </div>
              {!truncateConfirm ? (
                <Button
                  size="sm" variant="destructive" className="h-7 text-xs"
                  onClick={() => setTruncateConfirm(true)}
                >
                  Truncate table
                </Button>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-destructive">Are you sure? All rows will be deleted.</p>
                  <div className="flex gap-2">
                    <Button
                      size="sm" variant="destructive" className="h-7 text-xs"
                      disabled={truncateLoading}
                      onClick={handleTruncate}
                    >
                      {truncateLoading ? "Truncating…" : "Yes, truncate"}
                    </Button>
                    <Button
                      size="sm" variant="ghost" className="h-7 text-xs"
                      onClick={() => { setTruncateConfirm(false); setTruncateError(null); }}
                    >
                      Cancel
                    </Button>
                  </div>
                  {truncateError && <p className="text-xs text-destructive">{truncateError}</p>}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
