import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

function ident(...parts: string[]) {
  return parts.map((p) => `"${p.replace(/"/g, '""')}"`).join(".");
}

const pools = new Map<string, Pool>();
function getPool(dsn: string) {
  if (!pools.has(dsn)) pools.set(dsn, new Pool({ connectionString: dsn, max: 5 }));
  return pools.get(dsn)!;
}

const VALID_IDENT = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const TEXT_TYPES = new Set([
  "text", "character varying", "character", "name", "citext", "varchar",
]);

// POST — query / browse rows (pagination, sort, search)
export async function POST(req: NextRequest) {
  const {
    dsn, schema, table,
    page = 0, pageSize = 100,
    sortCol, sortDir = "asc",
    search,
  } = await req.json();

  if (!dsn?.startsWith("postgres"))
    return NextResponse.json({ error: "Bad DSN" }, { status: 400 });
  if (!VALID_IDENT.test(schema) || !VALID_IDENT.test(table))
    return NextResponse.json({ error: "Invalid schema or table" }, { status: 400 });

  const pool = getPool(dsn);
  const client = await pool.connect();
  try {
    const colRes = await client.query(
      `SELECT column_name, udt_name, data_type
       FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = $2
       ORDER BY ordinal_position`,
      [schema, table]
    );
    if (colRes.rows.length === 0)
      return NextResponse.json({ error: "Table not found or has no columns" }, { status: 404 });

    const columns: { name: string; dataType: string; isGeom: boolean }[] =
      colRes.rows.map((r) => ({
        name: r.column_name as string,
        dataType: r.data_type as string,
        isGeom: r.udt_name === "geometry" || r.udt_name === "geography",
      }));

    const validSort =
      sortCol && columns.some((c) => c.name === sortCol && !c.isGeom)
        ? (sortCol as string)
        : null;
    const validDir = sortDir === "desc" ? "DESC" : "ASC";

    // ctid is the row identity; geometry cols shown as WKT
    const selectParts = [
      "ctid::text AS _ctid",
      ...columns.map((c) =>
        c.isGeom
          ? `ST_AsText(${ident(c.name)}) AS ${ident(c.name)}`
          : ident(c.name)
      ),
    ];

    const params: any[] = [];
    let whereClause = "";
    if (search?.trim()) {
      const textCols = columns.filter(
        (c) => !c.isGeom && TEXT_TYPES.has(c.dataType)
      );
      if (textCols.length > 0) {
        const conditions = textCols.map((c) => {
          params.push(`%${search.trim()}%`);
          return `${ident(c.name)} ILIKE $${params.length}`;
        });
        whereClause = `WHERE (${conditions.join(" OR ")})`;
      }
    }

    const countRes = await client.query(
      `SELECT COUNT(*) FROM ${ident(schema, table)} ${whereClause}`,
      params
    );
    const total = parseInt(countRes.rows[0].count);

    const orderClause = validSort
      ? `ORDER BY ${ident(validSort)} ${validDir}`
      : "ORDER BY ctid";

    params.push(pageSize, page * pageSize);
    const rowsRes = await client.query(
      `SELECT ${selectParts.join(", ")}
       FROM ${ident(schema, table)}
       ${whereClause}
       ${orderClause}
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return NextResponse.json({ columns, rows: rowsRes.rows, total });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  } finally {
    client.release();
  }
}

// PATCH — update a single cell by ctid
export async function PATCH(req: NextRequest) {
  const { dsn, schema, table, ctid, column, value } = await req.json();

  if (!dsn?.startsWith("postgres"))
    return NextResponse.json({ error: "Bad DSN" }, { status: 400 });
  if (!VALID_IDENT.test(schema) || !VALID_IDENT.test(table) || !VALID_IDENT.test(column))
    return NextResponse.json({ error: "Invalid identifiers" }, { status: 400 });
  if (typeof ctid !== "string")
    return NextResponse.json({ error: "Invalid ctid" }, { status: 400 });

  const pool = getPool(dsn);
  const client = await pool.connect();
  try {
    await client.query(
      `UPDATE ${ident(schema, table)} SET ${ident(column)} = $1 WHERE ctid = $2::tid`,
      [value === "" ? null : value, ctid]
    );
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  } finally {
    client.release();
  }
}

// DELETE — delete rows by ctid array
export async function DELETE(req: NextRequest) {
  const { dsn, schema, table, ctids } = await req.json();

  if (!dsn?.startsWith("postgres"))
    return NextResponse.json({ error: "Bad DSN" }, { status: 400 });
  if (!VALID_IDENT.test(schema) || !VALID_IDENT.test(table))
    return NextResponse.json({ error: "Invalid schema or table" }, { status: 400 });
  if (!Array.isArray(ctids) || ctids.length === 0)
    return NextResponse.json({ deleted: 0 });

  const pool = getPool(dsn);
  const client = await pool.connect();
  try {
    const result = await client.query(
      `DELETE FROM ${ident(schema, table)} WHERE ctid = ANY($1::tid[])`,
      [ctids]
    );
    return NextResponse.json({ deleted: result.rowCount });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  } finally {
    client.release();
  }
}

// PUT — insert a new row (attribute values only, geometry stays null)
export async function PUT(req: NextRequest) {
  const { dsn, schema, table, values } = await req.json();

  if (!dsn?.startsWith("postgres"))
    return NextResponse.json({ error: "Bad DSN" }, { status: 400 });
  if (!VALID_IDENT.test(schema) || !VALID_IDENT.test(table))
    return NextResponse.json({ error: "Invalid schema or table" }, { status: 400 });

  const entries = Object.entries(values ?? {}).filter(([col]) =>
    VALID_IDENT.test(col)
  );

  const pool = getPool(dsn);
  const client = await pool.connect();
  try {
    if (entries.length === 0) {
      await client.query(`INSERT INTO ${ident(schema, table)} DEFAULT VALUES`);
    } else {
      const cols = entries.map(([col]) => ident(col));
      const vals = entries.map(([, v]) => (v === "" ? null : v));
      const placeholders = vals.map((_, i) => `$${i + 1}`);
      await client.query(
        `INSERT INTO ${ident(schema, table)} (${cols.join(", ")}) VALUES (${placeholders.join(", ")})`,
        vals
      );
    }
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  } finally {
    client.release();
  }
}
