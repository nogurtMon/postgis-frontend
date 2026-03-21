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
  // Query pg_catalog directly — more reliable than information_schema for PostGIS types.
  // Returns only tables that have at least one geometry/geography column.
  const sql = `
    SELECT DISTINCT ON (n.nspname, cls.relname)
           n.nspname                      AS table_schema,
           cls.relname                    AS table_name,
           a.attname                      AS geom_col,
           COALESCE(gc.type, upper(t.typname)) AS geom_type,
           COALESCE(gc.srid, 4326)        AS srid,
           GREATEST(cls.reltuples::bigint, 0) AS row_count,
           EXISTS (
             SELECT 1 FROM pg_constraint pk
             WHERE pk.conrelid = cls.oid AND pk.contype = 'p'
           ) AS has_pk
    FROM   pg_class cls
    JOIN   pg_namespace n   ON n.oid = cls.relnamespace
    JOIN   pg_attribute a   ON a.attrelid = cls.oid
                           AND a.attnum > 0
                           AND NOT a.attisdropped
    JOIN   pg_type t        ON t.oid = a.atttypid
                           AND t.typname IN ('geometry','geography')
    LEFT JOIN public.geometry_columns gc
           ON  gc.f_table_schema    = n.nspname
           AND gc.f_table_name      = cls.relname
           AND gc.f_geometry_column = a.attname
    WHERE  cls.relkind = 'r'
      AND  n.nspname NOT IN ('pg_catalog','information_schema','topology','tiger')
    ORDER  BY n.nspname, cls.relname, a.attname;
  `;
  try {
    const { rows } = await pool.query(sql);
    return NextResponse.json({ tables: rows });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}