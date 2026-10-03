/**
 * Cloudflare Worker-safe proxy to the Node API (play-relay).
 * Do not import Prisma / nodemailer / argon2 here.
 */

export function isProxiedApiPath(pathname) {
  const p = String(pathname || "").replace(/\/+$/, "") || "/";
  return (
    p.startsWith("/api/access") ||
    p.startsWith("/api/auth") ||
    p.startsWith("/api/profiles") ||
    p.startsWith("/api/sync") ||
    p.startsWith("/api/history/sync")
  );
}

function nodeApiBase(env) {
  return String(env?.NODE_API_URL || "").trim().replace(/\/+$/, "");
}

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "content-encoding",
  "content-length",
]);

/**
 * Forward request to Node play-relay.
 */
export async function proxyToNodeApi(request, env) {
  const base = nodeApiBase(env);
  if (!base) {
    return new Response(
      JSON.stringify({
        error: "NODE_API_URL not configured",
        hint: "Set NODE_API_URL to the Node play-relay origin (auth/sync/access)",
      }),
      {
        status: 503,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      }
    );
  }

  const incoming = new URL(request.url);
  const target = `${base}${incoming.pathname}${incoming.search}`;

  const headers = new Headers();
  for (const [k, v] of request.headers) {
    if (HOP_BY_HOP.has(k.toLowerCase())) continue;
    if (k.toLowerCase() === "host") continue;
    headers.set(k, v);
  }
  headers.set("X-Forwarded-Host", incoming.host);
  headers.set("X-Forwarded-Proto", incoming.protocol.replace(":", ""));

  const init = {
    method: request.method,
    headers,
    redirect: "manual",
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    const buf = await request.arrayBuffer();
    if (buf && buf.byteLength > 0) {
      init.body = buf;
    }
  }

  let upstream;
  try {
    upstream = await fetch(target, init);
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: "Node API unreachable",
        hint: `Failed to reach ${base}`,
        detail: String(err?.message || err),
      }),
      {
        status: 502,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      }
    );
  }

  let status = Number(upstream.status);
  if (!Number.isFinite(status) || status < 200 || status > 599) {
    status = 502;
  }

  const outHeaders = new Headers();
  for (const [k, v] of upstream.headers) {
    if (HOP_BY_HOP.has(k.toLowerCase())) continue;
    outHeaders.set(k, v);
  }
  if (!outHeaders.has("content-type")) {
    outHeaders.set("Content-Type", "application/json; charset=utf-8");
  }

  const body = await upstream.arrayBuffer();
  return new Response(body, {
    status,
    headers: outHeaders,
  });
}
