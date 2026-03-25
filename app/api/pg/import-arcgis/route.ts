import { NextRequest } from "next/server";
import { getPool } from "@/lib/pool";
import { resolveDsn } from "@/lib/resolve-dsn";

// Allow long-running imports on Vercel Pro / self-hosted
export const maxDuration = 300;

const VALID_IDENT = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function qi(name: string) {
  return '"' + name.replace(/"/g, '""') + '"';
}

// Max rows per VALUES clause — keeps param count well under the 65535 pg limit
const INSERT_BATCH = 500;

export async function POST(req: NextRequest) {
  const { dsn: dsnToken, schema, table, layerUrl, outFields, columns, batchSize: batchSizeParam, startOffset: startOffsetParam } = await req.json();

  let dsn: string;
  try { dsn = resolveDsn(dsnToken); }
  catch { return Response.json({ error: "Invalid token" }, { status: 400 }); }

  if (!VALID_IDENT.test(schema) || !VALID_IDENT.test(table))
    return Response.json({ error: "Invalid schema or table" }, { status: 400 });

  if (!Array.isArray(columns) || columns.length === 0)
    return Response.json({ error: "No columns" }, { status: 400 });

  for (const col of columns) {
    if (!VALID_IDENT.test(col.pgName))
      return Response.json({ error: `Invalid column name: ${col.pgName}` }, { status: 400 });
  }

  if (typeof layerUrl !== "string" || !layerUrl.startsWith("https://"))
    return Response.json({ error: "Invalid layer URL" }, { status: 400 });

  const fetchBatchSize = Math.min(parseInt(batchSizeParam ?? "2000") || 2000, 2000);
  const startOffset = Math.max(0, parseInt(startOffsetParam ?? "0") || 0);

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(data: object) {
        controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
      }

      const pool = getPool(dsn);
      const tableIdent = `${qi(schema)}.${qi(table)}`;
      const colIdents = [qi("geom"), ...columns.map((c: any) => qi(c.pgName))].join(", ");

      // Get count for progress reporting (best-effort)
      let total = 0;
      try {
        const r = await fetch(`${layerUrl}/query?where=1%3D1&returnCountOnly=true&f=json`,
          { headers: { Accept: "application/json" } });
        const j = await r.json();
        total = j.count ?? 0;
      } catch {}
      send({ type: "progress", done: startOffset, total, nextOffset: startOffset });

      async function fetchBatch(offset: number): Promise<any[]> {
        const url = `${layerUrl}/query?where=1%3D1&outFields=${outFields}&resultOffset=${offset}&resultRecordCount=${fetchBatchSize}&f=geojson`;
        const res = await fetch(url, { headers: { Accept: "application/geo+json,application/json" } });
        if (!res.ok) throw new Error(`ArcGIS returned HTTP ${res.status}`);
        const data = await res.json();
        if (data.error) throw new Error(data.error.message ?? "ArcGIS query error");
        return data.features ?? [];
      }

      async function insertFeatures(features: any[]): Promise<number> {
        const valid = features.filter((f: any) => f.geometry != null);
        if (valid.length === 0) return 0;

        const client = await pool.connect();
        try {
          let inserted = 0;
          // Sub-batch to stay under pg's 65535 param limit
          for (let i = 0; i < valid.length; i += INSERT_BATCH) {
            const slice = valid.slice(i, i + INSERT_BATCH);
            const params: any[] = [];
            const valueClauses: string[] = [];

            for (const f of slice) {
              const placeholders: string[] = [];
              params.push(JSON.stringify(f.geometry));
              placeholders.push(`ST_SetSRID(ST_GeomFromGeoJSON($${params.length}), 4326)`);
              for (const col of columns) {
                const val = f.properties?.[col.origName];
                params.push(val == null ? null : String(val));
                placeholders.push(`$${params.length}`);
              }
              valueClauses.push(`(${placeholders.join(", ")})`);
            }

            await client.query(
              `INSERT INTO ${tableIdent} (${colIdents}) VALUES ${valueClauses.join(", ")}`,
              params
            );
            inserted += slice.length;
          }
          return inserted;
        } finally {
          client.release();
        }
      }

      try {
        let done = startOffset;
        // Pipeline: start fetching next batch while current is being inserted
        let nextFetch = fetchBatch(startOffset);
        for (let offset = startOffset; ; offset += fetchBatchSize) {
          const features = await nextFetch;
          if (features.length === 0) break;
          const isLast = features.length < fetchBatchSize;
          if (!isLast) nextFetch = fetchBatch(offset + fetchBatchSize);

          const inserted = await insertFeatures(features);
          done += inserted;
          const nextOffset = offset + fetchBatchSize;
          send({ type: "progress", done, total: Math.max(total, done), nextOffset });
          if (isLast) break;
        }
        send({ type: "done", done });
      } catch (e: any) {
        send({ type: "error", message: e.message ?? "Import failed" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
    },
  });
}
