# PostGIS Frontend

A self-hosted visual interface for PostGIS databases. Connect your database and instantly visualize, style, filter, and share your spatial data — entirely in the browser.

**Your data never leaves your infrastructure.** Deploy on Vercel, Docker, or any VPS — your database credentials are encrypted in the browser and never stored server-side.

---

## Deploy

### Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/nogurtMon/postgis-frontend&env=DSN_ENCRYPTION_KEY&envDescription=64%20hex%20chars%20(32%20bytes).%20Generate%20with%3A%20node%20-e%20%22console.log(require(%27crypto%27).randomBytes(32).toString(%27hex%27))%22)

Click the button, fill in `DSN_ENCRYPTION_KEY` when prompted, and deploy. Add a custom domain in your Vercel project settings.

> **Generate a key:** `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

---

## Deploy with Docker

### 1. Install Docker

```bash
curl -fsSL https://get.docker.com | sh
```

Add your user to the docker group so you don't need `sudo`:

```bash
sudo usermod -aG docker $USER
```

Then apply the group change in your current terminal session:

```bash
newgrp docker
```

> **Note:** `newgrp docker` only applies to the current terminal session. To make it permanent, log out and log back in.

### 2. Clone the repo

```bash
git clone https://github.com/nogurtMon/postgis-frontend.git
cd postgis-frontend
```

### 3. Generate an encryption key and create a `.env` file

```bash
node -e "console.log('DSN_ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('hex'))" > .env
```

### 4. Start the app

```bash
newgrp docker
docker compose up -d
```

Open `http://localhost:3000`.

### Expose publicly with HTTPS

Put it behind a reverse proxy. Example [Caddy](https://caddyserver.com) config:

```
your.domain.com {
    reverse_proxy localhost:3000
}
```

### Update to latest version

```bash
git pull
docker compose down
docker compose up -d --build
```

---

## Connect your database

Paste a `postgres://` connection string in the settings panel. For shared map views, use a **read-only PostgreSQL role**:

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
| `DSN_ENCRYPTION_KEY` | Yes (production) | 64 hex chars (32 bytes). Encrypts database connection strings. |
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

---

## Tech stack

| Layer | Library |
|---|---|
| Framework | Next.js 15 (App Router) |
| Map | MapLibre GL + react-map-gl |
| Tile rendering | deck.gl MVTLayer |
| Database client | node-postgres (pg) |
| UI | shadcn/ui + Tailwind CSS |
