import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/pool";
import { resolveDsn } from "@/lib/resolve-dsn";

// Safe because all identifiers are pre-validated against VALID_IDENT before use
function ident(...parts: string[]) {
  return parts.map((p) => `"${p.replace(/"/g, '""')}"`).join(".");
}


const VALID_IDENT = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const VALID_GEOM_TYPES = ["Point", "MultiPoint", "LineString", "MultiLineString", "Polygon", "MultiPolygon", "Geometry"];

export async function POST(req: NextRequest) {
  const { dsn: dsnToken, schema, table, geomType, srid, columns, timestamps } = await req.json();
  let dsn: string;
  try { dsn = resolveDsn(dsnToken); }
  catch { return NextResponse.json({ error: "Invalid token" }, { status: 400 }); }
  if (!VALID_IDENT.test(schema) || !VALID_IDENT.test(table))
    return NextResponse.json({ error: "Invalid schema or table name. Use letters, numbers, and underscores only." }, { status: 400 });
  if (!VALID_GEOM_TYPES.includes(geomType))
    return NextResponse.json({ error: "Invalid geometry type" }, { status: 400 });

  const sridNum = parseInt(srid);
  if (isNaN(sridNum))
    return NextResponse.json({ error: "Invalid SRID" }, { status: 400 });

  for (const col of columns ?? []) {
    if (!VALID_IDENT.test(col.name))
      return NextResponse.json({ error: `Invalid column name: "${col.name}". Use letters, numbers, and underscores only.` }, { status: 400 });
    if (!["text", "numeric", "datetime"].includes(col.type))
      return NextResponse.json({ error: `Invalid column type: ${col.type}` }, { status: 400 });
  }

  const pool = getPool(dsn);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(`CREATE SCHEMA IF NOT EXISTS ${ident(schema)}`);

    // Build column list
    const colParts: string[] = ["id SERIAL PRIMARY KEY"];
    if (timestamps) {
      colParts.push(
        "created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP",
        "last_updated TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP",
      );
    }
    colParts.push(`geom GEOMETRY(${geomType}, ${sridNum})`);

    for (const col of columns ?? []) {
      const typeSql = col.type === "text" ? "TEXT" : col.type === "datetime" ? "TIMESTAMPTZ" : "NUMERIC";
      const notNull = col.notNull ? " NOT NULL" : "";
      colParts.push(`${ident(col.name)} ${typeSql}${notNull}`);
    }

    const tableIdent = ident(schema, table);

    await client.query(
      `CREATE TABLE ${tableIdent} (\n  ${colParts.join(",\n  ")}\n)`
    );

    // Spatial index
    await client.query(`CREATE INDEX ON ${tableIdent} USING GIST (geom)`);

    // Trigger for auto-updating last_updated (only when timestamps are enabled)
    if (timestamps) {
      const fnIdent = ident(schema, `update_last_updated_${table}`);
      const triggerIdent = ident(`${table}_last_updated_trg`);

      await client.query(`
        CREATE OR REPLACE FUNCTION ${fnIdent}()
        RETURNS TRIGGER LANGUAGE plpgsql AS $$
        BEGIN
          NEW.last_updated = CURRENT_TIMESTAMP;
          RETURN NEW;
        END;
        $$
      `);

      await client.query(`
        CREATE TRIGGER ${triggerIdent}
        BEFORE UPDATE ON ${tableIdent}
        FOR EACH ROW EXECUTE FUNCTION ${fnIdent}()
      `);
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
