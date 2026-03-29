import * as XLSXmod from "xlsx";
import { findCol, rowsToFeatures, LAT_COLS, LON_COLS, WKT_COLS } from "@/lib/geo-parse-utils";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const XLSX: any = (XLSXmod as any).default ?? XLSXmod;

const CHUNK = 500;

export type WorkerIn =
  | { type: "preview"; buffer: ArrayBuffer }
  | { type: "import"; buffer: ArrayBuffer; sheetName: string; latCol: string | null; lonCol: string | null; wktCol: string | null; skipCols: string[] }
  | { type: "next" }; // ack from main thread — send next chunk

export type WorkerOut =
  | { type: "preview"; sheets: { name: string; headers: string[]; latCol: string | null; lonCol: string | null; wktCol: string | null; totalRows: number }[] }
  | { type: "chunk"; features: any[]; done: number; total: number }
  | { type: "done"; total: number }
  | { type: "error"; message: string };

// ── Preview ───────────────────────────────────────────────────────────────────
// Full XLSX parse runs here in the worker so the main thread stays responsive.
function handlePreview(buffer: ArrayBuffer) {
  try {
    const wb = XLSX.read(buffer, { type: "array", sheetRows: 2 });
    const wbFull = XLSX.read(buffer, { type: "array", bookSheets: true });
    // bookSheets only gives us names; use a separate minimal read per sheet to get row count
    // by reading the full workbook but only requesting the dimension metadata
    const wbDims = XLSX.read(buffer, { type: "array", cellFormula: false, cellHTML: false, cellNF: false, cellText: false, cellDates: false, sheetStubs: false });

    const sheets = wb.SheetNames.map((name: string) => {
      const ws = wb.Sheets[name];
      const rows: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
      const headers: string[] = (rows[0] ?? []).map(String);
      const latCol = findCol(headers, LAT_COLS);
      const lonCol = findCol(headers, LON_COLS);
      const wktCol = findCol(headers, WKT_COLS);

      // True row count from the dims-only parse (no cell values allocated)
      const dimWs = wbDims.Sheets[name];
      const ref = dimWs?.["!ref"];
      const totalRows = ref ? Math.max(0, XLSX.utils.decode_range(ref).e.r) : 0;

      return { name, headers, latCol, lonCol, wktCol, totalRows };
    });
    self.postMessage({ type: "preview", sheets } satisfies WorkerOut);
  } catch (err: any) {
    self.postMessage({ type: "error", message: err?.message ?? "Failed to read XLSX" } satisfies WorkerOut);
  }
}

// ── Import ────────────────────────────────────────────────────────────────────
// Uses request/response ack pattern: send one chunk, wait for "next" from main
// thread before sending the next. This prevents flooding the message queue and
// ensures progress updates reflect actual DB inserts, not just parsing speed.
let importGen: Generator<WorkerOut, void, unknown> | null = null;

function* makeImportGen(buffer: ArrayBuffer, sheetName: string, latCol: string | null, lonCol: string | null, wktCol: string | null, skipCols: Set<string>): Generator<WorkerOut, void, unknown> {
  try {
    const wb = XLSX.read(buffer, { type: "array" });
    const ws = wb.Sheets[sheetName] ?? wb.Sheets[wb.SheetNames[0]];
    const allRows: Record<string, any>[] = XLSX.utils.sheet_to_json(ws, { defval: "" });
    const total = allRows.length;

    for (let i = 0; i < total; i += CHUNK) {
      const chunk: Record<string, string>[] = allRows.slice(i, i + CHUNK).map((r) => {
        const out: Record<string, string> = {};
        for (const [k, v] of Object.entries(r)) out[k] = v == null ? "" : String(v);
        return out;
      });
      const features = rowsToFeatures(chunk, latCol, lonCol, wktCol, skipCols);
      yield { type: "chunk", features, done: Math.min(i + CHUNK, total), total };
    }
    yield { type: "done", total };
  } catch (err: any) {
    yield { type: "error", message: err?.message ?? "Failed to parse XLSX" };
  }
}

self.onmessage = (e: MessageEvent<WorkerIn>) => {
  const msg = e.data;

  if (msg.type === "preview") {
    handlePreview(msg.buffer);
    return;
  }

  if (msg.type === "import") {
    importGen = makeImportGen(
      msg.buffer, msg.sheetName,
      msg.latCol, msg.lonCol, msg.wktCol,
      new Set(msg.skipCols),
    );
    // Send first chunk immediately
    const first = importGen.next();
    if (!first.done) self.postMessage(first.value satisfies WorkerOut);
    return;
  }

  if (msg.type === "next") {
    if (!importGen) return;
    const next = importGen.next();
    if (!next.done) self.postMessage(next.value satisfies WorkerOut);
    return;
  }
};
