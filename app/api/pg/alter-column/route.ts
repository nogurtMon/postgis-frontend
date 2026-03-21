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

const ALLOWED_TYPES = new Set([
  "text", "integer", "bigint", "smallint", "numeric", "real", "double precision",
  "boolean", "date", "timestamp", "timestamptz", "uuid", "jsonb", "json",
]);

export async function POST(req: NextRequest) {
  const { dsn, schema, table, action, column, newName, type, notNull, defaultValue } = await req.json();

  if (!dsn?.startsWith("postgres"))
    return NextResponse.json({ error: "Bad DSN" }, { status: 400 });
  if (!VALID_IDENT.test(schema) || !VALID_IDENT.test(table))
    return NextResponse.json({ error: "Invalid schema or table" }, { status: 400 });

  const pool = getPool(dsn);
  const client = await pool.connect();
  const tbl = ident(schema, table);

  try {
    if (action === "add") {
      if (!VALID_IDENT.test(column))
        return NextResponse.json({ error: "Invalid column name" }, { status: 400 });
      if (!ALLOWED_TYPES.has(type))
        return NextResponse.json({ error: "Invalid column type" }, { status: 400 });

      const hasDefault = defaultValue != null && defaultValue !== "";
      const base = `ALTER TABLE ${tbl} ADD COLUMN ${ident(column)} ${type}${notNull ? " NOT NULL" : ""}`;
      if (hasDefault) {
        await client.query(`${base} DEFAULT $1::${type}`, [defaultValue]);
      } else {
        await client.query(base);
      }
      return NextResponse.json({ success: true });
    }

    if (action === "drop") {
      if (!VALID_IDENT.test(column))
        return NextResponse.json({ error: "Invalid column name" }, { status: 400 });
      await client.query(`ALTER TABLE ${tbl} DROP COLUMN ${ident(column)}`);
      return NextResponse.json({ success: true });
    }

    if (action === "rename") {
      if (!VALID_IDENT.test(column) || !VALID_IDENT.test(newName))
        return NextResponse.json({ error: "Invalid column name" }, { status: 400 });
      await client.query(
        `ALTER TABLE ${tbl} RENAME COLUMN ${ident(column)} TO ${ident(newName)}`
      );
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  } finally {
    client.release();
  }
}
