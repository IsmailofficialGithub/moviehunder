const MAX_CACHED_SEARCHES = 12;
const entries = new Map();
let lastQuery = "";

export function getCachedSearch(query) {
  const key = String(query || "").trim().toLowerCase();
  if (!key) return null;
  const hit = entries.get(key);
  return hit ? [...hit] : null;
}

export function setCachedSearch(query, movies) {
  const key = String(query || "").trim().toLowerCase();
  if (!key || !Array.isArray(movies)) return;
  entries.delete(key);
  entries.set(key, [...movies]);
  while (entries.size > MAX_CACHED_SEARCHES) {
    entries.delete(entries.keys().next().value);
  }
}

export function getLastSearchQuery() {
  return lastQuery;
}

export function setLastSearchQuery(query) {
  lastQuery = String(query || "").trim();
}
