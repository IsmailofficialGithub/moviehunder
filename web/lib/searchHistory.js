const STORAGE_KEY = "offstream_recent_searches";
const MAX_HISTORY = 10;

function getStore(customStorage) {
  if (customStorage) return customStorage;
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }
  return null;
}

export function getSearchHistory(customStorage) {
  const store = getStore(customStorage);
  if (!store) return [];
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((item) => typeof item === "string" && item.trim().length > 0);
    }
    return [];
  } catch {
    return [];
  }
}

export function saveSearchHistory(query, customStorage) {
  const clean = String(query || "").trim();
  const current = getSearchHistory(customStorage);
  if (!clean) return current;

  // Don't save internal bypass code verbatim to history, or strip it
  const displayTerm = clean.replace(/^@open788269\s*/i, "").trim();
  if (!displayTerm) return current;

  const filtered = current.filter(
    (item) => item.toLowerCase() !== displayTerm.toLowerCase()
  );
  const updated = [displayTerm, ...filtered].slice(0, MAX_HISTORY);

  const store = getStore(customStorage);
  if (store) {
    try {
      store.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // Ignore quota/private mode errors
    }
  }

  return updated;
}

export function removeSearchHistory(query, customStorage) {
  const target = String(query || "").trim().toLowerCase();
  const current = getSearchHistory(customStorage);
  const updated = current.filter((item) => item.toLowerCase() !== target);

  const store = getStore(customStorage);
  if (store) {
    try {
      store.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // Ignore quota errors
    }
  }

  return updated;
}

export function filterSearchHistory(history, query) {
  if (!Array.isArray(history)) return [];
  const q = String(query || "").trim().toLowerCase();
  if (!q) return history;

  const startsWith = [];
  const contains = [];

  for (const item of history) {
    const lower = item.toLowerCase();
    if (lower === q) continue; // exact match doesn't need to duplicate
    if (lower.startsWith(q)) {
      startsWith.push(item);
    } else if (lower.includes(q)) {
      contains.push(item);
    }
  }

  return [...startsWith, ...contains];
}
