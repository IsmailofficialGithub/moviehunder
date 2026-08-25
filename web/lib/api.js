import { getApiBase, apiClientHeaders } from "./config";

async function api(path, { signal } = {}) {
  const base = getApiBase();
  const res = await fetch(`${base}${path.startsWith("/") ? path : `/${path}`}`, {
    signal,
    cache: "no-store",
    headers: apiClientHeaders(),
  });
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

export function getHome() {
  return api("/home");
}

export function getMovies() {
  return api("/movies");
}

export function getTvSeries() {
  return api("/tv-series");
}

export function getAnimation() {
  return api("/animation");
}

export function getRanking() {
  return api("/ranking");
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
