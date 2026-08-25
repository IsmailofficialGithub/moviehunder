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
