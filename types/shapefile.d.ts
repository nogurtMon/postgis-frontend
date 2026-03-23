declare module "shapefile" {
  export function open(shp: ArrayBuffer | string, dbf?: ArrayBuffer | string): Promise<Source>;
  export function read(shp: ArrayBuffer | string, dbf?: ArrayBuffer | string): Promise<FeatureCollection>;

  interface Source {
    read(): Promise<{ done: boolean; value: Feature }>;
    bbox?: [number, number, number, number];
  }

  interface FeatureCollection {
    type: "FeatureCollection";
    features: Feature[];
    bbox?: [number, number, number, number];
  }

  interface Feature {
    type: "Feature";
    geometry: any;
    properties: Record<string, any> | null;
  }
}
