/**
 * In-memory catalog cache with AsyncStorage persistence.
 * Shows cached home on reopen; refreshes stale data in the background.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORE_KEY = "flick.catalog.v1";
/** Keep catalog longer so reopen feels instant; background sync still refreshes. */
const TTL_MS = 6 * 60 * 60 * 1000;

/** @type {Map<string, { sections: any[], at: number }>} */
const store = new Map();
let hydrated = false;
let hydratePromise = null;
let persistTimer = null;

function schedulePersist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persist().catch(() => {});
  }, 400);
}

async function persist() {
  const payload = Object.fromEntries(store.entries());
  await AsyncStorage.setItem(STORE_KEY, JSON.stringify(payload));
}

export async function hydrateCatalogCache() {
  if (hydrated) return;
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    try {
      const raw = await AsyncStorage.getItem(STORE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (data && typeof data === "object") {
          for (const [key, val] of Object.entries(data)) {
            if (val?.sections && Array.isArray(val.sections)) {
              store.set(key, { sections: val.sections, at: val.at || 0 });
            }
          }
        }
      }
    } catch {
      /* empty */
    } finally {
      hydrated = true;
      hydratePromise = null;
    }
  })();
  return hydratePromise;
}

export function getCachedSections(key) {
  return store.get(key)?.sections || null;
}

export function setCachedSections(key, sections) {
  store.set(key, { sections, at: Date.now() });
  schedulePersist();
}

export function hasCachedSections(key) {
  return store.has(key);
}

/** True if cache exists and is still fresh enough to skip network. */
export function isCacheFresh(key, ttlMs = TTL_MS) {
  const hit = store.get(key);
  if (!hit) return false;
  return Date.now() - hit.at < ttlMs;
}

export function getCacheAge(key) {
  const hit = store.get(key);
  if (!hit?.at) return null;
  return Date.now() - hit.at;
}

// Warm storage on import (non-blocking)
hydrateCatalogCache().catch(() => {});
