"use client";

const ACCESS_KEY = "mh.auth.access";
const REFRESH_KEY = "mh.auth.refresh";
const USER_KEY = "mh.auth.user";

function apiBase() {
  return (
    process.env.NEXT_PUBLIC_API_BASE?.replace(/\/+$/, "") ||
    "http://127.0.0.1:8787"
  );
}

export function getStoredSession() {
  if (typeof window === "undefined") return null;
  try {
    const access = localStorage.getItem(ACCESS_KEY);
    const refresh = localStorage.getItem(REFRESH_KEY);
    const userRaw = localStorage.getItem(USER_KEY);
    if (!access && !refresh) return null;
    return {
      access_token: access,
      refresh_token: refresh,
      user: userRaw ? JSON.parse(userRaw) : null,
    };
  } catch {
    return null;
  }
}

export function storeSession(tokens) {
  if (typeof window === "undefined") return;
  if (tokens?.access_token) localStorage.setItem(ACCESS_KEY, tokens.access_token);
  if (tokens?.refresh_token) localStorage.setItem(REFRESH_KEY, tokens.refresh_token);
  if (tokens?.user) localStorage.setItem(USER_KEY, JSON.stringify(tokens.user));
}

export function clearSession() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
}

async function authFetch(path, { method = "GET", body, token, retry = true } = {}) {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const access = token || getStoredSession()?.access_token;
  if (access) headers.Authorization = `Bearer ${access}`;

  const res = await fetch(`${apiBase()}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && retry && getStoredSession()?.refresh_token) {
    const refreshed = await refreshSession();
    if (refreshed) {
      return authFetch(path, { method, body, retry: false });
    }
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export async function refreshSession() {
  const session = getStoredSession();
  if (!session?.refresh_token) return null;
  try {
    const data = await fetch(`${apiBase()}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    }).then((r) => r.json());
    if (!data.access_token) {
      clearSession();
      return null;
    }
    storeSession(data);
    return data;
  } catch {
    clearSession();
    return null;
  }
}

export async function signup({ email, password, display_name }) {
  const data = await authFetch("/api/auth/signup", {
    method: "POST",
    body: { email, password, display_name },
    retry: false,
  });
  storeSession(data);
  return data;
}

export async function login({ email, password }) {
  const data = await authFetch("/api/auth/login", {
    method: "POST",
    body: { email, password },
    retry: false,
  });
  storeSession(data);
  return data;
}

export async function logout() {
  const session = getStoredSession();
  try {
    if (session?.refresh_token) {
      await authFetch("/api/auth/logout", {
        method: "POST",
        body: { refresh_token: session.refresh_token },
        retry: false,
      });
    }
  } catch {
    /* ignore */
  }
  clearSession();
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

export function googleStartUrl({ client = "web" } = {}) {
  return `${apiBase()}/api/auth/google/start?client=${encodeURIComponent(client)}`;
}

export async function linkGoogle() {
  return authFetch("/api/auth/link/google", {
    method: "POST",
    body: {},
  });
}

export async function syncGet(path) {
  return authFetch(path);
}

export async function syncPut(path, items, extra = {}) {
  return authFetch(path, {
    method: "PUT",
    body: { items, ...extra },
  });
}
