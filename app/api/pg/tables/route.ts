// app/api/pg/tables/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/pool";
import { resolveDsn } from "@/lib/resolve-dsn";


export async function POST(req: NextRequest) {
  const { dsn: dsnToken } = await req.json();
  let dsn: string;
  try { dsn = resolveDsn(dsnToken); }
  catch { return NextResponse.json({ error: "Invalid token" }, { status: 400 }); }
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
           ) AS has_pk,
           EXISTS (
             SELECT 1
             FROM pg_index idx
             JOIN pg_class ic ON ic.oid = idx.indexrelid
             JOIN pg_am am ON am.oid = ic.relam
             WHERE idx.indrelid = cls.oid
               AND am.amname = 'gist'
               AND a.attnum = ANY(idx.indkey::smallint[])
           ) AS has_spatial_index
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