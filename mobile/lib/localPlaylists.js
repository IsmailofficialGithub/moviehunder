import AsyncStorage from "@react-native-async-storage/async-storage";

const STORE_KEY = "flick.local.playlists.v1";

/** @type {Set<(list: any[]) => void>} */
const listeners = new Set();

function uid() {
  return `pl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

async function readAll() {
  try {
    const raw = await AsyncStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function writeAll(list) {
  await AsyncStorage.setItem(STORE_KEY, JSON.stringify(list));
  const sorted = [...list].sort(
    (a, b) => (b.updated_at || 0) - (a.updated_at || 0)
  );
  for (const fn of listeners) {
    try {
      fn(sorted);
    } catch {
      /* ignore */
    }
  }
}

/** Live updates when playlists change (add/remove/like). */
export function subscribePlaylists(fn) {
  listeners.add(fn);
  listPlaylists().then(fn).catch(() => fn([]));
  return () => listeners.delete(fn);
}

export async function listPlaylists() {
  const list = await readAll();
  return list.sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0));
}

export async function getPlaylist(id) {
  const list = await readAll();
  return list.find((p) => p.id === id) || null;
}

export async function createPlaylist(name, { system = null, fixedId = null } = {}) {
  const title = String(name || "").trim() || "My Playlist";
  const list = await readAll();
  const now = Date.now();
  const playlist = {
    id: fixedId || uid(),
    name: title,
    tracks: [],
    created_at: now,
    updated_at: now,
    ...(system ? { system } : {}),
  };
  list.unshift(playlist);
  await writeAll(list);
  return playlist;
}

const LIKED_ID = "pl_liked_songs";

/** Always-available Liked Songs playlist (local). */
export async function ensureLikedPlaylist() {
  const list = await readAll();
  const existing =
    list.find((p) => p.id === LIKED_ID || p.system === "liked") || null;
  if (existing) {
    if (existing.id !== LIKED_ID || existing.system !== "liked") {
      const idx = list.findIndex((p) => p.id === existing.id);
      list[idx] = {
        ...existing,
        id: LIKED_ID,
        name: "Liked Songs",
        system: "liked",
      };
      await writeAll(list);
      return list[idx];
    }
    return existing;
  }
  return createPlaylist("Liked Songs", {
    system: "liked",
    fixedId: LIKED_ID,
  });
}

export async function addToLikedSongs(track) {
  const pl = await ensureLikedPlaylist();
  return addTrackToPlaylist(pl.id, track);
}

export async function removeFromLikedSongs(trackId) {
  const pl = await ensureLikedPlaylist();
  return removeTrackFromPlaylist(pl.id, trackId);
}

export async function renamePlaylist(id, name) {
  const list = await readAll();
  const idx = list.findIndex((p) => p.id === id);
  if (idx < 0) return null;
  list[idx] = {
    ...list[idx],
    name: String(name || "").trim() || list[idx].name,
    updated_at: Date.now(),
  };
  await writeAll(list);
  return list[idx];
}

export async function deletePlaylist(id) {
  if (id === LIKED_ID) return readAll(); // keep Liked Songs
  const list = await readAll();
  const next = list.filter((p) => p.id !== id && p.system !== "liked");
  await writeAll(next);
  return next;
}

export async function addTrackToPlaylist(playlistId, track) {
  if (!track?.id) return null;
  const list = await readAll();
  const idx = list.findIndex((p) => p.id === playlistId);
  if (idx < 0) return null;
  const tracks = list[idx].tracks || [];
  if (tracks.some((t) => t.id === track.id)) {
    return list[idx];
  }
  list[idx] = {
    ...list[idx],
    tracks: [
      ...tracks,
      {
        id: track.id,
        uri: track.uri,
        name: track.name,
        artist: track.artist || "",
        album: track.album || "",
        image: track.image || null,
        preview_url: track.preview_url || track.stream_url || null,
        stream_url: track.stream_url || track.preview_url || null,
        external_url: track.external_url || null,
        duration_ms: track.duration_ms || 0,
      },
    ],
    updated_at: Date.now(),
  };
  await writeAll(list);
  return list[idx];
}

export async function removeTrackFromPlaylist(playlistId, trackId) {
  const list = await readAll();
  const idx = list.findIndex((p) => p.id === playlistId);
  if (idx < 0) return null;
  list[idx] = {
    ...list[idx],
    tracks: (list[idx].tracks || []).filter((t) => t.id !== trackId),
    updated_at: Date.now(),
  };
  await writeAll(list);
  return list[idx];
}

export async function searchLocalPlaylists(query) {
  const q = String(query || "").trim().toLowerCase();
  const list = await listPlaylists();
  if (!q) return list;
  return list.filter((p) => {
    if (p.name?.toLowerCase().includes(q)) return true;
    return (p.tracks || []).some(
      (t) =>
        t.name?.toLowerCase().includes(q) ||
        t.artist?.toLowerCase().includes(q)
    );
  });
}
