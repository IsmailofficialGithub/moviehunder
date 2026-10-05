// In-memory LRU-like set of loaded image URLs to eliminate re-render delays
const memoryCache = new Set();

export function isImageCached(src) {
  if (!src || typeof window === "undefined") return false;
  return memoryCache.has(src);
}

export function markImageCached(src) {
  if (!src || typeof window === "undefined") return;
  memoryCache.add(src);
  // Cap memory cache size to prevent memory bloat
  if (memoryCache.size > 500) {
    const first = memoryCache.values().next().value;
    memoryCache.delete(first);
  }
}

// Preload an image URL into browser cache
export function preloadImage(src) {
  if (!src || typeof window === "undefined" || memoryCache.has(src)) return;
  const img = new Image();
  img.decoding = "async";
  img.onload = () => markImageCached(src);
  img.src = src;
}
