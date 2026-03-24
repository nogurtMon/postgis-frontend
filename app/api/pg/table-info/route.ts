import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/pool";
import { resolveDsn } from "@/lib/resolve-dsn";


const VALID_IDENT = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export async function POST(req: NextRequest) {
  const { dsn: dsnToken, schema, table } = await req.json();
  let dsn: string;
  try { dsn = resolveDsn(dsnToken); }
  catch { return NextResponse.json({ error: "Invalid token" }, { status: 400 }); }
  if (!VALID_IDENT.test(schema) || !VALID_IDENT.test(table))
    return NextResponse.json({ error: "Invalid schema or table" }, { status: 400 });

  const pool = getPool(dsn);
  const client = await pool.connect();
  try {
    const [colRes, idxRes, trgRes] = await Promise.all([
      // Columns
      client.query(
        `SELECT
           column_name,
           data_type,
           udt_name,
           is_nullable,
           column_default,
           is_identity,
           character_maximum_length,
           numeric_precision,
           numeric_scale
         FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = $2
         ORDER BY ordinal_position`,
        [schema, table]
      ),
      // Indexes
      client.query(
        `SELECT
           ic.relname                          AS index_name,
           am.amname                           AS access_method,
           ix.indisunique                      AS is_unique,
           ix.indisprimary                     AS is_primary,
           array_agg(a.attname ORDER BY k.ord) AS columns
         FROM pg_index ix
         JOIN pg_class tc  ON tc.oid  = ix.indrelid
         JOIN pg_class ic  ON ic.oid  = ix.indexrelid
         JOIN pg_namespace n ON n.oid = tc.relnamespace
         JOIN pg_am am       ON am.oid = ic.relam
         JOIN LATERAL unnest(ix.indkey::smallint[]) WITH ORDINALITY AS k(attnum, ord)
           ON true
         JOIN pg_attribute a ON a.attrelid = ix.indrelid AND a.attnum = k.attnum
         WHERE n.nspname = $1 AND tc.relname = $2
         GROUP BY ic.relname, am.amname, ix.indisunique, ix.indisprimary
         ORDER BY ix.indisprimary DESC, ic.relname`,
        [schema, table]
      ),
      // Triggers
      client.query(
        `SELECT
           trigger_name,
           event_manipulation  AS event,
           action_timing       AS timing,
           event_object_table  AS table_name,
           action_statement    AS definition
         FROM information_schema.triggers
         WHERE trigger_schema = $1 AND event_object_table = $2
         ORDER BY trigger_name`,
        [schema, table]
      ),
    ]);

    return NextResponse.json({
      columns: colRes.rows,
      indexes: idxRes.rows,
      triggers: trgRes.rows,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  } finally {
    client.release();
  }
}
