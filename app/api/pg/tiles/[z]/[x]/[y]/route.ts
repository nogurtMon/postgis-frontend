import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

const pools = new Map<string, Pool>();
function getPool(dsn: string) {
  if (!pools.has(dsn)) pools.set(dsn, new Pool({ connectionString: dsn, max: 5 }));
  return pools.get(dsn)!;
}

// Safe SQL identifier quoting
function qi(name: string) {
  return '"' + name.replace(/"/g, '""') + '"';
}

// Column name cache: "dsn|schema.table" -> column names (excluding geom)
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

  const dsn = searchParams.get("dsn");
  const schema = searchParams.get("schema");
  const table = searchParams.get("table");
  const geomCol = searchParams.get("geomCol") ?? "geom";

  if (!dsn?.startsWith("postgres"))
    return NextResponse.json({ error: "Bad DSN" }, { status: 400 });
  if (!schema || !table)
    return NextResponse.json({ error: "Missing schema or table" }, { status: 400 });

  const z = parseInt(zs, 10);
  const x = parseInt(xs, 10);
  const y = parseInt(ys, 10);

  // Parse filters: encoded as filters=[{col,op,val},...] JSON
  let filters: { column: string; operator: string; value: string }[] = [];
  const filtersParam = searchParams.get("filters");
  if (filtersParam) {
    try { filters = JSON.parse(filtersParam); } catch {}
  }

  const pool = getPool(dsn);

  try {
    const cacheKey = `${dsn}|${schema}.${table}`;
    const propCols = await getNonGeomCols(pool, schema, table, geomCol, cacheKey);

    // Build parameterized WHERE clauses for filters
    const queryParams: any[] = [table, z, x, y];
    const filterClauses: string[] = [];

    for (const f of filters) {
      if (!isValidColName(f.column)) continue;
      if (f.operator === "IS NULL" || f.operator === "IS NOT NULL") {
        filterClauses.push(`${qi(f.column)} ${f.operator}`);
      } else {
        queryParams.push(f.value);
        filterClauses.push(`${qi(f.column)} ${f.operator} $${queryParams.length}`);
      }
    }

    const whereFilter = filterClauses.length > 0
      ? `AND ${filterClauses.join(" AND ")}`
      : "";

    const selectCols = propCols.map(qi).join(", ");

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
        WHERE ST_Transform(${qi(geomCol)}, 3857) && ST_TileEnvelope($2, $3, $4)
          ${whereFilter}
      ) AS tile
      WHERE tile.geom IS NOT NULL
    `;

    const { rows } = await pool.query(sql, queryParams);
    const mvt: Buffer = rows[0].mvt;
    return new NextResponse(mvt, {
      headers: { "Content-Type": "application/vnd.mapbox-vector-tile" },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
