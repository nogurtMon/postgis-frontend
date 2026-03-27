# PostGIS Frontend

A self-hosted visual interface for PostGIS databases. Connect your database and instantly visualize, style, filter, and share your spatial data — entirely in the browser.

**Your data never leaves your infrastructure.** This app is designed to be run on your own server. The hosted demo is for evaluation only — for real work, self-host it.

---

## Deploy with Docker

**1. Generate an encryption key**

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**2. Create a `.env` file**

```env
DSN_ENCRYPTION_KEY=your_64_char_hex_key_here
```

**3. Run it**

```bash
docker compose up -d
```

Open `http://localhost:3000`. To expose it publicly, put it behind a reverse proxy with HTTPS. Example [Caddy](https://caddyserver.com) config:

```
your.domain.com {
    reverse_proxy localhost:3000
}
```

---

## Connect your database

Paste a `postgres://` connection string in the settings panel. For shared map views, use a **read-only PostgreSQL role** so viewers can only read:

```sql
CREATE ROLE viewer LOGIN PASSWORD 'strong-password';
GRANT CONNECT ON DATABASE yourdb TO viewer;
GRANT USAGE ON SCHEMA public TO viewer;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO viewer;
```

---

## What you can do

- **Visualize** spatial tables as interactive map layers — points, lines, and polygons
- **Style** by color, opacity, and stroke. Scale point radius or line width by any numeric column. Classify fills by category.
- **Filter** by any attribute without writing SQL
- **Import** GeoPackage, GeoJSON, Shapefile, and KML directly into PostGIS
- **Ingest** ArcGIS Feature Services directly into PostGIS
- **Manage** tables — rename, add primary keys, create spatial indexes, cast geometry types, edit rows
- **Share** named map views as public read-only links — no credentials required to view

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `DSN_ENCRYPTION_KEY` | Yes (production) | 64 hex chars (32 bytes). Encrypts database connection strings. Generate with the command above. |
| `PORT` | No | Port to listen on. Default: `3000`. |

---

## Development

```bash
npm install
npm run dev
```

No `DSN_ENCRYPTION_KEY` needed for development — a random key is auto-generated and saved to `.dsn-dev-key`.

---

## Security model

Database credentials are AES-256-GCM encrypted before any server communication. Connection strings are never logged or written to disk. The person running the server can in principle access your database — **this is why self-hosting matters**. If you connect to someone else's hosted instance, use a read-only database role.

---

## How it works

```
Browser (MapLibre GL + deck.gl)
        ↕  MVT tiles
Next.js API (/api/pg/tiles)
        ↕  ST_AsMVT queries
  PostgreSQL + PostGIS
```

Spatial tables are discovered via `pg_catalog`. Tiles are generated on-demand using `ST_AsMVT` / `ST_AsMVTGeom` and rendered with [deck.gl](https://deck.gl) MVTLayer on a [MapLibre GL](https://maplibre.org/) base map.

## Tech stack

| Layer | Library |
|---|---|
| Framework | Next.js 15 (App Router) |
| Map | MapLibre GL + react-map-gl |
| Tile rendering | deck.gl MVTLayer |
| Database client | node-postgres (pg) |
| UI | shadcn/ui + Tailwind CSS |
