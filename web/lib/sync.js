"use client";

/**
 * Web library sync — watch progress (localStorage) ↔ API.
 */

import { getStoredSession, syncGet, syncPut } from "./auth";

const WATCH_PREFIX = "history_";

function listLocalWatch() {
  if (typeof window === "undefined") return [];
  const items = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(WATCH_PREFIX)) continue;
    const rest = key.slice(WATCH_PREFIX.length);
    const parts = rest.split("_");
    if (parts.length < 3) continue;
    const ep = parts.pop();
    const se = parts.pop();
    const subjectId = parts.join("_");
    const position = Number(localStorage.getItem(key)) || 0;
    if (position < 5) continue;
    const progressKey = `t:${subjectId}:s${se}:e${ep}`;
    items.push({
      key: progressKey,
      position,
      duration: 0,
      subjectId,
      se,
      ep,
      updatedAt: Date.now(),
    });
  }
  return items;
}

function applyRemoteWatch(items) {
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
  }
}

let syncTimer = null;

export function scheduleWatchSync() {
  if (!getStoredSession()?.access_token) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    pushWatchProgress().catch(() => {});
  }, 1500);
}

export async function pushWatchProgress() {
  if (!getStoredSession()?.access_token) return;
  const items = listLocalWatch();
  if (!items.length) return;
  await syncPut("/api/sync/watch-progress", items);
}

export async function pullWatchProgress() {
  if (!getStoredSession()?.access_token) return;
  const data = await syncGet("/api/sync/watch-progress");
  applyRemoteWatch(data.items || []);
  const local = listLocalWatch();
  if (local.length) await syncPut("/api/sync/watch-progress", local);
}

export async function runFullSync() {
  if (!getStoredSession()?.access_token) return;
  await pullWatchProgress();
}
