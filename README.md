# PostGIS Frontend

A web-based map viewer for PostGIS databases. Connect to any PostgreSQL/PostGIS database, browse spatial tables, and visualize them on an interactive map — no local setup required.

## Features

- **Connect to any PostGIS database** via a connection string (DSN)
- **Browse spatial tables** grouped by schema — only tables with geometry columns are shown
- **Add layers to the map** with a single click
- **Style layers** per geometry type:
  - *Points* — fill color, opacity, radius, outline color, stroke width
  - *Lines* — line color, opacity, line width
  - *Polygons* — fill color, opacity, outline color, stroke width
- **Data-driven radius** for point layers — scale point size by any numeric column, with configurable domain and radius range
- **Filter layers** with SQL-style conditions (`=`, `!=`, `>`, `<`, `LIKE`, `IS NULL`, etc.)
- **Reorder and toggle** layer visibility
- **Click any feature** to inspect its properties
- **Dark/light mode** toggle

## Getting Started

### Prerequisites

- Node.js 18+
- A PostgreSQL database with the [PostGIS](https://postgis.net/) extension enabled

### Local Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), click the settings icon, and enter your database connection string:

```
postgresql://user:password@host:5432/dbname
```

### Deploy to Vercel

The app is fully serverless-compatible. Tiles are served directly from PostGIS via Next.js API routes — no additional infrastructure needed.

## How It Works

Spatial tables are discovered by querying `pg_catalog` for geometry/geography columns. Tiles are generated on-demand using PostGIS's `ST_AsMVT` / `ST_AsMVTGeom` functions and rendered on the client with [deck.gl](https://deck.gl) (MVTLayer) on top of a [MapLibre GL](https://maplibre.org/) base map.

```
Browser (MapLibre + deck.gl)
        ↕  MVT tiles
Next.js API (/api/pg/tiles)
        ↕  ST_AsMVT queries
  PostgreSQL + PostGIS
```

## Tech Stack

| Layer | Library |
|---|---|
| Framework | Next.js 15 (App Router) |
| Map | MapLibre GL + react-map-gl |
| Tile rendering | deck.gl MVTLayer |
| Database client | node-postgres (pg) |
| UI | shadcn/ui + Tailwind CSS |
| Theming | next-themes |