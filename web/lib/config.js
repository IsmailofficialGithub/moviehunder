// Web application configuration
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

// Secret app key is strictly server-side. Never expose to client browser.
export function getAppClientKey() {
  if (typeof window !== "undefined") return "";
  // Support both the old NEXT_PUBLIC_ name and the new private name
  return String(
    process.env.APP_CLIENT_KEY || process.env.NEXT_PUBLIC_APP_CLIENT_KEY || ""
  ).trim();
}

// Public GitHub profile
export function getGithubUrl() {
  return (
    process.env.NEXT_PUBLIC_GITHUB_URL?.replace(/\/+$/, "") ||
    "https://github.com/IsmailofficialGithub"
  );
}

// Remote version.json used for app update / download availability
export function getVersionJsonUrl() {
  return (
    process.env.NEXT_PUBLIC_VERSION_JSON_URL ||
    "https://raw.githubusercontent.com/IsmailofficialGithub/moviehunder/main/version.json"
  );
}

// Headers for API / relay. Browser relies on Origin allowlist; SSR sends key.
export function apiClientHeaders(extra = {}) {
  const headers = {
    Accept: "application/json",
    ...extra,
  };
  // Only attach app key outside the browser (SSR / Node)
  const isBrowser = typeof window !== "undefined";
  if (!isBrowser) {
    headers["X-MovieHunter-Client"] = "web";
    const key = getAppClientKey();
    if (key) headers["X-App-Key"] = key;
  }
  return headers;
}

// Never append app_key on client browser. Preserved only for server-side callers.
export function withAppKeyQuery(url) {
  if (typeof window !== "undefined" || !url) return url;
  const key = getAppClientKey();
  if (!key) return url;
  try {
    const u = new URL(url);
    if (!u.searchParams.get("app_key")) u.searchParams.set("app_key", key);
    return u.toString();
  } catch {
    const join = url.includes("?") ? "&" : "?";
    return `${url}${join}app_key=${encodeURIComponent(key)}`;
  }
}
