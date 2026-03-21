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

export async function POST(req: NextRequest) {
  const { dsn, schema, table, newSchema, newTable } = await req.json();

  if (!dsn?.startsWith("postgres"))
    return NextResponse.json({ error: "Bad DSN" }, { status: 400 });
  if (!VALID_IDENT.test(schema) || !VALID_IDENT.test(table))
    return NextResponse.json({ error: "Invalid schema or table" }, { status: 400 });
  if (!VALID_IDENT.test(newSchema) || !VALID_IDENT.test(newTable))
    return NextResponse.json({ error: "Invalid new schema or table name" }, { status: 400 });

  const pool = getPool(dsn);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Rename first (within current schema), then move schema if needed
    if (newTable !== table) {
      await client.query(
        `ALTER TABLE ${ident(schema, table)} RENAME TO ${ident(newTable)}`
      );
    }
    if (newSchema !== schema) {
      await client.query(
        `ALTER TABLE ${ident(schema, newTable)} SET SCHEMA ${ident(newSchema)}`
      );
    }

    await client.query("COMMIT");
    return NextResponse.json({ success: true });
  } catch (e: any) {
    await client.query("ROLLBACK");
    return NextResponse.json({ error: e.message }, { status: 500 });
  } finally {
    client.release();
  }
}
