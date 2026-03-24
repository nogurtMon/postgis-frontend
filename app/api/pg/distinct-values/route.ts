import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/pool";
import { resolveDsn } from "@/lib/resolve-dsn";


function ident(...parts: string[]) {
  return parts.map((p) => `"${p.replace(/"/g, '""')}"`).join(".");
}

const VALID_IDENT = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export async function POST(req: NextRequest) {
  const { dsn: dsnToken, schema, table, column } = await req.json();
  let dsn: string;
  try { dsn = resolveDsn(dsnToken); }
  catch { return NextResponse.json({ error: "Invalid token" }, { status: 400 }); }
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
