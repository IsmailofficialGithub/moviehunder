# Flick — Server

Catalog API (Cloudflare Worker via Wrangler) + local play relay.

| Service     | Port | Script      |
|------------|------|-------------|
| Catalog API | 8787 | `dev:api`   |
| Play relay  | 8788 | `dev:relay` |

## Setup

```bash
cd server
cp .env.example .env
cp .env.example .dev.vars
npm install
npm run dev
```

Upstream hosts, API paths, and headers come **only** from env — not from source code.

| File | Used by |
|------|---------|
| `.env` | Play relay |
| `.dev.vars` | Wrangler Worker (local) |
| `.env.example` | Template (committed) |

Required: `BASE_URL`, `H5_API`, `DEFAULT_DOMAIN`, `SITE_HOSTS`, `PLAY_HOSTS`, `USER_AGENT`.

## PM2 (VPS)

Wrangler reads **`.dev.vars`**, relay reads **`.env`** — keep both in sync.

```bash
cd /srv/ismail_data/movie_hunder/server
cp .env .dev.vars          # if .dev.vars missing
npm install
npm install -g pm2         # once
mkdir -p /var/log/pm2

pm2 start ecosystem.config.cjs
pm2 status
pm2 save
pm2 startup                # follow the printed command (systemd)

# logs / restart
pm2 logs
pm2 restart all
```

Memory: each process restarts at **1G** (`max_memory_restart`) with V8 heap ~896MB — about **2GB** total for API + relay.

| Service        | Port | PM2 name            |
|----------------|------|---------------------|
| Catalog API    | 8787 | `moviehunter-api`   |
| Play relay     | 8788 | `moviehunter-relay` |

## Scripts

- `npm run dev` — API + relay
- `npm run dev:api` / `npm run dev:relay`
- `npm run deploy` — set the same keys as Worker secrets/vars in Cloudflare
