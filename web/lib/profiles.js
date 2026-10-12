"use client";

export const PRESET_AVATARS = [
  { id: "red", url: "https://api.dicebear.com/7.x/avataaars/svg?seed=Justin&backgroundColor=e50914", label: "Red" },
  { id: "blue", url: "https://api.dicebear.com/7.x/avataaars/svg?seed=Kids&backgroundColor=38bdf8", label: "Kids Blue" },
  { id: "purple", url: "https://api.dicebear.com/7.x/avataaars/svg?seed=Cinema&backgroundColor=8b5cf6", label: "Violet" },
  { id: "green", url: "https://api.dicebear.com/7.x/avataaars/svg?seed=Echo&backgroundColor=10b981", label: "Emerald" },
  { id: "amber", url: "https://api.dicebear.com/7.x/avataaars/svg?seed=Star&backgroundColor=f59e0b", label: "Gold" },
  { id: "night", url: "https://api.dicebear.com/7.x/avataaars/svg?seed=Night&backgroundColor=334155", label: "Slate" },
];

export const MAX_PROFILES = 5;

export function getUserProfilesKey(userId) {
  return `mh.profiles.${userId || "guest"}`;
}

export function loadUserProfiles(user) {
  if (typeof window === "undefined") return [];
  const key = getUserProfilesKey(user?.id);
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}

  const userAvatar = user?.avatar_url || user?.avatarUrl || user?.picture;
  const initial = [
    {
      id: "1",
      name: user?.display_name || user?.name || "Justin",
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
  } catch {}
  return initial;
}

export function saveUserProfiles(user, profiles) {
  if (typeof window === "undefined" || !Array.isArray(profiles)) return;
  const key = getUserProfilesKey(user?.id);
  try {
    localStorage.setItem(key, JSON.stringify(profiles));
    window.dispatchEvent(new CustomEvent("mh:profiles_list:change", { detail: profiles }));
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
  try {
    localStorage.setItem("active_profile", JSON.stringify(profile));
    window.dispatchEvent(new CustomEvent("mh:profile:change", { detail: profile }));
    window.dispatchEvent(new Event("storage"));
  } catch {}
}
