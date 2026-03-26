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

  const hasGeom = rows[0]?.geomJson != null;
  const pool = getPool(dsn);
  const client = await pool.connect();
  const colList = [
    ...(hasGeom ? [ident("geom")] : []),
    ...attrCols.map((c) => ident(c)),
  ];

  // Sub-batch to stay under pg's 65535 param limit
  const paramsPerRow = (hasGeom ? 1 : 0) + attrCols.length;
  const SUB_BATCH = paramsPerRow > 0 ? Math.min(500, Math.floor(65000 / paramsPerRow)) : 500;

  try {
    await client.query("BEGIN");

    let inserted = 0;
    for (let i = 0; i < rows.length; i += SUB_BATCH) {
      const slice = rows.slice(i, i + SUB_BATCH);
      const params: any[] = [];
      const valueClauses: string[] = [];

      for (const row of slice) {
        const placeholders: string[] = [];
        if (hasGeom) {
          params.push(row.geomJson);
          placeholders.push(`ST_SetSRID(ST_GeomFromGeoJSON($${params.length}), ${sridNum})`);
        }
        for (const col of attrCols) {
          const val = row.attrs?.[col];
          params.push(val === "" ? null : val ?? null);
          placeholders.push(`$${params.length}`);
        }
        valueClauses.push(`(${placeholders.join(", ")})`);
      }

      await client.query(
        `INSERT INTO ${ident(schema, table)} (${colList.join(", ")}) VALUES ${valueClauses.join(", ")}`,
        params
      );
      inserted += slice.length;
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
