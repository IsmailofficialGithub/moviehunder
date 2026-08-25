# Flick — Mobile (Expo)

## Setup

```bash
cd mobile
cp .env.example .env
# set EXPO_PUBLIC_API_BASE to your PC LAN IP, e.g. http://192.168.1.30:8787
npm start
```

Phone and PC must be on the same Wi‑Fi. Start the API first:

```bash
cd ../server && npm run dev
```

## Screens

- **Home** — catalog rows from `/home`
- **Movies** — `/movies`
- **Search** — `/search`
- **Title** — detail + episodes
