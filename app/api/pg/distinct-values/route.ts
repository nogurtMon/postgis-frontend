import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

const pools = new Map<string, Pool>();
function getPool(dsn: string) {
  if (!pools.has(dsn)) pools.set(dsn, new Pool({ connectionString: dsn, max: 5 }));
  return pools.get(dsn)!;
}

function ident(...parts: string[]) {
  return parts.map((p) => `"${p.replace(/"/g, '""')}"`).join(".");
}

const VALID_IDENT = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export async function POST(req: NextRequest) {
  const { dsn, schema, table, column } = await req.json();

  if (!dsn?.startsWith("postgres"))
    return NextResponse.json({ error: "Bad DSN" }, { status: 400 });
  if (!VALID_IDENT.test(schema) || !VALID_IDENT.test(table) || !VALID_IDENT.test(column))
    return NextResponse.json({ error: "Invalid identifier" }, { status: 400 });

  try {
    const pool = getPool(dsn);
    const { rows } = await pool.query(
      `SELECT DISTINCT ${ident(column)} AS val
       FROM ${ident(schema, table)}
       WHERE ${ident(column)} IS NOT NULL
       ORDER BY ${ident(column)}
       LIMIT 100`
    );
    return NextResponse.json({ values: rows.map((r: any) => String(r.val)) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
