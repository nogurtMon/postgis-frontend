"use client";
import React from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronUp, ChevronDown, Search, X, Loader2, Filter, Columns, Plus } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

type AttrOperator = "ilike" | "eq" | "neq" | "gt" | "lt" | "gte" | "lte" | "is_null" | "is_not_null" | "starts_with" | "in" | "not_in";

interface AttrFilter {
  id: string;
  column: string;
  operator: AttrOperator;
  value: string;
}

const OPERATOR_LABELS: Record<AttrOperator, string> = {
  ilike: "contains",
  eq: "equals",
  neq: "not equals",
  gt: "greater than",
  lt: "less than",
  gte: "≥",
  lte: "≤",
  is_null: "is null",
  is_not_null: "is not null",
  starts_with: "starts with",
  in: "in",
  not_in: "not in",
};
const ALL_OPERATORS = Object.keys(OPERATOR_LABELS) as AttrOperator[];
const NULL_OPERATORS: AttrOperator[] = ["is_null", "is_not_null"];

interface ColumnMeta {
  name: string;
  dataType: string;
  isGeom: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dsn: string;
  schema: string;
  table: string;
  filters?: AttrFilter[];
  onFiltersChange?: (filters: AttrFilter[]) => void;
  onDataChanged?: () => void;
}

const PAGE_SIZE = 100;

export function AttributeTableDialog({ open, onOpenChange, dsn, schema, table, filters: externalFilters, onFiltersChange, onDataChanged }: Props) {
  const [columns, setColumns] = React.useState<ColumnMeta[]>([]);
  const [rows, setRows] = React.useState<Record<string, any>[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(0);
  const [sortCol, setSortCol] = React.useState<string | null>(null);
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("asc");
  const [search, setSearch] = React.useState("");
  const [searchInput, setSearchInput] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);


  // Filter toolbar
  const [attrFilters, setAttrFilters] = React.useState<AttrFilter[]>([]);
  const [showFilters, setShowFilters] = React.useState(false);

  // Column visibility
  const [hiddenCols, setHiddenCols] = React.useState<Set<string>>(new Set());
  const [showColPicker, setShowColPicker] = React.useState(false);
  const colPickerRef = React.useRef<HTMLDivElement>(null);

  // editableCols: non-geometry columns (used for filters)
  const editableCols = React.useMemo(
    () => columns.filter((c) => !c.isGeom),
    [columns]
  );

  async function fetchRows(opts: {
    p?: number;
    sc?: string | null;
    sd?: "asc" | "desc";
    s?: string;
    af?: AttrFilter[];
  } = {}) {
    const p = opts.p ?? page;
    const sc = "sc" in opts ? opts.sc : sortCol;
    const sd = opts.sd ?? sortDir;
    const s = "s" in opts ? opts.s : search;
    const af = "af" in opts ? opts.af : attrFilters;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/pg/table-rows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dsn, schema, table, page: p, pageSize: PAGE_SIZE, sortCol: sc, sortDir: sd, search: s, attrFilters: af }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setColumns(data.columns);
      setRows(data.rows);
      setTotal(data.total);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    if (!open) return;
    const initialFilters = externalFilters ?? [];
    setPage(0);
    setSortCol(null);
    setSortDir("asc");
    setSearch("");
    setSearchInput("");
    setAttrFilters(initialFilters);
    setShowFilters(initialFilters.length > 0);
    setHiddenCols(new Set());
    setShowColPicker(false);
    fetchRows({ p: 0, sc: null, sd: "asc", s: "", af: initialFilters });
  }, [open, schema, table]);

  function handleSort(col: string) {
    let newCol: string | null = col;
    let newDir: "asc" | "desc" = "asc";
    if (sortCol === col) {
      if (sortDir === "asc") { newDir = "desc"; }
      else { newCol = null; newDir = "asc"; }
    }
    setSortCol(newCol);
    setSortDir(newDir);
    setPage(0);
    fetchRows({ p: 0, sc: newCol, sd: newDir });
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const s = searchInput.trim();
    setSearch(s);
    setPage(0);
    fetchRows({ p: 0, s });
  }

  function clearSearch() {
    setSearchInput("");
    setSearch("");
    setPage(0);
    fetchRows({ p: 0, s: "" });
  }

  function handlePageChange(newPage: number) {
    setPage(newPage);
    fetchRows({ p: newPage });
  }

  function addAttrFilter() {
    const firstCol = editableCols[0]?.name ?? "";
    setAttrFilters((prev) => [...prev, { id: crypto.randomUUID(), column: firstCol, operator: "ilike", value: "" }]);
    setShowFilters(true);
  }

  function removeAttrFilter(id: string) {
    const next = attrFilters.filter((f) => f.id !== id);
    setAttrFilters(next);
    onFiltersChange?.(next);
    setPage(0);
    fetchRows({ p: 0, af: next });
  }

  function applyAttrFilter(next: AttrFilter[]) {
    setAttrFilters(next);
    onFiltersChange?.(next);
    setPage(0);
    fetchRows({ p: 0, af: next });
  }

  function clearAttrFilters() {
    setAttrFilters([]);
    onFiltersChange?.([]);
    setPage(0);
    fetchRows({ p: 0, af: [] });
  }

  const activeFilterCount = attrFilters.filter(
    (f) => f.column && (NULL_OPERATORS.includes(f.operator) || f.value.trim() !== "")
  ).length;

  const pageCount = Math.ceil(total / PAGE_SIZE);
  const rowStart = page * PAGE_SIZE + 1;
  const rowEnd = Math.min((page + 1) * PAGE_SIZE, total);
  const displayCols = columns.filter((c) => !hiddenCols.has(c.name));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-none w-[99vw] h-[97vh] flex flex-col p-0 gap-0 rounded-md">

        {/* Header */}
        <DialogHeader className="pl-4 pr-12 pt-4 pb-3 shrink-0 border-b">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <DialogTitle className="text-sm font-semibold font-mono">
              {schema}.{table}
              {!loading && (
                <span className="ml-2 text-xs text-muted-foreground font-sans font-normal">
                  {total.toLocaleString()} rows
                </span>
              )}
            </DialogTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <form onSubmit={handleSearch} className="flex gap-1">
                <Input
                  placeholder="Search text columns…"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="h-7 text-xs w-48"
                />
                <Button type="submit" size="sm" variant="ghost" className="h-7 w-7 p-0">
                  <Search className="h-3.5 w-3.5" />
                </Button>
                {search && (
                  <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={clearSearch}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </form>
              <Button
                size="sm"
                variant={showFilters || activeFilterCount > 0 ? "secondary" : "ghost"}
                className="h-7 text-xs gap-1"
                onClick={() => { setShowFilters((v) => !v); if (!showFilters && attrFilters.length === 0) addAttrFilter(); }}
              >
                <Filter className="h-3 w-3" />
                Filters
                {activeFilterCount > 0 && (
                  <span className="ml-0.5 rounded-full bg-primary text-primary-foreground px-1.5 text-[10px] leading-4">
                    {activeFilterCount}
                  </span>
                )}
              </Button>
              <div className="relative">
                <Button
                  size="sm"
                  variant={hiddenCols.size > 0 ? "secondary" : "ghost"}
                  className="h-7 text-xs gap-1"
                  onClick={() => setShowColPicker((v) => !v)}
                >
                  <Columns className="h-3 w-3" />
                  Columns
                  {hiddenCols.size > 0 && (
                    <span className="ml-0.5 text-[10px] text-muted-foreground">
                      {columns.length - hiddenCols.size}/{columns.length}
                    </span>
                  )}
                </Button>
                {showColPicker && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowColPicker(false)} />
                    <div
                      ref={colPickerRef}
                      className="absolute right-0 top-full mt-1 z-20 bg-background border rounded-md shadow-lg py-1 min-w-44 max-h-72 overflow-y-auto"
                    >
                      <div className="px-2 py-1 flex items-center justify-between border-b mb-1">
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Visible columns</span>
                        {hiddenCols.size > 0 && (
                          <button
                            className="text-[10px] text-primary hover:underline"
                            onClick={() => setHiddenCols(new Set())}
                          >
                            Show all
                          </button>
                        )}
                      </div>
                      {columns.map((col) => (
                        <label
                          key={col.name}
                          className="flex items-center gap-2 px-2 py-1 hover:bg-muted/50 cursor-pointer text-xs"
                        >
                          <input
                            type="checkbox"
                            className="h-3 w-3 shrink-0"
                            checked={!hiddenCols.has(col.name)}
                            onChange={() => {
                              setHiddenCols((prev) => {
                                const next = new Set(prev);
                                if (next.has(col.name)) next.delete(col.name);
                                else next.add(col.name);
                                return next;
                              });
                            }}
                          />
                          <span className="font-mono truncate">{col.name}</span>
                        </label>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* Filter panel */}
        {showFilters && (
          <div className="shrink-0 border-b bg-muted/10 px-4 py-2 flex flex-wrap items-center gap-2">
            {attrFilters.map((f, i) => (
              <div key={f.id} className="flex items-center gap-1.5 flex-wrap">
                <button
                  onClick={() => removeAttrFilter(f.id)}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
                <span className="text-xs text-muted-foreground shrink-0">{i === 0 ? "where" : "and"}</span>
                <Select
                  value={f.column}
                  onValueChange={(col) => applyAttrFilter(attrFilters.map((fi) => fi.id === f.id ? { ...fi, column: col, value: "" } : fi))}
                >
                  <SelectTrigger className="h-7 text-xs w-36 font-mono">
                    <SelectValue placeholder="column" />
                  </SelectTrigger>
                  <SelectContent>
                    {editableCols.map((c) => (
                      <SelectItem key={c.name} value={c.name} className="text-xs font-mono">{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={f.operator}
                  onValueChange={(op) => applyAttrFilter(attrFilters.map((fi) => fi.id === f.id ? { ...fi, operator: op as AttrOperator } : fi))}
                >
                  <SelectTrigger className="h-7 text-xs w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ALL_OPERATORS.map((op) => (
                      <SelectItem key={op} value={op} className="text-xs">{OPERATOR_LABELS[op]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!NULL_OPERATORS.includes(f.operator) && (
                  <Input
                    value={f.value}
                    placeholder={f.operator === "in" ? "a,b,c" : "value"}
                    onChange={(e) => setAttrFilters((prev) => prev.map((fi) => fi.id === f.id ? { ...fi, value: e.target.value } : fi))}
                    onBlur={(e) => applyAttrFilter(attrFilters.map((fi) => fi.id === f.id ? { ...fi, value: e.target.value } : fi))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") applyAttrFilter(attrFilters.map((fi) => fi.id === f.id ? { ...fi, value: (e.target as HTMLInputElement).value } : fi));
                    }}
                    className="h-7 text-xs w-40"
                  />
                )}
              </div>
            ))}
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={addAttrFilter}>
              <Plus className="h-3 w-3 mr-1" /> Add filter
            </Button>
            {attrFilters.length > 0 && (
              <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={clearAttrFilters}>
                Clear filters
              </Button>
            )}
          </div>
        )}

        {/* Table */}
        <div className="flex-1 min-h-0 overflow-auto">
          {loading && (
            <div className="flex items-center justify-center h-32 gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          )}
          {error && <p className="p-4 text-sm text-destructive">{error}</p>}
          {!loading && !error && (
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 bg-background z-10 border-b shadow-sm">
                <tr>
                  {displayCols.map((col) => (
                    <th
                      key={col.name}
                      className={`px-2 py-2 text-left border-r last:border-r-0 whitespace-nowrap ${!col.isGeom ? "cursor-pointer select-none hover:bg-muted/60" : ""}`}
                      onClick={() => !col.isGeom && handleSort(col.name)}
                    >
                      <div className="flex items-center gap-1">
                        <span className="font-mono font-medium text-foreground">{col.name}</span>
                        {sortCol === col.name && (
                          sortDir === "asc"
                            ? <ChevronUp className="h-3 w-3 text-primary shrink-0" />
                            : <ChevronDown className="h-3 w-3 text-primary shrink-0" />
                        )}
                      </div>
                      <div className="text-[9px] font-normal font-sans text-muted-foreground/70">{col.dataType}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, ri) => (
                  <tr
                    key={row._ctid}
                    className={`border-b ${ri % 2 === 0 ? "" : "bg-muted/20"} hover:bg-muted/40`}
                  >
                    {displayCols.map((col) => {
                      const val = row[col.name];
                      return (
                        <td
                          key={col.name}
                          className="px-2 py-1 border-r last:border-r-0 max-w-[16rem] overflow-hidden"
                          title={val == null ? "NULL" : String(val)}
                        >
                          {val == null ? (
                            <span className="text-muted-foreground/40 italic select-none">null</span>
                          ) : col.isGeom ? (
                            <span className="text-muted-foreground font-mono text-[10px] truncate block">
                              {String(val).slice(0, 48)}{String(val).length > 48 ? "…" : ""}
                            </span>
                          ) : (
                            <span className="font-mono truncate block">{String(val)}</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={displayCols.length} className="text-center py-12 text-muted-foreground">
                      {search ? "No rows match the search." : "This table has no rows."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer / Pagination */}
        <div className="shrink-0 border-t px-4 py-2 flex items-center justify-between text-xs text-muted-foreground bg-background">
          <span>
            {total === 0
              ? "No rows"
              : `${rowStart.toLocaleString()}–${rowEnd.toLocaleString()} of ${total.toLocaleString()} rows`}
            {search && <span className="ml-1 text-primary">(filtered)</span>}
          </span>
          <div className="flex items-center gap-2">
            <Button
              size="sm" variant="ghost" className="h-7 text-xs px-2"
              disabled={page === 0 || loading}
              onClick={() => handlePageChange(page - 1)}
            >
              Previous
            </Button>
            <span>Page {page + 1} of {Math.max(1, pageCount)}</span>
            <Button
              size="sm" variant="ghost" className="h-7 text-xs px-2"
              disabled={page >= pageCount - 1 || loading}
              onClick={() => handlePageChange(page + 1)}
            >
              Next
            </Button>
          </div>
        </div>

      </DialogContent>
    </Dialog>
  );
}
