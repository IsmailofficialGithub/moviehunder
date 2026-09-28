import { getAllWatchProgress, saveWatchProgress } from "./watchProgress";
import { listPlaylists } from "./localPlaylists";
import { getLikedIds } from "./musicPlayer";
import { getDownloads } from "./downloads";
import { getMusicDownloads } from "./musicDownloads";
import { getSession, syncGet, syncPut } from "./auth";
import AsyncStorage from "@react-native-async-storage/async-storage";

const PLAYLISTS_KEY = "flick.local.playlists.v1";
const LIKES_KEY = "flick.music.likes.v1";

let syncTimer = null;

export function scheduleLibrarySync() {
  if (!getSession()?.access_token) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    pushAll().catch(() => {});
  }, 2000);
}

async function pushWatch() {
  const entries = await getAllWatchProgress();
  const items = entries.map((e) => ({
    key: e.key,
    position: e.position,
    duration: e.duration,
    title: e.title,
    subjectId: e.subjectId,
    detailPath: e.detailPath,
    se: e.se,
    ep: e.ep,
    poster: e.poster,
    kind: e.kind,
    completed: e.completed,
    updatedAt: e.updatedAt,
  }));
  if (items.length) await syncPut("/api/sync/watch-progress", items);
}

async function pullWatch() {
  const data = await syncGet("/api/sync/watch-progress");
  for (const item of data.items || []) {
    const local = (await getAllWatchProgress()).find((e) => e.key === item.key);
    const remoteTs = Number(item.updatedAt) || 0;
    const localTs = Number(local?.updatedAt) || 0;
    if (!local || remoteTs > localTs) {
      await saveWatchProgress(item.key, {
        position: item.position,
        duration: item.duration,
        title: item.title,
        subjectId: item.subjectId,
        detailPath: item.detailPath,
        se: item.se,
        ep: item.ep,
        poster: item.poster,
        kind: item.kind,
      });
    }
  }
}

async function pushPlaylists() {
  const items = await listPlaylists();
  if (items.length) await syncPut("/api/sync/playlists", items);
}

async function pullPlaylists() {
  const data = await syncGet("/api/sync/playlists");
  const remote = data.items || [];
  if (!remote.length) return;
  const local = await listPlaylists();
  const byId = new Map(local.map((p) => [p.id, p]));
  for (const pl of remote) {
    const cur = byId.get(pl.id);
    if (!cur || (pl.updated_at || 0) >= (cur.updated_at || 0)) {
      byId.set(pl.id, pl);
    }
  }
  const merged = [...byId.values()];
  await AsyncStorage.setItem(PLAYLISTS_KEY, JSON.stringify(merged));
}

async function pushLikes() {
  const ids = await getLikedIds();
  await syncPut(
    "/api/sync/likes",
    ids.map((id) => ({ trackId: id, updatedAt: Date.now() })),
    { replace: true, ids }
  );
}

async function pullLikes() {
  const data = await syncGet("/api/sync/likes");
  const ids = data.ids || [];
  await AsyncStorage.setItem(LIKES_KEY, JSON.stringify(ids));
}

async function pushDownloads() {
  const video = [
    ...getDownloads({ vault: false }),
    ...getDownloads({ vault: true }),
  ];
  const music = getMusicDownloads() || [];
  const items = [
    ...video.map((d) => ({ ...d, downloadId: d.id, kind: d.kind || "video" })),
    ...music.map((d) => ({
      ...d,
      downloadId: `music:${d.id}`,
      kind: "music",
    })),
  ];
  if (items.length) await syncPut("/api/sync/downloads", items);
}

async function pullDownloads() {
  // Metadata only — do not overwrite local file state; merge catalog hints
  await syncGet("/api/sync/downloads");
}

async function pushAll() {
  if (!getSession()?.access_token) return;
  await Promise.allSettled([
    pushWatch(),
    pushPlaylists(),
    pushLikes(),
    pushDownloads(),
  ]);
}

export async function runFullSync() {
  if (!getSession()?.access_token) return;
  await Promise.allSettled([pullWatch(), pullPlaylists(), pullLikes()]);
  await pushAll();
  await pullDownloads().catch(() => {});
}
