import * as SecureStore from "expo-secure-store";
import { getApiBase, apiClientHeaders } from "./config";

const ACCESS_KEY = "mh.auth.access";
const REFRESH_KEY = "mh.auth.refresh";
const USER_KEY = "mh.auth.user";

let memory = {
  access_token: null,
  refresh_token: null,
  user: null,
};

async function readKey(key) {
  try {
    return (await SecureStore.getItemAsync(key)) || null;
  } catch {
    return null;
  }
}

async function writeKey(key, value) {
  try {
    if (value == null) await SecureStore.deleteItemAsync(key);
    else await SecureStore.setItemAsync(key, String(value));
  } catch {
    /* ignore */
  }
}

export async function hydrateAuthSession() {
  const [access, refresh, userRaw] = await Promise.all([
    readKey(ACCESS_KEY),
    readKey(REFRESH_KEY),
    readKey(USER_KEY),
  ]);
  memory = {
    access_token: access,
    refresh_token: refresh,
    user: userRaw ? JSON.parse(userRaw) : null,
  };
  return memory;
}

export function getSession() {
  return { ...memory };
}

export async function storeSession(tokens) {
  if (tokens?.access_token) {
    memory.access_token = tokens.access_token;
    await writeKey(ACCESS_KEY, tokens.access_token);
  }
  if (tokens?.refresh_token) {
    memory.refresh_token = tokens.refresh_token;
    await writeKey(REFRESH_KEY, tokens.refresh_token);
  }
  if (tokens?.user) {
    memory.user = tokens.user;
    await writeKey(USER_KEY, JSON.stringify(tokens.user));
  }
}

export async function clearSession() {
  memory = { access_token: null, refresh_token: null, user: null };
  await Promise.all([
    writeKey(ACCESS_KEY, null),
    writeKey(REFRESH_KEY, null),
    writeKey(USER_KEY, null),
  ]);
}

async function authFetch(path, { method = "GET", body, retry = true } = {}) {
  const headers = {
    ...apiClientHeaders(),
    Accept: "application/json",
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (memory.access_token) {
    headers.Authorization = `Bearer ${memory.access_token}`;
  }

  const res = await fetch(`${getApiBase()}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && retry && memory.refresh_token) {
    const ok = await refreshSession();
    if (ok) return authFetch(path, { method, body, retry: false });
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.error || data.message || data.detail || `Request failed (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export async function refreshSession() {
  if (!memory.refresh_token) return null;
  try {
    const res = await fetch(`${getApiBase()}/api/auth/refresh`, {
      method: "POST",
      headers: {
        ...apiClientHeaders(),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ refresh_token: memory.refresh_token }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.access_token) {
      await clearSession();
      return null;
    }
    await storeSession(data);
    return data;
  } catch {
    await clearSession();
    return null;
  }
}

export async function signup(creds) {
  const data = await authFetch("/api/auth/signup", {
    method: "POST",
    body: creds,
    retry: false,
  });
  await storeSession(data);
  return data;
}

export async function login(creds) {
  const data = await authFetch("/api/auth/login", {
    method: "POST",
    body: creds,
    retry: false,
  });
  await storeSession(data);
  return data;
}

export async function logout() {
  try {
    if (memory.refresh_token) {
      await authFetch("/api/auth/logout", {
        method: "POST",
        body: { refresh_token: memory.refresh_token },
        retry: false,
      });
    }
  } catch {
    /* ignore */
  }
  await clearSession();
}

export async function fetchMe() {
  return authFetch("/api/auth/me");
}

export async function verifyEmail(token) {
  return authFetch("/api/auth/verify-email", {
    method: "POST",
    body: { token },
    retry: false,
  });
}

export async function resendVerification() {
  return authFetch("/api/auth/resend-verification", { method: "POST" });
}

export async function setPassword(password) {
  return authFetch("/api/auth/set-password", {
    method: "POST",
    body: { password },
  });
}

export function googleStartUrl({ client = "mobile" } = {}) {
  return `${getApiBase()}/api/auth/google/start?client=${encodeURIComponent(client)}`;
}

export async function linkGoogle() {
  return authFetch("/api/auth/link/google", { method: "POST", body: {} });
}

export async function syncGet(path) {
  return authFetch(path);
}

export async function syncPut(path, items, extra = {}) {
  return authFetch(path, { method: "PUT", body: { items, ...extra } });
}
