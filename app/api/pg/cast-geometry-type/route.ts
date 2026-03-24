import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/pool";
import { resolveDsn } from "@/lib/resolve-dsn";

function ident(...parts: string[]) {
  return parts.map((p) => `"${p.replace(/"/g, '""')}"`).join(".");
}


const VALID_IDENT = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

const ALLOWED_GEOM_TYPES = new Set([
  "Point", "MultiPoint",
  "LineString", "MultiLineString",
  "Polygon", "MultiPolygon",
  "GeometryCollection",
]);

export async function POST(req: NextRequest) {
  const { dsn: dsnToken, schema, table, geomCol, newType, srid } = await req.json();
  let dsn: string;
  try { dsn = resolveDsn(dsnToken); }
  catch { return NextResponse.json({ error: "Invalid token" }, { status: 400 }); }
  if (!VALID_IDENT.test(schema) || !VALID_IDENT.test(table))
    return NextResponse.json({ error: "Invalid schema or table" }, { status: 400 });

  const col = geomCol ?? "geom";
  if (!VALID_IDENT.test(col))
    return NextResponse.json({ error: "Invalid geometry column" }, { status: 400 });
  if (!ALLOWED_GEOM_TYPES.has(newType))
    return NextResponse.json({ error: "Invalid geometry type" }, { status: 400 });

  const sridNum = parseInt(srid, 10);
  if (!Number.isFinite(sridNum) || sridNum < 0)
    return NextResponse.json({ error: "Invalid SRID" }, { status: 400 });

  const pool = getPool(dsn);
  const client = await pool.connect();
  try {
    await client.query(
      `ALTER TABLE ${ident(schema, table)}
       ALTER COLUMN ${ident(col)} TYPE geometry(${newType}, ${sridNum})
       USING ${ident(col)}::geometry(${newType}, ${sridNum})`
    );
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  } finally {
    client.release();
  }
}
