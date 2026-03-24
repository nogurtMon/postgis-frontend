import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/pool";
import { resolveDsn } from "@/lib/resolve-dsn";

function ident(...parts: string[]) {
  return parts.map((p) => `"${p.replace(/"/g, '""')}"`).join(".");
}

const VALID_IDENT = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export async function POST(req: NextRequest) {
  const { dsn: dsnToken, schema, table, rows, srid } = await req.json();

  let dsn: string;
  try { dsn = resolveDsn(dsnToken); }
  catch { return NextResponse.json({ error: "Invalid token" }, { status: 400 }); }

  if (!VALID_IDENT.test(schema) || !VALID_IDENT.test(table))
    return NextResponse.json({ error: "Invalid schema or table" }, { status: 400 });
  const sridNum = parseInt(srid ?? "4326");
  if (isNaN(sridNum))
    return NextResponse.json({ error: "Invalid SRID" }, { status: 400 });

  if (!Array.isArray(rows) || rows.length === 0)
    return NextResponse.json({ inserted: 0 });

  const attrCols = Object.keys(rows[0]?.attrs ?? {});
  for (const col of attrCols) {
    if (!VALID_IDENT.test(col))
      return NextResponse.json({ error: `Invalid column: ${col}` }, { status: 400 });
  }

  const pool = getPool(dsn);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    let inserted = 0;
    for (const row of rows) {
      const attrs = row.attrs ?? {};
      const attrEntries = Object.entries(attrs);
      const colList: string[] = [];
      const valList: string[] = [];
      const paramValues: any[] = [];

      if (row.geomJson != null) {
        colList.push(ident("geom"));
        paramValues.push(row.geomJson);
        valList.push(`ST_SetSRID(ST_GeomFromGeoJSON($${paramValues.length}), ${sridNum})`);
      }

      for (const [col, val] of attrEntries) {
        colList.push(ident(col));
        paramValues.push(val === "" ? null : val);
        valList.push(`$${paramValues.length}`);
      }

      if (colList.length === 0) continue;

      await client.query(
        `INSERT INTO ${ident(schema, table)} (${colList.join(", ")}) VALUES (${valList.join(", ")})`,
        paramValues
      );
      inserted++;
    }

    await client.query("COMMIT");
    return NextResponse.json({ inserted });
  } catch (e: any) {
    await client.query("ROLLBACK");
    return NextResponse.json({ error: e.message }, { status: 500 });
  } finally {
    client.release();
  }
}
