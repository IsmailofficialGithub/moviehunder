import { getApiBase, apiClientHeaders } from "./config";
import { toUserMessage } from "./userFacingError";

const DEFAULT_TIMEOUT_MS = 12000;

async function api(path, { signal, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const base = getApiBase();
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", onAbort, { once: true });
  }
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: apiClientHeaders(),
    });
    const contentType = res.headers.get("content-type") || "";
    if (!res.ok) {
      if (contentType.includes("application/json")) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          toUserMessage(body.error || body.reason, "Request failed. Please try again.")
        );
      }
      throw new Error("Request failed. Please try again.");
    }
    return res.json();
  } catch (err) {
    throw new Error(
      toUserMessage(err, "Couldn't reach MovieHunter. Check your connection.")
    );
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", onAbort);
  }
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

export function searchSuggest(q) {
  return api(`/search/suggest?q=${encodeURIComponent(q)}`, {
    timeoutMs: 8000,
  });
}

export function getDetail(slug) {
  return api(`/detail/${encodeURIComponent(slug)}`);
}

export function getEpisodes(slug) {
  return api(`/episodes/${encodeURIComponent(slug)}`);
}
