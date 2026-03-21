import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

const pools = new Map<string, Pool>();
function getPool(dsn: string) {
  if (!pools.has(dsn)) pools.set(dsn, new Pool({ connectionString: dsn, max: 5 }));
  return pools.get(dsn)!;
}

// UpdateGeometrySRID only updates the SRID metadata — it does NOT reproject coordinates.
// Use this when the data is already in the target CRS but was imported without an SRID label.
export async function POST(req: NextRequest) {
  const { dsn, schema, table, geomCol, srid } = await req.json();

  if (!dsn?.startsWith("postgres"))
    return NextResponse.json({ error: "Bad DSN" }, { status: 400 });

  const sridNum = parseInt(srid);
  if (isNaN(sridNum))
    return NextResponse.json({ error: "Invalid SRID" }, { status: 400 });

  try {
    const pool = getPool(dsn);
    await pool.query(
      `SELECT UpdateGeometrySRID($1, $2, $3, $4)`,
      [schema, table, geomCol ?? "geom", sridNum]
    );
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
