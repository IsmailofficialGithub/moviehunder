/**
 * Local play relay — Origin/Referer for stream CDN.
 * Config from server/.env (or .dev.vars). No hardcoded upstream hosts.
 *
 * npm run dev        → with catalog API
 * npm run dev:relay  → relay only
 */

import http from "node:http";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { URL } from "node:url";
import { createConfig, setActiveConfig, cfg } from "./src/config.js";

function loadDotEnv(filePath) {
  if (!existsSync(filePath)) return {};
  const out = {};
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

const root = path.dirname(fileURLToPath(import.meta.url));
const fileEnv = {
  ...loadDotEnv(path.join(root, ".env")),
  ...loadDotEnv(path.join(root, ".dev.vars")),
};
const config = createConfig({ ...fileEnv, ...process.env });
setActiveConfig(config);

if (config.missing.length) {
  console.error(
    "Missing required env keys:",
    config.missing.join(", "),
    "\nCopy .env.example → .env and fill values."
  );
  process.exit(1);
}

const PORT = Number(process.env.PORT || fileEnv.PORT || 8788);

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Range");
  res.setHeader(
    "Access-Control-Expose-Headers",
    "X-Stream-Host, Content-Length, Content-Range, Accept-Ranges"
  );
}

function sendJson(res, status, body) {
  cors(res);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body, null, 2));
}

async function proxyMedia(req, res, targetUrl) {
  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch {
    sendJson(res, 400, { error: "Invalid media url" });
    return;
  }

  if (
    !/^https?:$/.test(parsed.protocol) ||
    !cfg().isAllowedMediaHost(parsed.hostname)
  ) {
    sendJson(res, 400, { error: "Media host not allowed" });
    return;
  }

  const origin = cfg().PLAY_HOSTS[0] || cfg().DEFAULT_DOMAIN;
  const headers = {
    "User-Agent": cfg().USER_AGENT,
    Accept: "*/*",
    Origin: origin,
    Referer: `${origin}/`,
  };
  if (req.headers.range) headers.Range = req.headers.range;

  const ac = new AbortController();
  const onClose = () => ac.abort();
  req.on("close", onClose);

  try {
    const upstream = await fetch(parsed.href, {
      headers,
      signal: ac.signal,
      redirect: "follow",
    });

    const outHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Expose-Headers":
        "Content-Length, Content-Range, Accept-Ranges",
      "Accept-Ranges": "bytes",
      "Content-Type": upstream.headers.get("content-type") || "video/mp4",
      "Cache-Control": "private, max-age=60",
    };
    const len = upstream.headers.get("content-length");
    const cr = upstream.headers.get("content-range");
    if (len) outHeaders["Content-Length"] = len;
    if (cr) outHeaders["Content-Range"] = cr;

    res.writeHead(upstream.status, outHeaders);
    if (req.method === "HEAD" || !upstream.body) {
      if (upstream.body) await upstream.body.cancel().catch(() => {});
      res.end();
      return;
    }
    await pipeline(Readable.fromWeb(upstream.body), res);
  } catch (err) {
    if (ac.signal.aborted || res.writableEnded) return;
    sendJson(res, 502, { error: "Media proxy failed" });
  } finally {
    req.off("close", onClose);
  }
}

async function playOnHost(host, subjectId, detailPath, se, ep) {
  const playUrl = cfg().playUrl(host, subjectId, detailPath, se, ep);
  const resp = await fetch(playUrl, {
    headers: {
      Accept: "application/json",
      "User-Agent": cfg().USER_AGENT,
      Origin: host,
      Referer: `${host}/spa/videoPlayPage/movies/${detailPath}`,
      "x-client-info": JSON.stringify({ timezone: cfg().CLIENT_TIMEZONE }),
      "x-client-type": cfg().CLIENT_TYPE,
      "X-Request-Lang": cfg().REQUEST_LANG,
    },
  });

  if (!resp.ok) {
    const err = new Error(`Play API returned ${resp.status}`);
    err.status = resp.status;
    throw err;
  }

  const body = await resp.json();
  const streams = (body?.data?.streams || []).filter(
    (s) => s?.url && !cfg().isTrailerUrl(s.url)
  );
  return { streams, host };
}

async function resolveStreams(subjectId, detailPath, se, ep) {
  let lastErr;
  for (const host of cfg().PLAY_HOSTS) {
    try {
      const { streams, host: used } = await playOnHost(
        host,
        subjectId,
        detailPath,
        se,
        ep
      );
      if (streams.length) {
        const sources = streams
          .map((s) => ({
            resolution: s.resolutions ? `${s.resolutions}p` : "Unknown",
            format: s.format || null,
            url: s.url,
            size_bytes: s.size ? Number(s.size) : null,
            id: s.id || null,
          }))
          .sort((a, b) => {
            const ra = parseInt(a.resolution) || 0;
            const rb = parseInt(b.resolution) || 0;
            return rb - ra;
          });
        return { sources, stream_domain: used };
      }
      lastErr = new Error(`Empty streams from ${host}`);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error("No streams found");
}

const server = http.createServer(async (req, res) => {
  cors(res);
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);

  if (url.pathname === "/" || url.pathname === "/health") {
    sendJson(res, 200, {
      ok: true,
      service: "play-relay",
      port: PORT,
      usage: `/api/stream/{subjectId}?detail_path=slug&se=1&ep=1`,
    });
    return;
  }

  if (
    (req.method === "GET" || req.method === "HEAD") &&
    url.pathname === "/api/media"
  ) {
    const target = url.searchParams.get("url");
    if (!target) {
      sendJson(res, 400, { error: "url is required" });
      return;
    }
    await proxyMedia(req, res, target);
    return;
  }

  const m = url.pathname.match(/^\/api\/stream\/([^/]+)\/?$/);
  if (req.method === "GET" && m) {
    const subjectId = decodeURIComponent(m[1]);
    const detailPath = url.searchParams.get("detail_path");
    const se = url.searchParams.get("se") || "0";
    const ep = url.searchParams.get("ep") || "0";

    if (!detailPath) {
      sendJson(res, 400, { error: "detail_path is required" });
      return;
    }

    try {
      const { sources, stream_domain } = await resolveStreams(
        subjectId,
        detailPath,
        se,
        ep
      );
      sendJson(res, 200, {
        subject_id: subjectId,
        detail_path: detailPath,
        season: Number(se),
        episode: Number(ep),
        stream_domain,
        count: sources.length,
        sources,
        relay: "localhost",
      });
    } catch (err) {
      sendJson(res, err.status === 429 ? 429 : 502, {
        error: "Stream failed",
        code: err.status === 429 ? "RATE_LIMITED" : "STREAM_ERROR",
      });
    }
    return;
  }

  sendJson(res, 404, { error: "Not found" });
});

server.requestTimeout = 0;
server.headersTimeout = 0;
server.timeout = 0;

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Play relay on http://0.0.0.0:${PORT}`);
});
