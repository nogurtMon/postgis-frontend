import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

function ident(...parts: string[]) {
  return parts.map((p) => `"${p.replace(/"/g, '""')}"`).join(".");
}

const pools = new Map<string, Pool>();
function getPool(dsn: string) {
  if (!pools.has(dsn)) pools.set(dsn, new Pool({ connectionString: dsn, max: 5 }));
  return pools.get(dsn)!;
}

const VALID_IDENT = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export async function POST(req: NextRequest) {
  const { dsn, schema, table, geomCol } = await req.json();

  if (!dsn?.startsWith("postgres"))
    return NextResponse.json({ error: "Bad DSN" }, { status: 400 });
  if (!VALID_IDENT.test(schema) || !VALID_IDENT.test(table))
    return NextResponse.json({ error: "Invalid schema or table" }, { status: 400 });

  const col = geomCol ?? "geom";
  if (!VALID_IDENT.test(col))
    return NextResponse.json({ error: "Invalid geometry column" }, { status: 400 });

  const pool = getPool(dsn);
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT
         ST_XMin(ext) AS xmin,
         ST_YMin(ext) AS ymin,
         ST_XMax(ext) AS xmax,
         ST_YMax(ext) AS ymax
       FROM (
         SELECT ST_Extent(ST_Transform(${ident(col)}::geometry, 4326)) AS ext
         FROM ${ident(schema, table)}
       ) t`
    );
    const row = rows[0];
    if (!row || row.xmin == null) {
      return NextResponse.json({ error: "Table is empty or has no geometry" }, { status: 404 });
    }
    return NextResponse.json({
      xmin: Number(row.xmin),
      ymin: Number(row.ymin),
      xmax: Number(row.xmax),
      ymax: Number(row.ymax),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  } finally {
    client.release();
  }
}
