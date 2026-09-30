# Flick — Server

Catalog API (Cloudflare Worker via Wrangler) + local play relay (streams + **auth/sync/devices** via Prisma).

| Service     | Port | Script      |
|------------|------|-------------|
| Catalog API | 8787 | `dev:api`   |
| Play relay  | 8788 | `dev:relay` |

Auth, library sync, and `app_devices` run on the **Node play-relay** (Prisma + nodemailer). The Worker proxies `/api/auth/*`, `/api/sync/*`, and `/api/access/*` to `NODE_API_URL`.

## Setup

```bash
cd server
cp .env.example .env
cp .env.example .dev.vars
npm install
npx prisma generate
npx prisma migrate deploy   # needs DATABASE_URL
npm run dev
```

Upstream hosts, API paths, and headers come **only** from env — not from source code.

| File | Used by |
|------|---------|
| `.env` | Play relay (incl. Prisma, SMTP, Google OAuth) |
| `.dev.vars` | Wrangler Worker (local) — set `NODE_API_URL=http://127.0.0.1:8788` |
| `.env.example` | Template (committed) |
| `prisma/schema.prisma` | Postgres schema |

Required catalog: `BASE_URL`, `H5_API`, `DEFAULT_DOMAIN`, `SITE_HOSTS`, `PLAY_HOSTS`, `USER_AGENT`.

Optional auth/access: `DATABASE_URL`, `AUTH_JWT_SECRET`, SMTP_*, `GOOGLE_*`, `NODE_API_URL`. Without `DATABASE_URL`, device access stays open and auth returns 503.

## Scripts

- `npm run dev` — API + relay
- `npm run dev:api` / `npm run dev:relay`
- `npm run prisma:migrate` / `prisma:deploy` / `prisma:generate`
- `npm run deploy` — set the same keys as Worker secrets/vars in Cloudflare (include `NODE_API_URL`)
