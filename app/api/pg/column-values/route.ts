import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

function ident(name: string) {
  return `"${name.replace(/"/g, '""')}"`;
}

const pools = new Map<string, Pool>();
function getPool(dsn: string) {
  if (!pools.has(dsn)) pools.set(dsn, new Pool({ connectionString: dsn, max: 5 }));
  return pools.get(dsn)!;
}

// If a column has more than this many distinct values, the UI switches from
// multi-select to a text-contains input.
const DISTINCT_LIMIT = 50;

export async function POST(req: NextRequest) {
  const { dsn, schema, table, column } = await req.json();

  if (!dsn?.startsWith("postgres"))
    return NextResponse.json({ error: "Bad DSN" }, { status: 400 });

  const pool = getPool(dsn);
  let client;
  try {
    client = await pool.connect();

    // Get the column's data type
    const typeRes = await client.query(
      `SELECT data_type, udt_name
       FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = $2 AND column_name = $3`,
      [schema, table, column]
    );
    if (typeRes.rows.length === 0)
      return NextResponse.json({ error: "Column not found" }, { status: 404 });

    const { data_type: dataType, udt_name: udtName } = typeRes.rows[0];
    const isGeom = udtName === "geometry" || udtName === "geography";
    if (isGeom)
      return NextResponse.json({ error: "Cannot filter on geometry column" }, { status: 400 });

    // Fetch distinct values (one extra to detect truncation)
    const { rows } = await client.query(
      `SELECT DISTINCT ${ident(column)}::text AS val
       FROM ${ident(schema)}.${ident(table)}
       WHERE ${ident(column)} IS NOT NULL
       ORDER BY val ASC
       LIMIT ${DISTINCT_LIMIT + 1}`
    );

    const truncated = rows.length > DISTINCT_LIMIT;
    const values = rows.slice(0, DISTINCT_LIMIT).map((r) => r.val as string);

    return NextResponse.json({ dataType, values, truncated });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  } finally {
    client?.release();
  }
}
