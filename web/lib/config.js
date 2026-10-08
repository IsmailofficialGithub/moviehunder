export function getSiteUrl() {
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "";
  if (envUrl && !envUrl.includes("localhost") && !envUrl.includes("127.0.0.1")) {
    return envUrl.replace(/\/+$/, "");
  }
  if (typeof window !== "undefined" && window.location?.origin) {
    if (!window.location.origin.includes("localhost") && !window.location.origin.includes("127.0.0.1")) {
      return window.location.origin.replace(/\/+$/, "");
    }
  }
  return "https://offstream.co";
}

export function getApiBase() {
  const envBase = process.env.NEXT_PUBLIC_API_BASE?.replace(/\/+$/, "");
  if (envBase) {
    if (process.env.NODE_ENV === "production" && (envBase.includes("127.0.0.1") || envBase.includes("localhost"))) {
      return "https://api-moviehunder.ismailabbasi.qzz.io";
    }
    return envBase;
  }
  if (process.env.NODE_ENV === "production") {
    return "https://api-moviehunder.ismailabbasi.qzz.io";
  }
  return "http://127.0.0.1:8787";
}

export function getPlayRelayBase() {
  const envBase = process.env.NEXT_PUBLIC_PLAY_RELAY?.replace(/\/+$/, "");
  if (envBase) {
    if (process.env.NODE_ENV === "production" && (envBase.includes("127.0.0.1") || envBase.includes("localhost"))) {
      return "https://trackese.api";
    }
    return envBase;
  }
  if (process.env.NODE_ENV === "production") {
    return "https://trackese.api";
  }
  return "http://127.0.0.1:8788";
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
  // Only attach app key and explicit Origin outside the browser (SSR / Node)
  const isBrowser = typeof window !== "undefined";
  if (!isBrowser) {
    headers["X-MovieHunter-Client"] = "web";
    const site = getSiteUrl();
    headers["Origin"] = site;
    headers["Referer"] = `${site}/`;
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
