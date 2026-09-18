import { getApiBase, apiClientHeaders } from "./config";

async function api(path, { signal, next, cache } = {}) {
  const base = getApiBase();
  const options = {
    signal,
    headers: apiClientHeaders(),
  };
  if (next) options.next = next;
  if (cache) options.cache = cache;

  const res = await fetch(`${base}${path.startsWith("/") ? path : `/${path}`}`, options);
  const contentType = res.headers.get("content-type") || "";
  if (!res.ok) {
    if (contentType.includes("application/json")) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Request failed (${res.status})`);
    }
    throw new Error(`Request failed (${res.status})`);
  }
  return res.json();
}

// Enable 300-second (5 min) revalidation for catalog endpoints
export function getHome() {
  return api("/home", { next: { revalidate: 300 } });
}

export function getMovies() {
  return api("/movies", { next: { revalidate: 300 } });
}

export function getTvSeries() {
  return api("/tv-series", { next: { revalidate: 300 } });
}

export function getAnimation() {
  return api("/animation", { next: { revalidate: 300 } });
}

export function getRanking() {
  return api("/ranking", { next: { revalidate: 300 } });
}

export function searchTitles(q) {
  return api(`/search?q=${encodeURIComponent(q)}`);
}

export function searchSuggest(q, { signal } = {}) {
  return api(`/search/suggest?q=${encodeURIComponent(q)}`, { signal });
}

export function getDetail(slug) {
  return api(`/detail/${encodeURIComponent(slug)}`);
}

export function getEpisodes(slug) {
  return api(`/episodes/${encodeURIComponent(slug)}`);
}

/** Free Audius catalog via backend */
export function searchMusic(q, { limit = 24 } = {}) {
  const query = String(q || "").trim();
  const path = query
    ? `/api/music/search?q=${encodeURIComponent(query)}&limit=${limit}`
    : `/api/music/trending?limit=${limit}`;
  return api(path);
}

export function suggestMusic(q, { limit = 8 } = {}) {
  const query = String(q || "").trim();
  if (!query) return Promise.resolve({ suggestions: [] });
  return api(
    `/api/music/suggest?q=${encodeURIComponent(query)}&limit=${limit}`
  );
}
