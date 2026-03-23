// Minimal WKB → GeoJSON converter for GeoPackage client-side parsing

function readPoint(view: DataView, offset: number, le: boolean, stride: number): [number[], number] {
  const coords: number[] = [];
  for (let i = 0; i < stride; i++) {
    coords.push(view.getFloat64(offset, le));
    offset += 8;
  }
  return [coords, offset];
}

function readCoordSeq(view: DataView, offset: number, le: boolean, stride: number): [number[][], number] {
  const count = view.getUint32(offset, le);
  offset += 4;
  const seq: number[][] = [];
  for (let i = 0; i < count; i++) {
    const [c, next] = readPoint(view, offset, le, stride);
    seq.push(c);
    offset = next;
  }
  return [seq, offset];
}

export function wkbToGeoJson(buffer: ArrayBuffer, startOffset = 0): any {
  function parse(offset: number): [any, number] {
    const view = new DataView(buffer);
    const le = view.getUint8(offset) === 1;
    offset += 1;
    const rawType = view.getUint32(offset, le);
    offset += 4;

    const type = rawType & 0xffff;
    const hasZ = (rawType & 0x80000000) !== 0 || (type > 1000 && type < 2000);
    const hasM = (rawType & 0x40000000) !== 0 || (type > 2000 && type < 3000);
    const stride = 2 + (hasZ ? 1 : 0) + (hasM ? 1 : 0);
    const baseType = type > 3000 ? type - 3000 : type > 2000 ? type - 2000 : type > 1000 ? type - 1000 : type;

    if (baseType === 1) { // Point
      const [coords, next] = readPoint(view, offset, le, stride);
      return [{ type: "Point", coordinates: coords.slice(0, 2) }, next];
    }
    if (baseType === 2) { // LineString
      const [coords, next] = readCoordSeq(view, offset, le, stride);
      return [{ type: "LineString", coordinates: coords.map(c => c.slice(0, 2)) }, next];
    }
    if (baseType === 3) { // Polygon
      const ringCount = view.getUint32(offset, le);
      offset += 4;
      const rings: number[][][] = [];
      for (let r = 0; r < ringCount; r++) {
        const [ring, next] = readCoordSeq(view, offset, le, stride);
        rings.push(ring.map(c => c.slice(0, 2)));
        offset = next;
      }
      return [{ type: "Polygon", coordinates: rings }, offset];
    }
    if (baseType === 4 || baseType === 5 || baseType === 6 || baseType === 7) {
      const typeMap: Record<number, string> = { 4: "MultiPoint", 5: "MultiLineString", 6: "MultiPolygon", 7: "GeometryCollection" };
      const geomCount = view.getUint32(offset, le);
      offset += 4;
      const geoms: any[] = [];
      for (let i = 0; i < geomCount; i++) {
        const [g, next] = parse(offset);
        geoms.push(g);
        offset = next;
      }
      const key = baseType === 7 ? "geometries" : "geometries" in {} ? "geometries" : "coordinates";
      if (baseType === 4) return [{ type: "MultiPoint", coordinates: geoms.map(g => g.coordinates) }, offset];
      if (baseType === 5) return [{ type: "MultiLineString", coordinates: geoms.map(g => g.coordinates) }, offset];
      if (baseType === 6) return [{ type: "MultiPolygon", coordinates: geoms.map(g => g.coordinates) }, offset];
      return [{ type: "GeometryCollection", geometries: geoms }, offset];
    }
    throw new Error(`Unsupported WKB type: ${type}`);
  }
  return parse(startOffset)[0];
}

// Parse GeoPackage geometry blob (GeoPackage binary header + WKB)
export function gpkgGeomToGeoJson(blob: Uint8Array): any | null {
  try {
    if (blob[0] !== 0x47 || blob[1] !== 0x50) return null; // not 'GP'
    const flags = blob[3];
    const envelopeType = (flags >> 1) & 0x07;
    const envelopeSizes = [0, 32, 48, 48, 64];
    const envelopeSize = envelopeSizes[envelopeType] ?? 0;
    const wkbOffset = 8 + envelopeSize;
    return wkbToGeoJson(blob.buffer as ArrayBuffer, blob.byteOffset + wkbOffset);
  } catch {
    return null;
  }
}
