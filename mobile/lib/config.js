import Constants from "expo-constants";

function stripSlash(url) {
  return String(url || "").replace(/\/+$/, "");
}

/** Host LAN IP Expo is serving from (when available). */
function lanHost() {
  const hostUri =
    Constants.expoConfig?.hostUri ||
    Constants.linkingUri ||
    "";
  const match = String(hostUri).match(/(\d{1,3}(?:\.\d{1,3}){3})/);
  return match?.[1] || "";
}

export function getApiBase() {
  const fromEnv = stripSlash(process.env.EXPO_PUBLIC_API_BASE);
  if (fromEnv && !/127\.0\.0\.1|localhost/i.test(fromEnv)) return fromEnv;
  const host = lanHost();
  if (host) return `http://${host}:8787`;
  return fromEnv || "http://127.0.0.1:8787";
}

export function getPlayRelayBase() {
  const fromEnv = stripSlash(process.env.EXPO_PUBLIC_PLAY_RELAY);
  if (fromEnv && !/127\.0\.0\.1|localhost/i.test(fromEnv)) return fromEnv;
  const host = lanHost();
  if (host) return `http://${host}:8788`;
  return fromEnv || "http://127.0.0.1:8788";
}

/** Shared secret for API gate (must match server APP_CLIENT_KEY). */
export function getAppClientKey() {
  return String(process.env.EXPO_PUBLIC_APP_CLIENT_KEY || "").trim();
}

/** Headers required by the API / play-relay CORS gate. */
export function apiClientHeaders(extra = {}) {
  const headers = {
    Accept: "application/json",
    "X-MovieHunter-Client": "app",
    ...extra,
  };
  const key = getAppClientKey();
  if (key) headers["X-App-Key"] = key;
  return headers;
}

/** Append app_key for native media URLs (players can't set custom headers). */
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
