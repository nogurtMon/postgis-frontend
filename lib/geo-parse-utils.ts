// Shared WKT parsing + feature conversion used by both the main thread and XLSX worker

export const LAT_COLS = new Set(["latitude", "lat", "y", "northing"]);
export const LON_COLS = new Set(["longitude", "lon", "lng", "long", "x", "easting"]);
export const WKT_COLS = new Set(["wkt_geometry", "wkt", "geometry", "geom", "the_geom", "shape"]);

export function findCol(headers: string[], candidates: Set<string>): string | null {
  for (const h of headers) {
    if (candidates.has(h.toLowerCase().trim())) return h;
  }
  return null;
}

// Minimal WKT → GeoJSON geometry (handles Point, LineString, Polygon, Multi*)
export function wktToGeoJSON(wkt: string): object | null {
  const s = wkt.trim();
  const m = s.match(/^(\w+)\s*(?:Z\s*)?\(([\s\S]+)\)$/i);
  if (!m) return null;
  const type = m[1].toUpperCase();
  const body = m[2];

  function parseCoord(pair: string): number[] {
    const parts = pair.trim().split(/\s+/);
    return [parseFloat(parts[0]), parseFloat(parts[1])];
  }
  function parseRing(ringStr: string): number[][] {
    return ringStr.trim().split(/,/).map(parseCoord);
  }

  if (type === "POINT") {
    const coords = parseCoord(body);
    if (coords.some(isNaN)) return null;
    return { type: "Point", coordinates: coords };
  }
  if (type === "LINESTRING") return { type: "LineString", coordinates: parseRing(body) };
  if (type === "POLYGON") {
    const rings = body.split(/\)\s*,\s*\(/).map((r) => parseRing(r.replace(/^\s*\(|\)\s*$/g, "")));
    return { type: "Polygon", coordinates: rings };
  }
  if (type === "MULTIPOINT") {
    const pts = body.split(/\)\s*,\s*\(/).map((p) => parseCoord(p.replace(/^\s*\(|\)\s*$/g, "").trim()));
    return { type: "MultiPoint", coordinates: pts };
  }
  if (type === "MULTILINESTRING") {
    const lines = body.split(/\)\s*,\s*\(/).map((l) => parseRing(l.replace(/^\s*\(|\)\s*$/g, "")));
    return { type: "MultiLineString", coordinates: lines };
  }
  if (type === "MULTIPOLYGON") {
    const polys = body.split(/\)\s*\)\s*,\s*\(\s*\(/).map((poly) => {
      const clean = poly.replace(/^\s*\(|\)\s*$/g, "");
      return clean.split(/\)\s*,\s*\(/).map((r) => parseRing(r.replace(/^\s*\(|\)\s*$/g, "")));
    });
    return { type: "MultiPolygon", coordinates: polys };
  }
  return null;
}

export function rowsToFeatures(
  rows: Record<string, string>[],
  latCol: string | null,
  lonCol: string | null,
  wktCol: string | null,
  skipCols: Set<string>,
): any[] {
  const features: any[] = [];
  for (const row of rows) {
    let geometry: object | null = null;
    if (wktCol) {
      const wkt = row[wktCol]?.trim();
      if (wkt) geometry = wktToGeoJSON(wkt);
    } else if (latCol && lonCol) {
      const lat = parseFloat(row[latCol]);
      const lon = parseFloat(row[lonCol]);
      if (!isNaN(lat) && !isNaN(lon)) geometry = { type: "Point", coordinates: [lon, lat] };
    }
    if (!geometry) continue;
    const props: Record<string, any> = {};
    for (const [k, v] of Object.entries(row)) {
      if (!skipCols.has(k)) props[k] = v === "" ? null : v;
    }
    features.push({ type: "Feature", geometry, properties: props });
  }
  return features;
}
