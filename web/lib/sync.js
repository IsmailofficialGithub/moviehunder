"use client";

/**
 * Web watch progress sync & browser cache management.
 * Provides user-isolated caching, SWR instant-loading, and multi-device playback synchronization.
 */

import { getStoredSession, syncGet, syncPut } from "./auth.js";
import { getActiveProfile } from "./profiles.js";

const WATCH_PREFIX = "history_";
const CURRENT_USER_KEY = "mh.current_user_id";
const CACHE_PREFIX = "mh.watch.cache.v2.";

export function parseTimestamp(val) {
  if (!val) return 0;
  if (typeof val === "number") return val;
  const p = Date.parse(val);
  return isNaN(p) ? 0 : p;
}

export function getWatchCacheKey(userId, profileId = null) {
  const user = userId ? String(userId) : "guest";
  const prof = profileId ? String(profileId) : (getActiveProfile()?.id || "default");
  return `${CACHE_PREFIX}${user}.${prof}`;
}

// ── User-Isolated Browser Cache ──────────────────────────────────────────────

export function getWatchCache(userId, profileId = null) {
  if (typeof window === "undefined") return [];
  try {
    const key = getWatchCacheKey(userId, profileId);
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.sort((a, b) => parseTimestamp(b.updatedAt) - parseTimestamp(a.updatedAt))
      : [];
  } catch {
    return [];
  }
}

export function saveWatchCache(userId, items, profileId = null) {
  if (typeof window === "undefined" || !Array.isArray(items)) return;
  try {
    const key = getWatchCacheKey(userId, profileId);
    const sorted = [...items].sort(
      (a, b) => parseTimestamp(b.updatedAt) - parseTimestamp(a.updatedAt)
    );
    localStorage.setItem(key, JSON.stringify(sorted));
  } catch {}
}

export function updateWatchCacheSingle(userId, item) {
  if (typeof window === "undefined" || !item) return;
  try {
    const list = getWatchCache(userId);
    const itemKey =
      item.key || `t:${item.subjectId}:s${item.se || "0"}:e${item.ep || "0"}`;

    const idx = list.findIndex(
      (i) =>
        (i.key && i.key === itemKey) ||
        (i.subjectId === item.subjectId &&
          String(i.se ?? "0") === String(item.se ?? "0") &&
          String(i.ep ?? "0") === String(item.ep ?? "0"))
    );

    const isDigits = item.title && /^\d+$/.test(String(item.title).trim());
    let resolvedTitle = (!isDigits && item.title) ? item.title : (idx >= 0 ? list[idx].title : item.title);
    let resolvedPoster = item.poster || (idx >= 0 ? list[idx].poster : null);

    // If still missing poster/title, inherit from any sibling item in list with same subjectId
    if (item.subjectId && (!resolvedPoster || !resolvedTitle || /^\d+$/.test(String(resolvedTitle)))) {
      const sibling = list.find((i) => i.subjectId === item.subjectId && (i.poster || (i.title && !/^\d+$/.test(String(i.title)))));
      if (sibling) {
        if (!resolvedPoster && sibling.poster) resolvedPoster = sibling.poster;
        if ((!resolvedTitle || /^\d+$/.test(String(resolvedTitle))) && sibling.title && !/^\d+$/.test(String(sibling.title))) {
          resolvedTitle = sibling.title;
        }
      }
    }

    const updated = {
      ...item,
      title: resolvedTitle,
      poster: resolvedPoster,
      key: itemKey,
      updatedAt: parseTimestamp(item.updatedAt) || Date.now(),
    };

    if (idx >= 0) {
      list[idx] = { ...list[idx], ...updated };
    } else {
      list.unshift(updated);
    }

    saveWatchCache(userId, list);
  } catch {}
}

export function clearWatchCache(userId) {
  if (typeof window === "undefined") return;
  try {
    if (userId) {
      localStorage.removeItem(`${CACHE_PREFIX}${userId}`);
    }
    localStorage.removeItem(`${CACHE_PREFIX}guest`);
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(CACHE_PREFIX)) toRemove.push(k);
    }
    toRemove.forEach((k) => localStorage.removeItem(k));
  } catch {}
}

// ── Legacy Storage & Session Isolation ───────────────────────────────────────

export function clearLocalWatchHistory() {
  if (typeof window === "undefined") return;
  const toRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(WATCH_PREFIX) || key?.startsWith(CACHE_PREFIX)) {
      toRemove.push(key);
    }
  }
  toRemove.forEach((k) => localStorage.removeItem(k));
}

export function ensureUserStorage(userId) {
  if (typeof window === "undefined") return;
  const currentKey = userId ? String(userId) : "guest";
  const lastUser = localStorage.getItem(CURRENT_USER_KEY);
  if (lastUser && lastUser !== currentKey) {
    clearWatchCache(lastUser);
    clearLocalWatchHistory();
  }
  localStorage.setItem(CURRENT_USER_KEY, currentKey);
}

export function handleLogoutCleanup(userId) {
  clearWatchCache(userId);
  clearLocalWatchHistory();
  ensureUserStorage(null);
}

// ── List & Apply Watch Items ────────────────────────────────────────────────

export function listLocalWatch() {
  if (typeof window === "undefined") return [];

  // Fallback to reading raw localStorage keys
  const items = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (
      !key?.startsWith(WATCH_PREFIX) ||
      key.startsWith("history_meta_") ||
      key.startsWith("history_time_")
    ) {
      continue;
    }
    const rest = key.slice(WATCH_PREFIX.length);
    const parts = rest.split("_");
    if (parts.length < 3) continue;
    const rawEp = parts.pop();
    const rawSe = parts.pop();
    const ep = (!rawEp || rawEp === "undefined" || rawEp === "null") ? "0" : rawEp;
    const se = (!rawSe || rawSe === "undefined" || rawSe === "null") ? "0" : rawSe;
    const subjectId = parts.join("_");
    const position = Number(localStorage.getItem(key)) || 0;
    if (position < 2) continue;
    const progressKey = `t:${subjectId}:s${se}:e${ep}`;

    let title = null;
    let poster = null;
    let detailPath = null;
    let duration = 0;
    let metaTime = 0;

    const timeKey = `history_time_${subjectId}_${se}_${ep}`;
    const specificTime = Number(localStorage.getItem(timeKey)) || 0;

    try {
      const metaRaw = localStorage.getItem(`history_meta_${subjectId}`);
      if (metaRaw) {
        const meta = JSON.parse(metaRaw);
        title = meta.title || null;
        poster = meta.poster || null;
        detailPath = meta.detailPath || null;
        duration = Number(meta.duration) || 0;
        metaTime = Number(meta.updatedAt) || 0;
      }
    } catch {}

    const updatedAt = specificTime || metaTime || 0;

    items.push({
      key: progressKey,
      position,
      duration,
      subjectId,
      se,
      ep,
      title,
      poster,
      detailPath,
      updatedAt,
    });
  }
  return items.sort((a, b) => parseTimestamp(b.updatedAt) - parseTimestamp(a.updatedAt));
}

export function applyRemoteWatch(items) {
  if (!Array.isArray(items)) return;
  const session = getStoredSession();
  const userId = session?.user?.id;

  for (const item of items) {
    const subjectId = item.subjectId;
    if (!subjectId) continue;
    const se = item.se ?? "0";
    const ep = item.ep ?? "0";
    const lsKey = `${WATCH_PREFIX}${subjectId}_${se}_${ep}`;
    const timeKey = `history_time_${subjectId}_${se}_${ep}`;
    const remotePos = Number(item.position) || 0;
    const localPos = Number(localStorage.getItem(lsKey) || 0);
    const remoteTs = parseTimestamp(item.updatedAt) || Date.now();
    const localTs = Number(localStorage.getItem(timeKey)) || 0;

    if (remotePos > localPos || remoteTs > localTs) {
      localStorage.setItem(lsKey, String(remotePos));
      localStorage.setItem(timeKey, String(remoteTs));
    }

    if (item.title || item.poster || item.detailPath || item.duration) {
      const metaKey = `history_meta_${subjectId}`;
      let meta = {};
      try {
        meta = JSON.parse(localStorage.getItem(metaKey) || "{}");
      } catch {}
      const isDigits = item.title && /^\d+$/.test(String(item.title).trim());
      const cleanTitle = (!isDigits && item.title) ? item.title : (meta.title || item.title || null);
      localStorage.setItem(
        metaKey,
        JSON.stringify({
          title: cleanTitle,
          poster: item.poster || meta.poster || null,
          detailPath: item.detailPath || meta.detailPath || null,
          duration: Number(item.duration) || Number(meta.duration) || 0,
          updatedAt: remoteTs,
        })
      );
    }
  }
}

// ── Optimized Live Playback Sync (Throttled & Heartbeat) ────────────────────

let lastSyncedAt = 0;
let syncTimeout = null;

/**
 * Sync active playing item to cache and server.
 * - Updates browser cache immediately.
 * - Throttles network sync to once every 15s during playback.
 * - Syncs immediately on pause / seek / leave (immediate = true).
 */
export function syncPlaybackProgress(item, { immediate = false } = {}) {
  if (!item || !item.subjectId) return;
  const session = getStoredSession();
  const userId = session?.user?.id;

  // 1. Immediately update browser cache
  updateWatchCacheSingle(userId, item);

  // 2. If not signed in, nothing to push to server
  if (!session?.access_token) return;

  const now = Date.now();
  if (immediate) {
    clearTimeout(syncTimeout);
    lastSyncedAt = now;
    syncPut("/api/sync/watch-progress", { item }).catch(() => {});
    return;
  }

  // Throttle regular playback syncs to once every 15 seconds
  if (now - lastSyncedAt >= 15000) {
    clearTimeout(syncTimeout);
    lastSyncedAt = now;
    syncPut("/api/sync/watch-progress", { item }).catch(() => {});
  } else if (!syncTimeout) {
    syncTimeout = setTimeout(() => {
      syncTimeout = null;
      lastSyncedAt = Date.now();
      syncPut("/api/sync/watch-progress", { item }).catch(() => {});
    }, 15000 - (now - lastSyncedAt));
  }
}

export function scheduleWatchSync() {
  if (!getStoredSession()?.access_token) return;
  clearTimeout(syncTimeout);
  syncTimeout = setTimeout(() => {
    pushWatchProgress().catch(() => {});
  }, 3000);
}

export async function pushWatchProgress() {
  if (!getStoredSession()?.access_token) return;
  const items = listLocalWatch();
  if (!items.length) return;
  await syncPut("/api/sync/watch-progress", items).catch(() => {});
}

export async function pullWatchProgress() {
  const session = getStoredSession();
  if (!session?.access_token) return [];
  const data = await syncGet("/api/sync/watch-progress");
  const remoteItems = data.items || [];
  applyRemoteWatch(remoteItems);
  return remoteItems;
}

export async function runFullSync() {
  if (!getStoredSession()?.access_token) return;
  await pushWatchProgress().catch(() => {});
  await pullWatchProgress().catch(() => {});
}
