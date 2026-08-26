import AsyncStorage from "@react-native-async-storage/async-storage";

const STORE_KEY = "moviehunter.search.history.v1";
const MAX_ITEMS = 20;

/** @type {string[]} */
let cache = [];
let hydrated = false;
let hydratePromise = null;

/** @type {Set<(list: string[]) => void>} */
const listeners = new Set();

function notify() {
  for (const fn of listeners) {
    try {
      fn([...cache]);
    } catch {
      /* ignore */
    }
  }
}

async function hydrate() {
  if (hydrated) return;
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    try {
      const raw = await AsyncStorage.getItem(STORE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (Array.isArray(data)) {
          cache = data
            .map((x) => String(x || "").trim())
            .filter(Boolean)
            .slice(0, MAX_ITEMS);
        }
      }
    } catch {
      cache = [];
    } finally {
      hydrated = true;
      hydratePromise = null;
      notify();
    }
  })();
  return hydratePromise;
}

async function persist() {
  await AsyncStorage.setItem(STORE_KEY, JSON.stringify(cache));
}

/** Subscribe to local search history (device only). */
export function subscribeSearchHistory(fn) {
  listeners.add(fn);
  hydrate().then(() => fn([...cache]));
  return () => listeners.delete(fn);
}

export async function getSearchHistory() {
  await hydrate();
  return [...cache];
}

/** Push query words to the top of history (deduped).
 *  "hello world" → stores "hello", then "world" as separate recent items.
 */
export async function addSearchHistory(query) {
  const words = String(query || "")
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, "").trim())
    .filter((w) => w.length >= 2);
  // Unique within this query, keep first-seen order
  const seen = new Set();
  const unique = [];
  for (const w of words) {
    const key = w.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(w);
  }
  if (!unique.length) return getSearchHistory();

  await hydrate();
  // Prepend last→first so the first word ends up at the top (suggestion 1)
  for (let i = unique.length - 1; i >= 0; i -= 1) {
    const w = unique[i];
    const key = w.toLowerCase();
    cache = [w, ...cache.filter((x) => x.toLowerCase() !== key)];
  }
  cache = cache.slice(0, MAX_ITEMS);
  await persist();
  notify();
  return [...cache];
}

export async function removeSearchHistory(query) {
  const q = String(query || "").trim().toLowerCase();
  await hydrate();
  cache = cache.filter((x) => x.toLowerCase() !== q);
  await persist();
  notify();
  return [...cache];
}

export async function clearSearchHistory() {
  await hydrate();
  cache = [];
  await persist();
  notify();
  return [];
}
