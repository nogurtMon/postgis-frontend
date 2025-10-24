// app/api/pg/tables/route.ts
import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

const pools = new Map<string, Pool>();
function getPool(dsn: string) {
  if (!pools.has(dsn)) pools.set(dsn, new Pool({ connectionString: dsn, max: 5 }));
  return pools.get(dsn)!;
}

export async function POST(req: NextRequest) {
  const { dsn } = await req.json();
  if (!dsn?.startsWith("postgres")) return NextResponse.json({ error: "Bad DSN" }, { status: 400 });
  const pool = getPool(dsn);
  const sql = `
    SELECT t.table_schema, t.table_name,
           gc.f_geometry_column AS geom_col, gc.type AS geom_type, gc.srid
    FROM information_schema.tables t
    LEFT JOIN public.geometry_columns gc
      ON gc.f_table_schema=t.table_schema AND gc.f_table_name=t.table_name
    WHERE t.table_type='BASE TABLE'
      AND t.table_schema NOT IN ('pg_catalog','information_schema')
    ORDER BY t.table_schema, t.table_name;
  `;
  const { rows } = await pool.query(sql);
  return NextResponse.json({ tables: rows });
}