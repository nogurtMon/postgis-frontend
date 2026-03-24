import { NextRequest, NextResponse } from "next/server";
import type { Pool } from "pg";
import { getPool } from "@/lib/pool";
import { resolveDsn } from "@/lib/resolve-dsn";


// Safe SQL identifier quoting
function qi(name: string) {
  return '"' + name.replace(/"/g, '""') + '"';
}

// Column name cache: "dsn|schema.table|geomCol" -> column names (excluding geom)
const colCache = new Map<string, string[]>();

async function getNonGeomCols(pool: Pool, schema: string, table: string, geomCol: string, cacheKey: string) {
  if (colCache.has(cacheKey)) return colCache.get(cacheKey)!;
  const { rows } = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = $1 AND table_name = $2
     ORDER BY ordinal_position`,
    [schema, table]
  );
  const cols = rows.map((r: any) => r.column_name as string).filter((c) => c !== geomCol);
  colCache.set(cacheKey, cols);
  return cols;
}

// Valid column name: alphanumeric, underscore, hyphen only
function isValidColName(name: string) {
  return /^[a-zA-Z_][a-zA-Z0-9_\-]*$/.test(name);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ z: string; x: string; y: string }> }
) {
  const { z: zs, x: xs, y: ys } = await params;
  const { searchParams } = req.nextUrl;

  const schema = searchParams.get("schema");
  const table = searchParams.get("table");
  const geomCol = searchParams.get("geomCol") ?? "geom";
  const srid = parseInt(searchParams.get("srid") ?? "4326", 10);

  let dsn: string;
  try { dsn = resolveDsn(searchParams.get("dsn")); }
  catch { return NextResponse.json({ error: "Invalid token" }, { status: 400 }); }
  if (!schema || !table)
    return NextResponse.json({ error: "Missing schema or table" }, { status: 400 });

  const z = parseInt(zs, 10);
  const x = parseInt(xs, 10);
  const y = parseInt(ys, 10);

  // Parse filters JSON
  type TileFilter = { column: string; operator: string; value: string };
  let filters: TileFilter[] = [];
  const filtersParam = searchParams.get("filters");
  if (filtersParam) {
    try { filters = JSON.parse(filtersParam); } catch {}
  }

  const pool = getPool(dsn);

  try {
    const cacheKey = `${dsn}|${schema}.${table}|${geomCol}`;
    const propCols = await getNonGeomCols(pool, schema, table, geomCol, cacheKey);

    // Build parameterized WHERE clauses for filters
    const queryParams: any[] = [table, z, x, y];
    const filterClauses: string[] = [];

    const SAFE_OPS = new Set(["=", "!=", ">", "<", ">=", "<="]);
    for (const f of filters) {
      if (!isValidColName(f.column)) continue;
      const col = qi(f.column);
      switch (f.operator) {
        case "ilike":
          if (!f.value?.trim()) break;
          queryParams.push(`%${f.value.trim()}%`);
          filterClauses.push(`${col}::text ILIKE $${queryParams.length}`);
          break;
        case "starts_with":
          if (!f.value?.trim()) break;
          queryParams.push(`${f.value.trim()}%`);
          filterClauses.push(`${col}::text ILIKE $${queryParams.length}`);
          break;
        case "eq":
          if (!f.value && f.value !== "0") break;
          queryParams.push(f.value);
          filterClauses.push(`${col}::text = $${queryParams.length}`);
          break;
        case "neq":
          if (!f.value && f.value !== "0") break;
          queryParams.push(f.value);
          filterClauses.push(`${col}::text != $${queryParams.length}`);
          break;
        case "gt": case "lt": case "gte": case "lte": {
          if (!f.value && f.value !== "0") break;
          const sqlOp = { gt: ">", lt: "<", gte: ">=", lte: "<=" }[f.operator];
          if (!SAFE_OPS.has(sqlOp!)) break;
          queryParams.push(f.value);
          filterClauses.push(`${col} ${sqlOp} $${queryParams.length}`);
          break;
        }
        case "is_null":
          filterClauses.push(`${col} IS NULL`);
          break;
        case "is_not_null":
          filterClauses.push(`${col} IS NOT NULL`);
          break;
        case "in": {
          if (!f.value?.trim()) break;
          const vals = f.value.split(",").map((v) => v.trim()).filter(Boolean);
          if (vals.length === 0) break;
          const placeholders = vals.map((v) => { queryParams.push(v); return `$${queryParams.length}`; }).join(", ");
          filterClauses.push(`${col}::text IN (${placeholders})`);
          break;
        }
        case "not_in": {
          if (!f.value?.trim()) break;
          const vals = f.value.split(",").map((v) => v.trim()).filter(Boolean);
          if (vals.length === 0) break;
          const placeholders = vals.map((v) => { queryParams.push(v); return `$${queryParams.length}`; }).join(", ");
          filterClauses.push(`${col}::text NOT IN (${placeholders})`);
          break;
        }
      }
    }

    const whereFilter = filterClauses.length > 0
      ? `AND ${filterClauses.join(" AND ")}`
      : "";

    const selectCols = propCols.map(qi).join(", ");

    // Transform the tile envelope to the geometry's native SRID for the WHERE filter.
    // This allows PostgreSQL to use the GIST spatial index on the geometry column.
    // Only fall back to transforming the geometry when srid is already 3857.
    const envelopeExpr = srid === 3857
      ? `ST_TileEnvelope($2, $3, $4)`
      : `ST_Transform(ST_TileEnvelope($2, $3, $4), ${srid})`;

    const sql = `
      SELECT ST_AsMVT(tile, $1, 4096, 'geom') AS mvt
      FROM (
        SELECT
          ST_AsMVTGeom(
            ST_Transform(${qi(geomCol)}, 3857),
            ST_TileEnvelope($2, $3, $4),
            4096, 64, true
          ) AS geom
          ${propCols.length > 0 ? `, ${selectCols}` : ""}
        FROM ${qi(schema)}.${qi(table)}
        WHERE ${qi(geomCol)} && ${envelopeExpr}
          ${whereFilter}
      ) AS tile
      WHERE tile.geom IS NOT NULL
    `;

    const { rows } = await pool.query(sql, queryParams);
    const mvt: Buffer = rows[0].mvt;
    return new NextResponse(new Uint8Array(mvt), {
      headers: {
        "Content-Type": "application/vnd.mapbox-vector-tile",
        // Cache tiles in the browser for 5 minutes — re-validates if data version changes
        "Cache-Control": "public, max-age=300, stale-while-revalidate=60",
      },
    });
  } catch (e: any) {
    console.error("[tiles 500]", { schema, table, z, x, y, geomCol, srid, error: e.message });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
