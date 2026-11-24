// Watch-party realtime server (WebSocket). Runs as its own process (PM2: moviehunter-party).
//   npm run dev:party
// Clients connect directly (the Worker proxy can't carry WebSocket upgrades):
//   ws(s)://<host>:PARTY_PORT/party  → first message { t: "hello", ticket }
// Tickets come from POST /api/party or /api/party/join.

import http from "node:http";
import path from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { createConfig, setActiveConfig } from "../src/config.js";
import { authorizeClient } from "../src/cors.js";
import { verifyPartyTicket } from "../src/party.js";
import { getRedis } from "../src/redis.js";
import { PartyHub, LIMITS } from "./hub.js";
import { createStore } from "./store.js";
import { PartyMedia } from "./media.js";

function loadDotEnv(filePath) {
  if (!existsSync(filePath)) return {};
  const out = {};
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    let val = t.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (val) out[t.slice(0, i).trim()] = val;
  }
  return out;
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fileEnv = { ...loadDotEnv(path.join(root, ".env")), ...loadDotEnv(path.join(root, ".dev.vars")) };
for (const [k, v] of Object.entries(fileEnv)) {
  if (process.env[k] == null || process.env[k] === "") process.env[k] = v;
}
setActiveConfig(createConfig({ ...fileEnv, ...process.env }));

const PORT = Number(process.env.PARTY_PORT || 8790);
const HELLO_TIMEOUT_MS = 10_000;
const HEARTBEAT_MS = 15_000;
const MAX_PAYLOAD = 16 * 1024;

const store = createStore();
const hub = new PartyHub({ store });

// Voice (mediasoup). Optional: if it can't start, parties still work without voice.
async function startVoice() {
  if (process.env.PARTY_VOICE === "0") return;
  try {
    const mediasoup = await import("mediasoup");
    hub.media = await new PartyMedia({ mediasoup }).init();
    console.log(
      `🎙️  Voice SFU: ${hub.media.workers.length} worker(s), UDP/TCP ports ${hub.media.basePort}-${hub.media.basePort + hub.media.workers.length - 1}` +
        (hub.media.announcedAddress ? `, announced ${hub.media.announcedAddress}` : " (set PARTY_RTC_ANNOUNCED_IP in production)")
    );
  } catch (err) {
    hub.media = null;
    console.error("[party] voice disabled:", err.message);
  }
}

/** Build a Fetch-like request so the existing CORS/app-key gate can be reused. */
function gateRequest(req) {
  const url = `http://${req.headers.host || "localhost"}${req.url || "/"}`;
  return { url, headers: new Headers(Object.entries(req.headers).filter(([, v]) => typeof v === "string")) };
}

const server = http.createServer((req, res) => {
  if (req.url === "/health" || req.url === "/") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: "party", rooms: hub.rooms.size }));
    return;
  }
  res.writeHead(404).end();
});

const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD, perMessageDeflate: false });

server.on("upgrade", (req, socket, head) => {
  const pathname = (req.url || "").split("?")[0].replace(/\/+$/, "");
  if (pathname !== "/party") return socket.destroy();
  const gate = authorizeClient(gateRequest(req));
  if (!gate.ok) {
    socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
    return socket.destroy();
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws));
});

wss.on("connection", (ws) => {
  const sock = {
    send(msg) {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
    },
    close(code, reason) {
      try {
        ws.close(code, reason);
      } catch {
        ws.terminate();
      }
    },
  };
  let joined = false;
  /** @type {Promise<boolean> | null} */
  let joining = null;
  ws.isAlive = true;
  ws.on("pong", () => (ws.isAlive = true));

  const helloTimer = setTimeout(() => !joined && sock.close(4002, "HELLO_TIMEOUT"), HELLO_TIMEOUT_MS);

  ws.on("message", async (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    try {
      if (joining) await joining; // keep message order while the hello is processed
      if (!joined) {
        if (msg?.t === "ping") return hub.handle(sock, msg);
        if (msg?.t !== "hello" || joining) return sock.close(4003, "HELLO_REQUIRED");
        joining = (async () => {
          const ticket = await verifyPartyTicket(msg.ticket);
          if (!ticket) {
            sock.send({ t: "error", code: "BAD_TICKET", fatal: true });
            sock.close(4004, "BAD_TICKET");
            return false;
          }
          return hub.join(sock, ticket);
        })();
        try {
          joined = Boolean(await joining);
        } catch (err) {
          // Don't leave the client waiting for the hello timeout — let it reconnect right away.
          console.error("[party] join failed:", err?.message || err);
          clearTimeout(helloTimer);
          sock.close(4500, "JOIN_ERROR");
          return;
        }
        clearTimeout(helloTimer);
        return;
      }
      await hub.handle(sock, msg);
    } catch (err) {
      console.error("[party] message error:", err);
      sock.send({ t: "error", code: "SERVER_ERROR", rid: msg?.rid });
    }
  });

  ws.on("close", () => {
    clearTimeout(helloTimer);
    if (joined) hub.leave(sock).catch((e) => console.error("[party] leave", e));
  });
});

// Drop dead sockets (mobile networks often vanish without a FIN).
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, HEARTBEAT_MS);

const ticker = setInterval(() => hub.tick(), LIMITS.TICK_MS);

async function subscribeControl() {
  try {
    const sub = (await getRedis()).duplicate();
    await sub.connect();
    await sub.subscribe("party:control", (raw) => {
      try {
        const evt = JSON.parse(raw);
        if (evt.type === "ended" && evt.roomId) hub.endedExternally(evt.roomId);
        if (evt.type === "settings" && evt.roomId) hub.settingsChanged(evt.roomId, evt.settings || {});
      } catch {
        /* ignore */
      }
    });
  } catch (err) {
    console.error("[party] Redis control channel unavailable:", err.message);
  }
}

function shutdown() {
  clearInterval(heartbeat);
  clearInterval(ticker);
  for (const ws of wss.clients) ws.close(1012, "RESTARTING");
  hub.media?.close().catch(() => {});
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

server.listen(PORT, "0.0.0.0", async () => {
  console.log(`Party server on ws://0.0.0.0:${PORT}/party`);
  // A restart drops every socket, so stale online counts must go.
  await store.clearOnline().catch((e) => console.error("[party] Redis:", e.message));
  await subscribeControl();
  await startVoice();
});
