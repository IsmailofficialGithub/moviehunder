/**
 * Audius — free open music catalog (full track streams, no paid key).
 * Hosts / app name come from env: AUDIUS_API_BASE, AUDIUS_APP_NAME, AUDIUS_WEB_BASE
 */
import { cfg } from "./config.js";

function audiusApiBase() {
  const base = cfg().AUDIUS_API_BASE;
  if (!base) throw new Error("AUDIUS_API_BASE is not set in .env / .dev.vars");
  return base;
}

function audiusAppName() {
  const name = cfg().AUDIUS_APP_NAME;
  if (!name) throw new Error("AUDIUS_APP_NAME is not set in .env / .dev.vars");
  return name;
}

function audiusWebBase() {
  return cfg().AUDIUS_WEB_BASE || "";
}

function streamUrlFor(id) {
  return `${audiusApiBase()}/tracks/${encodeURIComponent(id)}/stream?app_name=${encodeURIComponent(audiusAppName())}`;
}

function permalinkUrl(permalink) {
  if (!permalink) return null;
  const web = audiusWebBase();
  if (!web) return null;
  const path = permalink.startsWith("/") ? permalink : `/${permalink}`;
  return `${web}${path}`;
}

function mapTrack(t) {
  if (!t?.id) return null;
  const id = String(t.id);
  const art =
    t.artwork?.["480x480"] ||
    t.artwork?.["150x150"] ||
    t.artwork?.["1000x1000"] ||
    null;
  const streamUrl = streamUrlFor(id);
  return {
    id,
    uri: `audius:track:${id}`,
    name: t.title || "Untitled",
    artists: t.user?.name ? [t.user.name] : [],
    artist: t.user?.name || "",
    album: t.mood || t.genre || "",
    image: art,
    duration_ms: Math.round((Number(t.duration) || 0) * 1000),
    /** Full streamable URL (not a 30s preview). */
    preview_url: streamUrl,
    stream_url: streamUrl,
    external_url: permalinkUrl(t.permalink),
    source: "audius",
  };
}

function mapPlaylist(p) {
  if (!p?.id) return null;
  const art =
    p.artwork?.["480x480"] ||
    p.artwork?.["150x150"] ||
    null;
  return {
    id: String(p.id),
    name: p.playlist_name || p.name || "Playlist",
    description: p.description || "",
    image: art,
    owner: p.user?.name || "",
    tracks_total: p.track_count ?? p.total_track_count ?? 0,
    external_url: permalinkUrl(p.permalink),
    source: "audius",
  };
}

async function audiusGet(path) {
  const BASE = audiusApiBase();
  const APP_NAME = audiusAppName();
  const url = path.startsWith("http")
    ? path
    : `${BASE}${path.includes("?") ? `${path}&` : `${path}?`}app_name=${encodeURIComponent(APP_NAME)}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || data.message || `Audius ${res.status}`);
  }
  return data;
}

export async function musicSearch({ q, limit = 20 } = {}) {
  const query = String(q || "").trim();
  if (!query) {
    const trending = await audiusGet(`/tracks/trending?limit=${Math.min(limit, 20)}`);
    return {
      tracks: (trending.data || []).map(mapTrack).filter(Boolean),
      playlists: [],
    };
  }

  const lim = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const [tracksRes, playlistsRes] = await Promise.all([
    audiusGet(`/tracks/search?query=${encodeURIComponent(query)}&limit=${lim}`),
    audiusGet(`/playlists/search?query=${encodeURIComponent(query)}&limit=${lim}`).catch(
      () => ({ data: [] })
    ),
  ]);

  return {
    tracks: (tracksRes.data || []).map(mapTrack).filter(Boolean),
    playlists: (playlistsRes.data || []).map(mapPlaylist).filter(Boolean),
  };
}

export async function musicPlaylistTracks(playlistId, { limit = 50 } = {}) {
  const id = String(playlistId || "").trim();
  if (!id) throw new Error("playlist_id required");
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const data = await audiusGet(
    `/playlists/${encodeURIComponent(id)}/tracks?limit=${lim}`
  );
  const tracks = (data.data || []).map(mapTrack).filter(Boolean);
  return { tracks, total: tracks.length };
}

export async function musicTrending({ limit = 20 } = {}) {
  const lim = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const data = await audiusGet(`/tracks/trending?limit=${lim}`);
  return {
    tracks: (data.data || []).map(mapTrack).filter(Boolean),
  };
}

/**
 * Autocomplete: song titles + artist/singer names.
 * @returns {{ suggestions: Array<{ id: string, type: 'track'|'artist', label: string, subtitle?: string, query: string }> }}
 */
export async function musicSuggest({ q, limit = 8 } = {}) {
  const query = String(q || "").trim();
  if (query.length < 1) return { suggestions: [] };

  const lim = Math.min(Math.max(Number(limit) || 8, 1), 12);
  const [tracksRes, usersRes] = await Promise.all([
    audiusGet(
      `/tracks/search?query=${encodeURIComponent(query)}&limit=${lim}`
    ).catch(() => ({ data: [] })),
    audiusGet(
      `/users/search?query=${encodeURIComponent(query)}&limit=${Math.min(lim, 6)}`
    ).catch(() => ({ data: [] })),
  ]);

  const seen = new Set();
  const suggestions = [];

  for (const t of tracksRes.data || []) {
    const name = String(t.title || "").trim();
    if (!name) continue;
    const artist = String(t.user?.name || "").trim();
    const key = `track:${name.toLowerCase()}|${artist.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    suggestions.push({
      id: key,
      type: "track",
      label: name,
      subtitle: artist || undefined,
      query: artist ? `${name} ${artist}` : name,
    });
    if (suggestions.length >= lim) break;
  }

  for (const u of usersRes.data || []) {
    const name = String(u.name || u.handle || "").trim();
    if (!name) continue;
    const key = `artist:${name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    suggestions.push({
      id: key,
      type: "artist",
      label: name,
      subtitle: "Artist",
      query: name,
    });
    if (suggestions.filter((s) => s.type === "artist").length >= 4) break;
  }

  // Also surface unique artists from tracks if user search was empty
  if (!suggestions.some((s) => s.type === "artist")) {
    for (const t of tracksRes.data || []) {
      const artist = String(t.user?.name || "").trim();
      if (!artist) continue;
      const key = `artist:${artist.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      suggestions.push({
        id: key,
        type: "artist",
        label: artist,
        subtitle: "Artist",
        query: artist,
      });
      if (suggestions.filter((s) => s.type === "artist").length >= 4) break;
    }
  }

  return { suggestions: suggestions.slice(0, lim + 4) };
}
