import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

const pools = new Map<string, Pool>();
function getPool(dsn: string) {
  if (!pools.has(dsn)) pools.set(dsn, new Pool({ connectionString: dsn, max: 5 }));
  return pools.get(dsn)!;
}

export async function POST(req: NextRequest) {
  const { dsn, schema, table } = await req.json();
  if (!dsn?.startsWith("postgres"))
    return NextResponse.json({ error: "Bad DSN" }, { status: 400 });
  if (!schema || !table)
    return NextResponse.json({ error: "Missing schema or table" }, { status: 400 });

  const pool = getPool(dsn);
  try {
    const { rows } = await pool.query(
      `SELECT column_name, data_type, column_default, is_identity
       FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = $2
       ORDER BY ordinal_position`,
      [schema, table]
    );
    return NextResponse.json({
      columns: rows.map((r: any) => ({
        name: r.column_name as string,
        dataType: r.data_type as string,
        hasDefault: r.column_default !== null || r.is_identity === "YES",
      })),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
