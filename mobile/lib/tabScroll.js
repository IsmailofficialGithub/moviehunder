/** In-memory scroll offsets per tab (survives tab switches). */
const offsets = new Map();

export function saveTabScroll(key, y) {
  offsets.set(key, Math.max(0, y));
}

export function getTabScroll(key) {
  return offsets.get(key) || 0;
}
