import { authFetch, getStoredSession } from "./auth.js";

export const PRESET_AVATARS = [
  { id: "red", url: "https://api.dicebear.com/7.x/avataaars/svg?seed=Justin&backgroundColor=e50914", label: "Red" },
  { id: "blue", url: "https://api.dicebear.com/7.x/avataaars/svg?seed=Kids&backgroundColor=38bdf8", label: "Kids Blue" },
  { id: "purple", url: "https://api.dicebear.com/7.x/avataaars/svg?seed=Cinema&backgroundColor=8b5cf6", label: "Violet" },
  { id: "green", url: "https://api.dicebear.com/7.x/avataaars/svg?seed=Echo&backgroundColor=10b981", label: "Emerald" },
  { id: "amber", url: "https://api.dicebear.com/7.x/avataaars/svg?seed=Star&backgroundColor=f59e0b", label: "Gold" },
  { id: "night", url: "https://api.dicebear.com/7.x/avataaars/svg?seed=Night&backgroundColor=334155", label: "Slate" },
];

export const MAX_PROFILES = 5;

export function preloadProfileAvatars(profiles) {
  if (typeof window === "undefined" || !Array.isArray(profiles)) return;
  profiles.forEach((p) => {
    const url = p?.avatar || p?.avatarUrl;
    if (url && typeof Image !== "undefined") {
      const img = new Image();
      img.src = url;
    }
  });
}

export function getUserProfilesKey(userId) {
  return `mh.profiles.${userId || "guest"}`;
}

export function loadUserProfiles(user) {
  if (typeof window === "undefined") return [];
  const effectiveUser = user || getStoredSession()?.user;
  const key = getUserProfilesKey(effectiveUser?.id);
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        preloadProfileAvatars(parsed);
        return parsed;
      }
    }
  } catch {}

  const userAvatar = effectiveUser?.avatar_url || effectiveUser?.avatarUrl || effectiveUser?.picture;
  const initial = [
    {
      id: "1",
      name: effectiveUser?.display_name || effectiveUser?.name || "Justin",
      avatar: userAvatar || PRESET_AVATARS[0].url,
      isKids: false,
      pin: "",
    },
    {
      id: "2",
      name: "Kids",
      avatar: PRESET_AVATARS[1].url,
      isKids: true,
      pin: "",
    },
  ];
  try {
    localStorage.setItem(key, JSON.stringify(initial));
    preloadProfileAvatars(initial);
  } catch {}
  return initial;
}

export function saveUserProfiles(user, profiles, notify = true) {
  if (typeof window === "undefined" || !Array.isArray(profiles)) return;
  const effectiveUser = user || getStoredSession()?.user;
  const key = getUserProfilesKey(effectiveUser?.id);
  try {
    localStorage.setItem(key, JSON.stringify(profiles));
    preloadProfileAvatars(profiles);
    if (notify) {
      window.dispatchEvent(new CustomEvent("mh:profiles_list:change", { detail: profiles }));
    }
  } catch {}
}

export function loadPlanQuota() {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("mh.plan_quota");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function savePlanQuota(plan) {
  if (typeof window === "undefined" || !plan) return;
  try {
    localStorage.setItem("mh.plan_quota", JSON.stringify(plan));
  } catch {}
}

export function getActiveProfile(user) {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("active_profile");
    if (raw) {
      const p = JSON.parse(raw);
      if (p?.id) return p;
    }
  } catch {}
  const list = loadUserProfiles(user);
  return list[0] || null;
}

export function getActiveProfileId() {
  if (typeof window === "undefined") return "1";
  try {
    const raw = localStorage.getItem("active_profile");
    if (raw) {
      const p = JSON.parse(raw);
      if (p?.id) return String(p.id);
    }
  } catch {}
  return "1";
}

export function switchActiveProfile(profile) {
  if (!profile || typeof window === "undefined") return;
  const normalized = {
    ...profile,
    avatar: profile.avatar || profile.avatarUrl || profile.avatar_url || "",
    avatarUrl: profile.avatarUrl || profile.avatar || profile.avatar_url || "",
  };
  try {
    localStorage.setItem("active_profile", JSON.stringify(normalized));
    window.dispatchEvent(new CustomEvent("mh:profile:change", { detail: normalized }));
    window.dispatchEvent(new Event("storage"));
  } catch {}
}

// API endpoints for backend integration
export async function fetchRemoteProfiles() {
  return authFetch("/api/profiles");
}

export async function createRemoteProfile(payload) {
  return authFetch("/api/profiles", {
    method: "POST",
    body: payload,
  });
}

export async function updateRemoteProfile(id, payload) {
  return authFetch(`/api/profiles/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: payload,
  });
}

export async function deleteRemoteProfile(id) {
  return authFetch(`/api/profiles/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function verifyRemoteProfilePin(id, pin) {
  return authFetch(`/api/profiles/${encodeURIComponent(id)}/verify-pin`, {
    method: "POST",
    body: { pin },
  });
}

export async function switchRemoteProfile(id, body = {}) {
  return authFetch(`/api/profiles/${encodeURIComponent(id)}/switch`, {
    method: "POST",
    body,
  });
}

export async function forgotRemoteProfilePin(id) {
  return authFetch(`/api/profiles/${encodeURIComponent(id)}/forgot-pin`, {
    method: "POST",
  });
}

export async function resetRemoteProfilePin(id, payload) {
  return authFetch(`/api/profiles/${encodeURIComponent(id)}/reset-pin`, {
    method: "POST",
    body: payload,
  });
}

