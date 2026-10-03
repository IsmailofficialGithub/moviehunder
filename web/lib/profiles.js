"use client";

import { authFetch } from "./auth.js";

export const ACTIVE_PROFILE_KEY = "mh.active_profile";

export const BRAND_COLORS = [
  "5a00a2", // Primary purple accent
  "3d0081", // Deep royal purple
  "bd84db", // Lavender / lilac
  "1a1a1f", // Dark slate
  "38bdf8", // Sky blue for Kids
  "f5c518", // Gold accent
];

export const CURATED_AVATARS = [
  {
    id: "royal-hunter",
    label: "Hunter",
    url: "https://api.dicebear.com/7.x/avataaars/svg?seed=Hunter&backgroundColor=5a00a2",
  },
  {
    id: "deep-offstream",
    label: "Offstream",
    url: "https://api.dicebear.com/7.x/avataaars/svg?seed=Offstream&backgroundColor=3d0081",
  },
  {
    id: "lavender-dream",
    label: "Lavender",
    url: "https://api.dicebear.com/7.x/avataaars/svg?seed=Lavender&backgroundColor=bd84db",
  },
  {
    id: "slate-stealth",
    label: "Stealth",
    url: "https://api.dicebear.com/7.x/avataaars/svg?seed=Stealth&backgroundColor=1a1a1f",
  },
  {
    id: "kids-sky",
    label: "Kids Zone",
    url: "https://api.dicebear.com/7.x/avataaars/svg?seed=KidsZone&backgroundColor=38bdf8",
  },
  {
    id: "gold-star",
    label: "Gold Star",
    url: "https://api.dicebear.com/7.x/avataaars/svg?seed=Star&backgroundColor=f5c518",
  },
];

export function generateAvatarUrl(name = "User", { isKids = false, bgColor = null } = {}) {
  const seed = encodeURIComponent(String(name || "User").trim());
  const color = bgColor || (isKids ? "38bdf8" : "5a00a2");
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}&backgroundColor=${color}`;
}

export function getActiveProfile() {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(ACTIVE_PROFILE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setActiveProfile(profile) {
  if (typeof window === "undefined" || !profile) return;
  try {
    localStorage.setItem(ACTIVE_PROFILE_KEY, JSON.stringify(profile));
    window.dispatchEvent(
      new CustomEvent("mh:profile_changed", { detail: profile })
    );
  } catch {}
}

export function clearActiveProfile() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(ACTIVE_PROFILE_KEY);
    window.dispatchEvent(
      new CustomEvent("mh:profile_changed", { detail: null })
    );
  } catch {}
}

// ── API Endpoints ────────────────────────────────────────────────────────────

export async function fetchProfiles() {
  return await authFetch("/api/profiles");
}

export async function createProfile({ name, avatarUrl, isKids = false }) {
  return await authFetch("/api/profiles", {
    method: "POST",
    body: { name, avatarUrl, isKids },
  });
}

export async function updateProfile(id, { name, avatarUrl, isKids }) {
  return await authFetch(`/api/profiles/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: { name, avatarUrl, isKids },
  });
}

export async function deleteProfile(id) {
  return await authFetch(`/api/profiles/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function buyExtraSlot() {
  return await authFetch("/api/profiles/extra-slot", {
    method: "POST",
    body: { action: "purchase" },
  });
}
