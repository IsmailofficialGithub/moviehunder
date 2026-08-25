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

## Scripts

- `npm run dev` — API + relay
- `npm run dev:api` / `npm run dev:relay`
- `npm run deploy` — set the same keys as Worker secrets/vars in Cloudflare
