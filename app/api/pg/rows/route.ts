import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

// Safe because all identifiers are pre-validated against VALID_IDENT before use
function ident(...parts: string[]) {
  return parts.map((p) => `"${p.replace(/"/g, '""')}"`).join(".");
}

const pools = new Map<string, Pool>();
function getPool(dsn: string) {
  if (!pools.has(dsn)) pools.set(dsn, new Pool({ connectionString: dsn, max: 5 }));
  return pools.get(dsn)!;
}

const VALID_IDENT = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

// INSERT a new row
export async function POST(req: NextRequest) {
  const { dsn, schema, table, geomCol, srid, lng, lat, attrs } = await req.json();

  if (!dsn?.startsWith("postgres"))
    return NextResponse.json({ error: "Bad DSN" }, { status: 400 });
  if (!VALID_IDENT.test(schema) || !VALID_IDENT.test(table))
    return NextResponse.json({ error: "Invalid schema or table" }, { status: 400 });

  const geomColName = geomCol ?? "geom";
  if (!VALID_IDENT.test(geomColName))
    return NextResponse.json({ error: "Invalid geom column" }, { status: 400 });

  const sridNum = parseInt(srid ?? "4326");
  if (isNaN(sridNum))
    return NextResponse.json({ error: "Invalid SRID" }, { status: 400 });

  const attrEntries = Object.entries(attrs ?? {});
  for (const [col] of attrEntries) {
    if (!VALID_IDENT.test(col))
      return NextResponse.json({ error: `Invalid column: ${col}` }, { status: 400 });
  }

  // Check whether the 'id' column exists but has no default (e.g. imported tables).
  // If so, auto-generate one with MAX(id)+1 rather than making the user fill it in.
  const idCheck = await pool.query(
    `SELECT column_default, is_identity FROM information_schema.columns
     WHERE table_schema = $1 AND table_name = $2 AND column_name = 'id'`,
    [schema, table]
  );
  const idRow = idCheck.rows[0];
  const idNeedsValue = idRow && idRow.column_default === null && idRow.is_identity !== "YES";

  const geomExpr = sridNum === 4326
    ? `ST_SetSRID(ST_MakePoint($1, $2), 4326)`
    : `ST_Transform(ST_SetSRID(ST_MakePoint($1, $2), 4326), ${sridNum})`;

  const paramValues: any[] = [lng, lat];
  const colList = [ident(geomColName)];
  const valList = [geomExpr];

  if (idNeedsValue) {
    colList.unshift(ident("id"));
    valList.unshift(`(SELECT COALESCE(MAX(${ident("id")}), 0) + 1 FROM ${ident(schema, table)})`);
  }

  for (const [col, val] of attrEntries) {
    paramValues.push(val === "" ? null : val);
    colList.push(ident(col));
    valList.push(`$${paramValues.length}`);
  }

  const sql = `INSERT INTO ${ident(schema, table)} (${colList.join(", ")}) VALUES (${valList.join(", ")}) RETURNING id`;

  try {
    const pool = getPool(dsn);
    const result = await pool.query(sql, paramValues);
    return NextResponse.json({ success: true, id: result.rows[0]?.id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// UPDATE a row by id
export async function PUT(req: NextRequest) {
  const { dsn, schema, table, geomCol, srid, id, lng, lat, attrs } = await req.json();

  if (!dsn?.startsWith("postgres"))
    return NextResponse.json({ error: "Bad DSN" }, { status: 400 });
  if (!VALID_IDENT.test(schema) || !VALID_IDENT.test(table))
    return NextResponse.json({ error: "Invalid schema or table" }, { status: 400 });

  const geomColName = geomCol ?? "geom";
  if (!VALID_IDENT.test(geomColName))
    return NextResponse.json({ error: "Invalid geom column" }, { status: 400 });

  const sridNum = parseInt(srid ?? "4326");
  if (isNaN(sridNum))
    return NextResponse.json({ error: "Invalid SRID" }, { status: 400 });

  const idNum = parseInt(id);
  if (isNaN(idNum))
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const attrEntries = Object.entries(attrs ?? {});
  for (const [col] of attrEntries) {
    if (!VALID_IDENT.test(col))
      return NextResponse.json({ error: `Invalid column: ${col}` }, { status: 400 });
  }

  const geomExpr = sridNum === 4326
    ? `ST_SetSRID(ST_MakePoint($1, $2), 4326)`
    : `ST_Transform(ST_SetSRID(ST_MakePoint($1, $2), 4326), ${sridNum})`;

  // $1=lng, $2=lat, $3=id
  const paramValues: any[] = [lng, lat, idNum];
  const setParts: string[] = [`${ident(geomColName)} = ${geomExpr}`];

  for (const [col, val] of attrEntries) {
    paramValues.push(val === "" ? null : val);
    setParts.push(`${ident(col)} = $${paramValues.length}`);
  }

  const sql = `UPDATE ${ident(schema, table)} SET ${setParts.join(", ")} WHERE id = $3`;

  try {
    const pool = getPool(dsn);
    await pool.query(sql, paramValues);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// DELETE a row by id
export async function DELETE(req: NextRequest) {
  const { dsn, schema, table, id } = await req.json();

  if (!dsn?.startsWith("postgres"))
    return NextResponse.json({ error: "Bad DSN" }, { status: 400 });
  if (!VALID_IDENT.test(schema) || !VALID_IDENT.test(table))
    return NextResponse.json({ error: "Invalid schema or table" }, { status: 400 });

  const idNum = parseInt(id);
  if (isNaN(idNum))
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  try {
    const pool = getPool(dsn);
    await pool.query(`DELETE FROM ${ident(schema, table)} WHERE id = $1`, [idNum]);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
