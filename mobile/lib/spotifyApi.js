import { getApiBase } from "./config";

async function api(path) {
  const url = `${getApiBase()}${path.startsWith("/") ? path : `/${path}`}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
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

/** Search Spotify tracks and/or playlists via backend. */
export async function searchSpotify(q, { type = "track,playlist", limit = 20 } = {}) {
  const query = String(q || "").trim();
  if (!query) return { tracks: [], playlists: [] };
  const path = `/api/spotify/search?q=${encodeURIComponent(query)}&type=${encodeURIComponent(type)}&limit=${limit}`;
  const data = await api(path);
  return {
    tracks: data.tracks || [],
    playlists: data.playlists || [],
  };
}

export async function fetchSpotifyPlaylistTracks(playlistId) {
  const data = await api(
    `/api/spotify/playlist/${encodeURIComponent(playlistId)}/tracks?limit=50`
  );
  return data.tracks || [];
}
