export function getApiBase() {
  return (
    process.env.NEXT_PUBLIC_API_BASE?.replace(/\/+$/, "") ||
    "http://127.0.0.1:8787"
  );
}

export function getPlayRelayBase() {
  return (
    process.env.NEXT_PUBLIC_PLAY_RELAY?.replace(/\/+$/, "") ||
    "http://127.0.0.1:8788"
  );
}

export function getAppClientKey() {
  return String(process.env.NEXT_PUBLIC_APP_CLIENT_KEY || "").trim();
}

/** Headers for API / relay when Origin is missing (SSR) or as extra auth. */
export function apiClientHeaders(extra = {}) {
  const headers = {
    Accept: "application/json",
    "X-MovieHunter-Client": "web",
    ...extra,
  };
  const key = getAppClientKey();
  if (key) headers["X-App-Key"] = key;
  return headers;
}

export function withAppKeyQuery(url) {
  const key = getAppClientKey();
  if (!key || !url) return url;
  try {
    const u = new URL(url);
    if (!u.searchParams.get("app_key")) u.searchParams.set("app_key", key);
    return u.toString();
  } catch {
    const join = url.includes("?") ? "&" : "?";
    return `${url}${join}app_key=${encodeURIComponent(key)}`;
  }
}
