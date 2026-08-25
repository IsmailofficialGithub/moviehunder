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

/** Push a query to the top of history (deduped). */
export async function addSearchHistory(query) {
  const q = String(query || "").trim();
  if (q.length < 2) return getSearchHistory();
  await hydrate();
  cache = [q, ...cache.filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(
    0,
    MAX_ITEMS
  );
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
