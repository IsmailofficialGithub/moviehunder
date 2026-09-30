"use client";

/**
 * Web library sync — watch progress (localStorage) ↔ API.
 */

import { getStoredSession, syncGet, syncPut } from "./auth";

const WATCH_PREFIX = "history_";

export function listLocalWatch() {
  if (typeof window === "undefined") return [];
  const items = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(WATCH_PREFIX) || key.startsWith("history_meta_")) continue;
    const rest = key.slice(WATCH_PREFIX.length);
    const parts = rest.split("_");
    if (parts.length < 3) continue;
    const ep = parts.pop();
    const se = parts.pop();
    const subjectId = parts.join("_");
    const position = Number(localStorage.getItem(key)) || 0;
    if (position < 2) continue;
    const progressKey = `t:${subjectId}:s${se}:e${ep}`;

    let title = null;
    let poster = null;
    let detailPath = null;
    let duration = 0;

    try {
      const metaRaw = localStorage.getItem(`history_meta_${subjectId}`);
      if (metaRaw) {
        const meta = JSON.parse(metaRaw);
        title = meta.title || null;
        poster = meta.poster || null;
        detailPath = meta.detailPath || null;
        duration = Number(meta.duration) || 0;
      }
    } catch {}

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
      updatedAt: Date.now(),
    });
  }
  return items;
}

export function applyRemoteWatch(items) {
  if (!Array.isArray(items)) return;
  for (const item of items) {
    const subjectId = item.subjectId;
    if (!subjectId) continue;
    const se = item.se ?? "0";
    const ep = item.ep ?? "0";
    const lsKey = `${WATCH_PREFIX}${subjectId}_${se}_${ep}`;
    const remotePos = Number(item.position) || 0;
    const localPos = Number(localStorage.getItem(lsKey) || 0);
    if (remotePos > localPos) {
      localStorage.setItem(lsKey, String(remotePos));
    }

    // Restore or update history_meta_${subjectId} in localStorage
    if (item.title || item.poster || item.detailPath || item.duration) {
      const metaKey = `history_meta_${subjectId}`;
      let meta = {};
      try {
        meta = JSON.parse(localStorage.getItem(metaKey) || "{}");
      } catch {}
      localStorage.setItem(
        metaKey,
        JSON.stringify({
          title: item.title || meta.title || null,
          poster: item.poster || meta.poster || null,
          detailPath: item.detailPath || meta.detailPath || null,
          duration: Number(item.duration) || Number(meta.duration) || 0,
        })
      );
    }
  }
}

let syncTimer = null;

export function scheduleWatchSync() {
  if (!getStoredSession()?.access_token) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    pushWatchProgress().catch(() => {});
  }, 1000);
}

export async function pushWatchProgress() {
  if (!getStoredSession()?.access_token) return;
  const items = listLocalWatch();
  if (!items.length) return;
  await syncPut("/api/sync/watch-progress", items).catch(() => {});
}

export async function pullWatchProgress() {
  if (!getStoredSession()?.access_token) return [];
  const data = await syncGet("/api/sync/watch-progress");
  applyRemoteWatch(data.items || []);
  const local = listLocalWatch();
  const needsEnrich = local.filter((loc) => {
    const rem = (data.items || []).find((r) => r.key === loc.key);
    return !rem || (loc.title && !rem.title) || (loc.detailPath && !rem.detailPath) || (loc.poster && !rem.poster);
  });
  if (needsEnrich.length) {
    await syncPut("/api/sync/watch-progress", local).catch(() => {});
  }
  return data.items || [];
}

export async function runFullSync() {
  if (!getStoredSession()?.access_token) return;
  await pushWatchProgress().catch(() => {});
  await pullWatchProgress().catch(() => {});
}
