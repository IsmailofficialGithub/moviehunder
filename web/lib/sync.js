"use client";

// Web watch progress sync & browser cache management.
// Provides user-isolated caching, SWR instant-loading, and multi-device playback synchronization.

import { getStoredSession, syncGet, syncPut } from "./auth.js";
import { getActiveProfileId } from "./profiles.js";

const WATCH_PREFIX = "history_";
const CURRENT_USER_KEY = "mh.current_user_id";
const CACHE_PREFIX = "mh.watch.cache.v2.";

export function parseTimestamp(val) {
  if (!val) return 0;
  if (typeof val === "number") return val;
  const p = Date.parse(val);
  return isNaN(p) ? 0 : p;
}

// ── Profile-Isolated Browser Cache ──────────────────────────────────────────

function resolveScopeKey(userId, profileId) {
  const pId = profileId || getActiveProfileId();
  return userId ? `${userId}_p${pId}` : "guest";
}

export function getWatchCache(userId, profileId) {
  if (typeof window === "undefined") return [];
  try {
    const scope = resolveScopeKey(userId, profileId);
    const key = `${CACHE_PREFIX}${scope}`;
    const raw = localStorage.getItem(key);
    if (!raw) {
      // Legacy fallback: if migrating from un-scoped user cache to profile 1
      const pId = profileId || getActiveProfileId();
      if (userId && pId === "1") {
        const legacy = localStorage.getItem(`${CACHE_PREFIX}${userId}`);
        if (legacy) return JSON.parse(legacy);
      }
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.sort((a, b) => parseTimestamp(b.updatedAt) - parseTimestamp(a.updatedAt))
      : [];
  } catch {
    return [];
  }
}

export function saveWatchCache(userId, items, profileId) {
  if (typeof window === "undefined" || !Array.isArray(items)) return;
  try {
    const scope = resolveScopeKey(userId, profileId);
    const key = `${CACHE_PREFIX}${scope}`;
    const sorted = [...items].sort(
      (a, b) => parseTimestamp(b.updatedAt) - parseTimestamp(a.updatedAt)
    );
    localStorage.setItem(key, JSON.stringify(sorted));
  } catch {}
}

export function updateWatchCacheSingle(userId, item, profileId) {
  if (typeof window === "undefined" || !item) return;
  try {
    const list = getWatchCache(userId, profileId);
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

    saveWatchCache(userId, list, profileId);
  } catch {}
}

export function clearWatchCache(userId, profileId) {
  if (typeof window === "undefined") return;
  try {
    if (profileId) {
      const scope = resolveScopeKey(userId, profileId);
      localStorage.removeItem(`${CACHE_PREFIX}${scope}`);
      return;
    }
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

// ── Storage & Profile-Isolated History ──────────────────────────────────────

export function clearLocalWatchHistory(profileId) {
  if (typeof window === "undefined") return;
  const pId = profileId ? String(profileId) : null;
  const toRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (pId) {
      const pPrefix = pId === "1" ? "" : `p${pId}_`;
      if (
        (pId === "1" && (key.startsWith("history_") && !key.startsWith("history_p"))) ||
        (pId !== "1" && (key.startsWith(`history_${pPrefix}`) || key.startsWith(`history_time_${pPrefix}`) || key.startsWith(`history_meta_${pPrefix}`)))
      ) {
        toRemove.push(key);
      }
    } else {
      if (key.startsWith(WATCH_PREFIX) || key.startsWith(CACHE_PREFIX)) {
        toRemove.push(key);
      }
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
  try {
    localStorage.removeItem("active_profile");
  } catch {}
}

// ── List & Apply Watch Items ────────────────────────────────────────────────

export function getHistoryStorageKeys(subjectId, se, ep, profileId) {
  const pId = String(profileId || getActiveProfileId() || "1");
  const seStr = String(se || "0");
  const epStr = String(ep || "0");
  const pPrefix = pId === "1" ? "" : `p${pId}_`;
  return {
    key: `${WATCH_PREFIX}${pPrefix}${subjectId}_${seStr}_${epStr}`,
    legacyKey: `${WATCH_PREFIX}${subjectId}_${seStr}_${epStr}`,
    timeKey: `history_time_${pPrefix}${subjectId}_${seStr}_${epStr}`,
    legacyTimeKey: `history_time_${subjectId}_${seStr}_${epStr}`,
    metaKey: `history_meta_${pPrefix}${subjectId}`,
    legacyMetaKey: `history_meta_${subjectId}`,
    profileId: pId,
  };
}

export function listLocalWatch(profileId) {
  if (typeof window === "undefined") return [];
  const targetPid = String(profileId || getActiveProfileId() || "1");
  const items = [];
  try {
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
      let itemPid = "1";
      let actualRest = rest;
      if (rest.startsWith("p") && rest.includes("_")) {
        const firstUnderscore = rest.indexOf("_");
        const prefixCandidate = rest.slice(0, firstUnderscore);
        if (/^p[\w-]+$/.test(prefixCandidate)) {
          itemPid = prefixCandidate.slice(1);
          actualRest = rest.slice(firstUnderscore + 1);
        }
      }
      if (String(itemPid) !== targetPid) {
        continue;
      }
      const parts = actualRest.split("_");
      if (parts.length < 3) continue;
      const rawEp = parts.pop();
      const rawSe = parts.pop();
      const ep = (!rawEp || rawEp === "undefined" || rawEp === "null") ? "0" : rawEp;
      const se = (!rawSe || rawSe === "undefined" || rawSe === "null") ? "0" : rawSe;
      const subjectId = parts.join("_");
      const position = Number(localStorage.getItem(key)) || 0;
      if (position < 2) continue;
      const progressKey = targetPid === "1" ? `t:${subjectId}:s${se}:e${ep}` : `p:${targetPid}:t:${subjectId}:s${se}:e${ep}`;

      let title = null;
      let poster = null;
      let detailPath = null;
      let duration = 0;
      let metaTime = 0;

      const pPrefix = targetPid === "1" ? "" : `p${targetPid}_`;
      const timeKey = `history_time_${pPrefix}${subjectId}_${se}_${ep}`;
      const specificTime = Number(localStorage.getItem(timeKey)) || 0;

      try {
        const metaRaw =
          localStorage.getItem(`history_meta_${pPrefix}${subjectId}`) ||
          (targetPid === "1" ? localStorage.getItem(`history_meta_${subjectId}`) : null);
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
        updatedAt: updatedAt ? new Date(updatedAt).toISOString() : new Date().toISOString(),
      });
    }
  } catch {}
  return items.sort((a, b) => parseTimestamp(b.updatedAt) - parseTimestamp(a.updatedAt));
}

export function applyRemoteWatch(items, targetProfileId) {
  if (!Array.isArray(items)) return;
  const session = getStoredSession();
  const userId = session?.user?.id;
  const currentProfileId = String(targetProfileId || getActiveProfileId() || "1");

  const profileMap = new Map();

  for (const item of items) {
    let pId = item.profileId ? String(item.profileId) : "1";
    if (!item.profileId && item.key?.startsWith("p:")) {
      const parts = item.key.split(":");
      pId = parts[1] || "1";
    }
    if (!profileMap.has(pId)) profileMap.set(pId, []);
    profileMap.get(pId).push(item);

    // Only write browser local storage keys for the active profile
    if (String(pId) === currentProfileId || currentProfileId === "1") {
      const subjectId = item.subjectId;
      if (!subjectId) continue;
      const se = item.se ?? "0";
      const ep = item.ep ?? "0";
      const keys = getHistoryStorageKeys(subjectId, se, ep, currentProfileId);
      const lsKey = keys.key;
      const timeKey = keys.timeKey;
      const remotePos = Number(item.position) || 0;
      const localPos = Number(localStorage.getItem(lsKey) || (pId === "1" ? localStorage.getItem(keys.legacyKey) : 0) || 0);
      const remoteTs = parseTimestamp(item.updatedAt) || Date.now();
      const localTs = Number(localStorage.getItem(timeKey) || (pId === "1" ? localStorage.getItem(keys.legacyTimeKey) : 0) || 0);

      if (remotePos > localPos || remoteTs > localTs) {
        localStorage.setItem(lsKey, String(remotePos));
        localStorage.setItem(timeKey, String(remoteTs));
      }

      if (item.title || item.poster || item.detailPath || item.duration) {
        const metaKey = keys.metaKey;
        let meta = {};
        try {
          meta = JSON.parse(
            localStorage.getItem(metaKey) ||
            (pId === "1" ? localStorage.getItem(keys.legacyMetaKey) : "{}") ||
            "{}"
          );
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

  for (const [pId, pItems] of profileMap.entries()) {
    saveWatchCache(userId, pItems, pId);
    if (currentProfileId === "1") {
      saveWatchCache(userId, pItems, "1");
    }
  }
}

// ── Optimized Live Playback Sync (Throttled & Heartbeat) ────────────────────

let lastSyncedAt = 0;
let syncTimeout = null;

// Sync active playing item to cache and server.
// - Updates browser cache immediately.
// - Throttles network sync to once every 15s during playback.
// - Syncs immediately on pause / seek / leave (immediate = true).
export function syncPlaybackProgress(item, { immediate = false, profileId } = {}) {
  if (!item || !item.subjectId) return;
  const session = getStoredSession();
  const userId = session?.user?.id;
  const activePid = String(profileId || getActiveProfileId() || "1");

  // Prefix key with profile tag for server partition
  const scopedKey = item.key?.startsWith("p:")
    ? item.key
    : (activePid === "1" ? item.key : `p:${activePid}:${item.key}`);
  const scopedItem = { ...item, profileId: activePid, key: scopedKey };

  // 1. Immediately update browser cache for active profile
  updateWatchCacheSingle(userId, scopedItem, activePid);

  if (typeof window !== "undefined") {
    try {
      window.dispatchEvent(
        new CustomEvent("mh:watch_progress:change", { detail: scopedItem })
      );
    } catch {}
  }

  // 2. If not signed in, nothing to push to server
  if (!session?.access_token) return;

  const now = Date.now();
  const endpoint = `/api/sync/watch-progress?profileId=${encodeURIComponent(activePid)}`;

  if (immediate) {
    clearTimeout(syncTimeout);
    lastSyncedAt = now;
    syncPut(endpoint, { item: scopedItem }).catch(() => {});
    return;
  }

  // Throttle regular playback syncs to once every 15 seconds
  if (now - lastSyncedAt >= 15000) {
    clearTimeout(syncTimeout);
    lastSyncedAt = now;
    syncPut(endpoint, { item: scopedItem }).catch(() => {});
  } else if (!syncTimeout) {
    syncTimeout = setTimeout(() => {
      syncTimeout = null;
      lastSyncedAt = Date.now();
      syncPut(endpoint, { item: scopedItem }).catch(() => {});
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

export async function pushWatchProgress(profileId) {
  if (!getStoredSession()?.access_token) return;
  const activePid = String(profileId || getActiveProfileId() || "1");
  const items = listLocalWatch(activePid);
  if (!items.length) return;
  await syncPut(`/api/sync/watch-progress?profileId=${encodeURIComponent(activePid)}`, items).catch(() => {});
}

export async function pullWatchProgress(targetProfileId) {
  const session = getStoredSession();
  if (!session?.access_token) return [];
  const activePid = String(targetProfileId || getActiveProfileId() || "1");
  const data = await syncGet(`/api/sync/watch-progress?profileId=${encodeURIComponent(activePid)}`);
  const remoteItems = data.items || [];
  applyRemoteWatch(remoteItems, activePid);

  // Filter strictly to the active profile to eliminate cross-profile bleed
  return remoteItems.filter((item) => {
    if (item.profileId) {
      return String(item.profileId) === activePid || activePid === "1";
    }
    const itemPid = item.key?.startsWith("p:") ? item.key.split(":")[1] : "1";
    return String(itemPid) === activePid || activePid === "1";
  });
}

export async function runFullSync() {
  if (!getStoredSession()?.access_token) return;
  const activePid = getActiveProfileId();
  await pushWatchProgress(activePid).catch(() => {});
  await pullWatchProgress(activePid).catch(() => {});
}
