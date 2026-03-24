import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/pool";
import { resolveDsn } from "@/lib/resolve-dsn";


const VALID_IDENT = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
function ident(...parts: string[]) {
  return parts.map((p) => `"${p.replace(/"/g, '""')}"`).join(".");
}

export async function POST(req: NextRequest) {
  const { dsn: dsnToken, schema, table, geomCol, id } = await req.json();
  let dsn: string;
  try { dsn = resolveDsn(dsnToken); }
  catch { return NextResponse.json({ error: "Invalid token" }, { status: 400 }); }
  if (!VALID_IDENT.test(schema) || !VALID_IDENT.test(table))
    return NextResponse.json({ error: "Invalid schema or table" }, { status: 400 });

  const geomColName = geomCol ?? "geom";
  if (!VALID_IDENT.test(geomColName))
    return NextResponse.json({ error: "Invalid geom column" }, { status: 400 });

  const idNum = parseInt(id);
  if (isNaN(idNum))
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  try {
    const pool = getPool(dsn);
    const result = await pool.query(
      `SELECT ST_AsGeoJSON(ST_Transform(ST_Force2D(${ident(geomColName)}), 4326)) AS geojson
       FROM ${ident(schema, table)} WHERE id = $1`,
      [idNum]
    );
    if (!result.rows[0]?.geojson)
      return NextResponse.json({ error: "Feature not found" }, { status: 404 });
    return NextResponse.json({ geojson: JSON.parse(result.rows[0].geojson) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
