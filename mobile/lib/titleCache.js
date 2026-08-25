/** Small LRU cache for title detail + episodes. */
const MAX_ENTRIES = 20;
const TTL_MS = 30 * 60 * 1000;
const store = new Map();

function touch(key, entry) {
  store.delete(key);
  store.set(key, entry);
}

function evictIfNeeded() {
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    store.delete(oldest);
  }
}

export function getCachedTitle(slug) {
  const key = String(slug || "");
  if (!key) return null;
  const hit = store.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > TTL_MS) {
    store.delete(key);
    return null;
  }
  touch(key, hit);
  return { detail: hit.detail, episodes: hit.episodes };
}

export function setCachedTitle(slug, { detail, episodes }) {
  const key = String(slug || "");
  if (!key || !detail) return;
  touch(key, { detail, episodes: episodes ?? null, at: Date.now() });
  evictIfNeeded();
}

export function clearTitleCache() {
  store.clear();
}
