"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { authFetch, getStoredSession } from "./auth.js";
import { getActiveProfileId } from "./profiles.js";

const WATCHLIST_PREFIX = "mh.watchlist.v1.";
const OFFLINE_QUEUE_KEY = "mh.watchlist.offline_queue";

// In-flight debounce guard: prevents rapid double clicks from firing duplicated network mutations
const inFlight = new Set();

export function resolveScopeKey() {
  if (typeof window === "undefined") return "guest_p1";
  try {
    const session = getStoredSession();
    const userId = session?.user?.id;
    const pId = getActiveProfileId() || "1";
    return userId ? `${userId}_p${pId}` : `guest_p${pId}`;
  } catch {
    return "guest_p1";
  }
}

function getStorageKey() {
  return `${WATCHLIST_PREFIX}${resolveScopeKey()}`;
}

export function getWatchlist() {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(getStorageKey());
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.sort((a, b) => new Date(b.addedAt || 0) - new Date(a.addedAt || 0))
      : [];
  } catch {
    // Corrupted storage recovery: reset key rather than failing
    try {
      localStorage.setItem(getStorageKey(), "[]");
    } catch {}
    return [];
  }
}

export function setWatchlistCache(items) {
  if (typeof window === "undefined" || !Array.isArray(items)) return;
  try {
    localStorage.setItem(getStorageKey(), JSON.stringify(items));
    window.dispatchEvent(new CustomEvent("mh:watchlist:change", { detail: { action: "sync", count: items.length } }));
    window.dispatchEvent(new Event("storage"));
  } catch {}
}

export function isInWatchlist(idOrSlug) {
  if (!idOrSlug || typeof window === "undefined") return false;
  const target = String(idOrSlug).toLowerCase().trim();
  const list = getWatchlist();
  return list.some((item) => {
    const iId = String(item.id || item.subjectId || "").toLowerCase().trim();
    const iSlug = String(item.slug || "").toLowerCase().trim();
    const iDetail = String(item.detailPath || "").toLowerCase().trim();
    return (
      iId === target ||
      iSlug === target ||
      iDetail === target ||
      iDetail.endsWith(`/${target}`) ||
      target.endsWith(`/${iSlug}`)
    );
  });
}

function normalizeItem(raw) {
  const id = String(raw.id || raw.subjectId || raw.slug || "").trim();
  const slug = String(
    raw.slug ||
    (raw.detailPath
      ? String(raw.detailPath).replace(/^\/?(?:detail|title)\//, "").replace(/^\/+/, "")
      : "") ||
    id
  ).trim();

  return {
    id: id || slug,
    subjectId: id || slug,
    slug,
    name: raw.name || raw.title || "Untitled",
    title: raw.title || raw.name || "Untitled",
    poster_url: raw.poster_url || raw.poster || "",
    poster: raw.poster || raw.poster_url || "",
    detailPath: slug,
    type: raw.type === "tv" || Number(raw.episode_count) > 0 || raw.isSeries ? "tv" : "movie",
    year: raw.year ? String(raw.year) : "",
    rating: raw.rating ? String(raw.rating) : "",
    badge: raw.badge ? String(raw.badge) : "",
    addedAt: raw.addedAt || new Date().toISOString(),
  };
}

// ── Offline Queue Management ────────────────────────────────────────────────

function enqueueOfflineMutation(type, item) {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    const queue = raw ? JSON.parse(raw) : [];
    queue.push({
      type, // "add" | "remove"
      item,
      scope: resolveScopeKey(),
      queuedAt: Date.now(),
    });
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  } catch {}
}

export async function flushOfflineQueue() {
  if (typeof window === "undefined" || !navigator.onLine) return;
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!raw) return;
    const queue = JSON.parse(raw);
    if (!Array.isArray(queue) || queue.length === 0) return;

    localStorage.removeItem(OFFLINE_QUEUE_KEY);
    const session = getStoredSession();
    if (!session?.access_token) return;

    for (const entry of queue) {
      const pId = getActiveProfileId() || "1";
      if (entry.type === "add" && entry.item) {
        await authFetch("/api/watchlist", {
          method: "POST",
          body: { ...entry.item, profileId: pId },
        }).catch(() => {});
      } else if (entry.type === "remove" && entry.item?.id) {
        await authFetch(`/api/watchlist/${encodeURIComponent(entry.item.id)}?profileId=${pId}`, {
          method: "DELETE",
        }).catch(() => {});
      }
    }
  } catch {}
}

// ── Server Sync & Hydration ──────────────────────────────────────────────────

export async function fetchRemoteWatchlist(sort = "date") {
  if (typeof window === "undefined") return [];
  const session = getStoredSession();
  if (!session?.access_token) {
    return getWatchlist();
  }
  const pId = getActiveProfileId() || "1";
  try {
    const res = await authFetch(`/api/watchlist?profileId=${encodeURIComponent(pId)}&sort=${encodeURIComponent(sort)}`);
    if (res?.ok && Array.isArray(res.items)) {
      setWatchlistCache(res.items);
      return res.items;
    }
  } catch (err) {
    console.warn("Using offline watchlist cache:", err);
  }
  return getWatchlist();
}

// ── Guest to Logged-in Migration ─────────────────────────────────────────────

export async function mergeGuestWatchlistToServer() {
  if (typeof window === "undefined") return;
  const session = getStoredSession();
  if (!session?.access_token) return;

  try {
    const guestKey = `${WATCHLIST_PREFIX}guest_p1`;
    const raw = localStorage.getItem(guestKey);
    if (!raw) return;
    const guestItems = JSON.parse(raw);
    if (!Array.isArray(guestItems) || guestItems.length === 0) return;

    const pId = getActiveProfileId() || "1";
    for (const item of guestItems) {
      await authFetch("/api/watchlist", {
        method: "POST",
        body: { ...item, profileId: pId },
      }).catch(() => {});
    }
    // Clean guest storage after migration
    localStorage.removeItem(guestKey);
    // Refresh cache for active user
    await fetchRemoteWatchlist();
  } catch (err) {
    console.error("Guest watchlist merge failed", err);
  }
}

// ── Main Mutation Actions ────────────────────────────────────────────────────

export async function toggleWatchlist(rawItem) {
  if (!rawItem || typeof window === "undefined") return false;
  const item = normalizeItem(rawItem);
  const id = item.id;
  if (!id || inFlight.has(id)) {
    return isInWatchlist(id);
  }

  inFlight.add(id);
  const currentlySaved = isInWatchlist(id);
  const previousList = getWatchlist();

  // 1. Optimistic update
  let nextList;
  if (currentlySaved) {
    nextList = previousList.filter((it) => {
      const iId = String(it.id || it.subjectId || "").toLowerCase();
      const iSlug = String(it.slug || "").toLowerCase();
      return iId !== id.toLowerCase() && iSlug !== id.toLowerCase();
    });
  } else {
    nextList = [item, ...previousList.filter((it) => it.id !== id && it.slug !== id)];
  }

  try {
    localStorage.setItem(getStorageKey(), JSON.stringify(nextList));
    window.dispatchEvent(new CustomEvent("mh:watchlist:change", {
      detail: { action: currentlySaved ? "remove" : "add", item, inWatchlist: !currentlySaved }
    }));
    window.dispatchEvent(new Event("storage"));
  } catch (err) {
    console.error("Local storage error:", err);
  }

  // 2. Server mutation with rollback
  const session = getStoredSession();
  const isOnline = typeof navigator === "undefined" || navigator.onLine;

  if (session?.access_token) {
    const pId = getActiveProfileId() || "1";
    if (!isOnline) {
      enqueueOfflineMutation(currentlySaved ? "remove" : "add", item);
    } else {
      try {
        if (currentlySaved) {
          const res = await authFetch(`/api/watchlist/${encodeURIComponent(id)}?profileId=${encodeURIComponent(pId)}`, {
            method: "DELETE",
          });
          if (!res?.ok && res?.status >= 400) throw new Error("Delete failed");
        } else {
          const res = await authFetch("/api/watchlist", {
            method: "POST",
            body: { ...item, profileId: pId },
          });
          if (!res?.ok && res?.status >= 400) throw new Error("Add failed");
        }
      } catch (err) {
        // Rollback local state
        try {
          localStorage.setItem(getStorageKey(), JSON.stringify(previousList));
          window.dispatchEvent(new CustomEvent("mh:watchlist:change", {
            detail: { action: "rollback", item, inWatchlist: currentlySaved }
          }));
          window.dispatchEvent(new Event("storage"));
          window.dispatchEvent(new CustomEvent("mh:toast", {
            detail: { message: "Could not sync watchlist — check connection", type: "error" }
          }));
        } catch {}
      }
    }
  }

  inFlight.delete(id);
  return !currentlySaved;
}

export async function bulkRemoveFromWatchlist(idsToRemove) {
  if (!Array.isArray(idsToRemove) || idsToRemove.length === 0 || typeof window === "undefined") return;
  const idSet = new Set(idsToRemove.map((id) => String(id).toLowerCase().trim()));
  const previousList = getWatchlist();
  const nextList = previousList.filter((it) => !idSet.has(String(it.id || it.subjectId || "").toLowerCase()));

  try {
    localStorage.setItem(getStorageKey(), JSON.stringify(nextList));
    window.dispatchEvent(new CustomEvent("mh:watchlist:change", { detail: { action: "bulk_remove", ids: idsToRemove } }));
    window.dispatchEvent(new Event("storage"));
  } catch {}

  const session = getStoredSession();
  if (session?.access_token && navigator.onLine) {
    const pId = getActiveProfileId() || "1";
    try {
      await authFetch(`/api/watchlist?profileId=${encodeURIComponent(pId)}`, {
        method: "DELETE",
        body: { subjectIds: idsToRemove },
      });
    } catch {
      // rollback if bulk delete fails
      localStorage.setItem(getStorageKey(), JSON.stringify(previousList));
      window.dispatchEvent(new CustomEvent("mh:watchlist:change", { detail: { action: "rollback" } }));
      window.dispatchEvent(new Event("storage"));
    }
  }
}

// ── React Hook ───────────────────────────────────────────────────────────────

export function useWatchlist(idOrSlug) {
  const [inWatchlist, setInWatchlist] = useState(() => isInWatchlist(idOrSlug));
  const [isSaving, setIsSaving] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    setInWatchlist(isInWatchlist(idOrSlug));

    const handleUpdate = () => {
      if (mountedRef.current) {
        setInWatchlist(isInWatchlist(idOrSlug));
      }
    };

    window.addEventListener("mh:watchlist:change", handleUpdate);
    window.addEventListener("mh:profile:change", handleUpdate);
    window.addEventListener("online", flushOfflineQueue);
    window.addEventListener("storage", handleUpdate);

    return () => {
      mountedRef.current = false;
      window.removeEventListener("mh:watchlist:change", handleUpdate);
      window.removeEventListener("mh:profile:change", handleUpdate);
      window.removeEventListener("online", flushOfflineQueue);
      window.removeEventListener("storage", handleUpdate);
    };
  }, [idOrSlug]);

  const toggle = useCallback(
    async (item) => {
      const target = item || { id: idOrSlug, slug: idOrSlug };
      setIsSaving(true);
      try {
        const next = await toggleWatchlist(target);
        if (mountedRef.current) setInWatchlist(next);
        return next;
      } finally {
        if (mountedRef.current) setIsSaving(false);
      }
    },
    [idOrSlug]
  );

  return { inWatchlist, isSaving, toggle };
}
