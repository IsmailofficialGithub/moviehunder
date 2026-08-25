import { getApiBase, apiClientHeaders } from "./config";

async function api(path) {
  const url = `${getApiBase()}${path.startsWith("/") ? path : `/${path}`}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: apiClientHeaders({ Accept: "application/json" }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || data.hint || `Request failed (${res.status})`);
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

/** Search free Audius catalog (full tracks). Empty q → trending. */
export async function searchMusic(q, { limit = 20 } = {}) {
  const query = String(q || "").trim();
  const path = query
    ? `/api/music/search?q=${encodeURIComponent(query)}&limit=${limit}`
    : `/api/music/trending?limit=${limit}`;
  const data = await api(path);
  return {
    tracks: data.tracks || [],
    playlists: data.playlists || [],
  };
}

/** Autocomplete song titles + artist names while typing. */
export async function suggestMusic(q, { limit = 8 } = {}) {
  const query = String(q || "").trim();
  if (!query) return { suggestions: [] };
  const data = await api(
    `/api/music/suggest?q=${encodeURIComponent(query)}&limit=${limit}`
  );
  return { suggestions: data.suggestions || [] };
}

export async function fetchMusicPlaylistTracks(playlistId) {
  const data = await api(
    `/api/music/playlist/${encodeURIComponent(playlistId)}/tracks?limit=50`
  );
  return data.tracks || [];
}
