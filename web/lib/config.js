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

/** Public GitHub profile. */
export function getGithubUrl() {
  return (
    process.env.NEXT_PUBLIC_GITHUB_URL?.replace(/\/+$/, "") ||
    "https://github.com/IsmailofficialGithub"
  );
}

/** Remote version.json used for app update / download availability. */
export function getVersionJsonUrl() {
  return (
    process.env.NEXT_PUBLIC_VERSION_JSON_URL ||
    "https://raw.githubusercontent.com/IsmailofficialGithub/moviehunder/main/version.json"
  );
}

/** Headers for API / relay. Browser relies on Origin allowlist; SSR sends key. */
export function apiClientHeaders(extra = {}) {
  const headers = {
    Accept: "application/json",
    ...extra,
  };
  // Only attach app key outside the browser (SSR / Node) — custom headers
  // force a CORS preflight that browsers send without X-App-Key.
  const isBrowser = typeof window !== "undefined";
  if (!isBrowser) {
    headers["X-MovieHunter-Client"] = "web";
    const key = getAppClientKey();
    if (key) headers["X-App-Key"] = key;
  }
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
