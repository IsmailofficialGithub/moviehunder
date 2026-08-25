/**
 * Spotify Web API — Client Credentials (search / metadata only).
 * Set SPOTIFY_CLIENT_ID + SPOTIFY_CLIENT_SECRET in .dev.vars / .env
 */

let cachedToken = null;
let tokenExpiresAt = 0;

function configured(env) {
  return Boolean(
    String(env?.SPOTIFY_CLIENT_ID || "").trim() &&
      String(env?.SPOTIFY_CLIENT_SECRET || "").trim()
  );
}

async function getAccessToken(env) {
  if (!configured(env)) {
    throw new Error(
      "Spotify not configured — set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET"
    );
  }
  if (cachedToken && Date.now() < tokenExpiresAt - 30_000) {
    return cachedToken;
  }

  const id = String(env.SPOTIFY_CLIENT_ID).trim();
  const secret = String(env.SPOTIFY_CLIENT_SECRET).trim();
  const basic = btoa(`${id}:${secret}`);

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(
      data.error_description || data.error || `Spotify auth failed (${res.status})`
    );
  }

  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + (Number(data.expires_in) || 3600) * 1000;
  return cachedToken;
}

function mapTrack(t) {
  if (!t?.id) return null;
  return {
    id: t.id,
    uri: t.uri,
    name: t.name,
    artists: (t.artists || []).map((a) => a.name).filter(Boolean),
    artist: (t.artists || []).map((a) => a.name).filter(Boolean).join(", "),
    album: t.album?.name || "",
    image: t.album?.images?.[1]?.url || t.album?.images?.[0]?.url || null,
    duration_ms: t.duration_ms || 0,
    preview_url: t.preview_url || null,
    external_url: t.external_urls?.spotify || null,
  };
}

function mapPlaylist(p) {
  if (!p?.id) return null;
  return {
    id: p.id,
    uri: p.uri,
    name: p.name,
    description: p.description || "",
    image: p.images?.[0]?.url || null,
    owner: p.owner?.display_name || "",
    tracks_total: p.tracks?.total ?? 0,
    external_url: p.external_urls?.spotify || null,
  };
}

export async function spotifySearch(env, { q, type = "track", limit = 20 } = {}) {
  const query = String(q || "").trim();
  if (!query) return { tracks: [], playlists: [] };

  const token = await getAccessToken(env);
  const types = String(type || "track")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const safeTypes = types.length ? types : ["track"];
  const lim = Math.min(Math.max(Number(limit) || 20, 1), 50);

  const url = new URL("https://api.spotify.com/v1/search");
  url.searchParams.set("q", query);
  url.searchParams.set("type", safeTypes.join(","));
  url.searchParams.set("limit", String(lim));

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error?.message || `Spotify search failed (${res.status})`);
  }

  return {
    tracks: (data.tracks?.items || []).map(mapTrack).filter(Boolean),
    playlists: (data.playlists?.items || []).map(mapPlaylist).filter(Boolean),
  };
}

export async function spotifyPlaylistTracks(env, playlistId, { limit = 50 } = {}) {
  const id = String(playlistId || "").trim();
  if (!id) throw new Error("playlist_id required");

  const token = await getAccessToken(env);
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const url = `https://api.spotify.com/v1/playlists/${encodeURIComponent(id)}/tracks?limit=${lim}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      data.error?.message || `Spotify playlist tracks failed (${res.status})`
    );
  }

  const tracks = (data.items || [])
    .map((row) => mapTrack(row.track))
    .filter(Boolean);

  return { tracks, total: data.total ?? tracks.length };
}

export { configured as spotifyConfigured };
