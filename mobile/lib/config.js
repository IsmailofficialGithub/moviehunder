import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";

const REMOTE_ENV_STORAGE_KEY = "@moviehunter_remote_env_v1";

// In-memory remote env cache
let remoteEnvState = {};
let hydrated = false;

// Initialize remote env from local storage on boot
export async function hydrateRemoteEnv() {
  if (hydrated) return remoteEnvState;
  try {
    const raw = await AsyncStorage.getItem(REMOTE_ENV_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        remoteEnvState = { ...parsed, ...remoteEnvState };
      }
    }
  } catch {
    // Ignore cache load error
  } finally {
    hydrated = true;
  }
  return remoteEnvState;
}

// Immediately trigger hydration on file load
hydrateRemoteEnv().catch(() => {});

// Update remote env state dynamically and persist for offline launch
export function setRemoteEnv(env) {
  if (!env || typeof env !== "object") return;
  const filtered = {};
  for (const [k, v] of Object.entries(env)) {
    if (typeof v === "string" && v.trim()) {
      filtered[k.toLowerCase()] = v.trim();
    }
  }
  remoteEnvState = { ...remoteEnvState, ...filtered };
  AsyncStorage.setItem(REMOTE_ENV_STORAGE_KEY, JSON.stringify(remoteEnvState)).catch(() => {});
}

export function getRemoteEnv() {
  return { ...remoteEnvState };
}

function stripSlash(url) {
  return String(url || "").replace(/\/+$/, "");
}

// Host LAN IP Expo is serving from (when available)
function lanHost() {
  const hostUri =
    Constants.expoConfig?.hostUri ||
    Constants.linkingUri ||
    "";
  const match = String(hostUri).match(/(\d{1,3}(?:\.\d{1,3}){3})/);
  return match?.[1] || "";
}

export function getApiBase() {
  const fromRemote = stripSlash(remoteEnvState.api_base || remoteEnvState.expo_public_api_base);
  if (fromRemote) return fromRemote;

  const fromEnv = stripSlash(process.env.EXPO_PUBLIC_API_BASE);
  if (fromEnv && !/127\.0\.0\.1|localhost/i.test(fromEnv)) return fromEnv;
  const host = lanHost();
  if (host) return `http://${host}:8787`;
  return fromEnv || "http://127.0.0.1:8787";
}

export function getPlayRelayBase() {
  const fromRemote = stripSlash(remoteEnvState.play_relay || remoteEnvState.expo_public_play_relay);
  if (fromRemote) return fromRemote;

  const fromEnv = stripSlash(process.env.EXPO_PUBLIC_PLAY_RELAY);
  if (fromEnv && !/127\.0\.0\.1|localhost/i.test(fromEnv)) return fromEnv;
  const host = lanHost();
  if (host) return `http://${host}:8788`;
  return fromEnv || "http://127.0.0.1:8788";
}

// Shared secret for API gate (must match server APP_CLIENT_KEY)
export function getAppClientKey() {
  const fromRemote = String(
    remoteEnvState.app_client_key ||
    remoteEnvState.expo_public_app_client_key ||
    ""
  ).trim();
  if (fromRemote) return fromRemote;

  return String(process.env.EXPO_PUBLIC_APP_CLIENT_KEY || "").trim();
}

// Headers required by the API / play-relay CORS gate
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

// Append app_key for native media URLs (players can't set custom headers)
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
