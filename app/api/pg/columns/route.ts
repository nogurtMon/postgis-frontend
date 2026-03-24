import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/pool";
import { resolveDsn } from "@/lib/resolve-dsn";


export async function POST(req: NextRequest) {
  const { dsn: dsnToken, schema, table } = await req.json();
  let dsn: string;
  try { dsn = resolveDsn(dsnToken); }
  catch { return NextResponse.json({ error: "Invalid token" }, { status: 400 }); }
  if (!schema || !table)
    return NextResponse.json({ error: "Missing schema or table" }, { status: 400 });

  const pool = getPool(dsn);
  try {
    const { rows } = await pool.query(
      `SELECT column_name, data_type, udt_name, column_default, is_identity
       FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = $2
       ORDER BY ordinal_position`,
      [schema, table]
    );
    return NextResponse.json({
      columns: rows.map((r: any) => ({
        name: r.column_name as string,
        dataType: r.data_type as string,
        isGeom: r.udt_name === "geometry" || r.udt_name === "geography",
        hasDefault: r.column_default !== null || r.is_identity === "YES",
      })),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
