# PostGIS Frontend

<img src="public/postgres-frontend-logo1.png" width="300" />

A self-hosted visual interface for PostGIS databases. Visualize, style, filter, and share spatial data — directly from your browser.

Your database credentials are encrypted client-side and never stored server-side.

---

## Deploy

### Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/nogurtMon/postgis-frontend&env=DSN_ENCRYPTION_KEY,APP_PASSWORD&envDescription=DSN_ENCRYPTION_KEY%3A%2064%20hex%20chars%20%E2%80%94%20generate%20with%20node%20-e%20%22console.log(require('crypto').randomBytes(32).toString('hex'))%22.%20APP_PASSWORD%3A%20password%20to%20access%20the%20app.)

Fill in both env vars when prompted. Add a custom domain in your Vercel project settings.

**Generate a key:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

### Docker

**Requirements:** Docker, Node.js (to generate the key)

```bash
# Install Docker (Linux)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER && newgrp docker

# Clone and configure
git clone https://github.com/nogurtMon/postgis-frontend.git
cd postgis-frontend
node -e "console.log('DSN_ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('hex'))" > .env
echo "APP_PASSWORD=yourpassword" >> .env

# Run
docker compose up -d
```

Open `http://localhost:3000`.

> `newgrp docker` applies the group change to your current session. Log out and back in to make it permanent.

**Custom domain (HTTPS):** put it behind [Caddy](https://caddyserver.com):
```
your.domain.com {
    reverse_proxy localhost:3000
}
```

**Update:**
```bash
git pull && docker compose down && docker compose up -d --build
```

---

### Local development

```bash
git clone https://github.com/nogurtMon/postgis-frontend.git
cd postgis-frontend
npm install
npm run dev
```

No `DSN_ENCRYPTION_KEY` needed — a key is auto-generated locally.

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `DSN_ENCRYPTION_KEY` | Yes (production) | 64 hex chars. Encrypts database connection strings. |
| `APP_PASSWORD` | Recommended | Password to access the app. Share links at `/share` remain public. If unset, no auth is required. |
| `PORT` | No | Default: `3000`. |

---

## Security

Credentials are AES-256-GCM encrypted in the browser before any server communication and are never written to disk. The server operator can in principle decrypt tokens — use a read-only Postgres role if connecting to an instance you don't control.

---

## Stack

| | |
|---|---|
| Framework | Next.js 15 |
| Map | MapLibre GL + deck.gl |
| Tiles | PostGIS `ST_AsMVT` |
| Database | node-postgres |
| UI | shadcn/ui + Tailwind CSS |
