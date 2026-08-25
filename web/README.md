# Flick — Web (Next.js)

Frontend for Flick. Talks to the local server API (`:8787`) and play relay (`:8788`).

## Setup

```bash
cd web
cp .env.example .env.local   # already points at 8787 / 8788
npm install
npm run dev
```

App: [http://127.0.0.1:3001](http://127.0.0.1:3001)

Start the server in another terminal first:

```bash
cd ../server
npm install
npm run dev
```
