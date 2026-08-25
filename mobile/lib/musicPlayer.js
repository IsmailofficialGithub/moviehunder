/**
 * Music queue player — background playback, shuffle, volume, likes.
 * Lock-screen / Android playback service only works in a native build
 * (not Expo Go) — those calls are skipped there to avoid redbox spam.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import {
  addToLikedSongs,
  removeFromLikedSongs,
} from "./localPlaylists";
import { getLocalMusicUri } from "./musicDownloads";
import {
  createAudioPlayer,
  setAudioModeAsync,
} from "expo-audio";

/** @typedef {{ id: string, name?: string, artist?: string, album?: string, image?: string|null, preview_url?: string|null, stream_url?: string|null, external_url?: string|null, duration_ms?: number }} Track */

const LIKES_KEY = "flick.music.likes.v1";

/** Expo Go cannot bind the expo-audio foreground/lock-screen service. */
const IS_EXPO_GO =
  Constants.appOwnership === "expo" ||
  Constants.executionEnvironment === "storeClient";

/** @type {ReturnType<typeof createAudioPlayer> | null} */
let player = null;
/** @type {Track[]} */
let queue = [];
/** @type {Track[]} */
let originalQueue = [];
let index = -1;
let playing = false;
let shuffle = false;
let repeatMode = "off"; // off | one | all
let volume = 1;
/** @type {Set<string>} */
let likedIds = new Set();
let likesReady = false;
let finishSub = null;
let statusTimer = null;
let position = 0;
let duration = 0;

const listeners = new Set();

function snapshot() {
  const track = index >= 0 ? queue[index] : null;
  return {
    queue,
    index,
    track,
    playing,
    shuffle,
    repeatMode,
    volume,
    position,
    duration,
    liked: track ? likedIds.has(track.id) : false,
    hasPrev: queue.length > 1 || index > 0,
    hasNext: queue.length > 1 || index < queue.length - 1,
  };
}

function emit() {
  const state = snapshot();
  listeners.forEach((fn) => {
    try {
      fn(state);
    } catch {
      /* ignore */
    }
  });
}

async function ensureLikes() {
  if (likesReady) return;
  try {
    const raw = await AsyncStorage.getItem(LIKES_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    likedIds = new Set(Array.isArray(arr) ? arr : []);
  } catch {
    likedIds = new Set();
  }
  likesReady = true;
}

async function persistLikes() {
  await AsyncStorage.setItem(LIKES_KEY, JSON.stringify([...likedIds]));
}

export function subscribeMusicPlayer(fn) {
  listeners.add(fn);
  ensureLikes().then(() => fn(snapshot()));
  return () => listeners.delete(fn);
}

export function getMusicState() {
  return snapshot();
}

function clearFinishSub() {
  if (finishSub) {
    try {
      finishSub.remove?.();
    } catch {
      /* ignore */
    }
  }
  finishSub = null;
}

function stopStatusTimer() {
  if (statusTimer) {
    clearInterval(statusTimer);
    statusTimer = null;
  }
}

function startStatusTimer() {
  stopStatusTimer();
  statusTimer = setInterval(() => {
    if (!player) return;
    try {
      position = Number(player.currentTime) || 0;
      duration = Number(player.duration) || 0;
      const isPlaying = Boolean(player.playing);
      if (isPlaying !== playing) playing = isPlaying;
      emit();
    } catch {
      /* ignore */
    }
  }, 500);
}

function releasePlayer() {
  clearFinishSub();
  stopStatusTimer();
  if (player) {
    if (!IS_EXPO_GO) {
      try {
        player.setActiveForLockScreen?.(false);
      } catch {
        /* ignore */
      }
    }
    try {
      player.pause();
    } catch {
      /* ignore */
    }
    try {
      player.volume = 0;
    } catch {
      /* ignore */
    }
    try {
      player.remove?.();
    } catch {
      try {
        player.release?.();
      } catch {
        /* ignore */
      }
    }
    player = null;
  }
  playing = false;
  position = 0;
  duration = 0;
}

/** Stop current audio hard before starting another track. */
async function stopPreviousTrack() {
  if (!player) return;
  try {
    player.pause();
  } catch {
    /* ignore */
  }
  releasePlayer();
  emit();
}

function shuffleArray(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function applyLockScreen(track) {
  // Native foreground service / lock screen is not available in Expo Go.
  if (IS_EXPO_GO || !player || !track) return;
  try {
    player.setActiveForLockScreen(
      true,
      {
        title: track.name || "Unknown",
        artist: track.artist || "Unknown artist",
        albumTitle: track.album || "",
        artworkUrl: track.image || undefined,
      },
      {
        showSeekBar: true,
        showSkipToNext: true,
        showSkipToPrevious: true,
      }
    );
  } catch {
    /* ignore */
  }
}

async function configureAudioSession() {
  try {
    // Screen-off / background needs a native build (expo run:android / EAS).
    // Expo Go ignores the Android media foreground service.
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: "doNotMix",
      allowsRecording: false,
    });
  } catch {
    try {
      await setAudioModeAsync({
        playsInSilentMode: true,
        shouldPlayInBackground: true,
      });
    } catch {
      /* ignore */
    }
  }
}

async function loadAndPlay(track) {
  await ensureLikes();
  // Always kill previous song first so only one stream runs.
  await stopPreviousTrack();

  const localUri = track?.id ? await getLocalMusicUri(track.id) : null;
  const uri = localUri || track?.stream_url || track?.preview_url;
  if (!uri) {
    playing = false;
    emit();
    return { ok: false, error: "No stream URL for this track." };
  }

  await configureAudioSession();

  try {
    player = createAudioPlayer({ uri }, { keepAudioSessionActive: true });
    player.volume = volume;
    if (typeof player.addListener === "function") {
      finishSub = player.addListener("playbackStatusUpdate", (status) => {
        if (status?.didJustFinish || status?.playbackState === "ended") {
          onTrackEnded().catch(() => {});
        }
      });
    }
    applyLockScreen(track);
    player.play();
    playing = true;
    startStatusTimer();
    setTimeout(() => {
      try {
        if (player && !player.playing) {
          player.play();
          playing = true;
          emit();
        }
      } catch {
        /* ignore */
      }
    }, 250);
    emit();
    return { ok: true };
  } catch (err) {
    playing = false;
    emit();
    return { ok: false, error: err?.message || "Playback failed" };
  }
}

async function onTrackEnded() {
  if (repeatMode === "one") {
    if (player) {
      try {
        await player.seekTo(0);
        player.play();
        playing = true;
        emit();
        return;
      } catch {
        /* fall through */
      }
    }
    if (queue[index]) return loadAndPlay(queue[index]);
  }
  if (index < queue.length - 1) {
    index += 1;
    return loadAndPlay(queue[index]);
  }
  if (repeatMode === "all" && queue.length) {
    index = 0;
    return loadAndPlay(queue[index]);
  }
  playing = false;
  emit();
}

export async function setQueueAndPlay(tracks, startIndex = 0) {
  const list = Array.isArray(tracks) ? tracks.filter((t) => t?.id) : [];
  originalQueue = [...list];
  if (shuffle && list.length > 1) {
    const startTrack = list[Math.min(Math.max(startIndex, 0), list.length - 1)];
    const rest = list.filter((t) => t.id !== startTrack.id);
    queue = [startTrack, ...shuffleArray(rest)];
    index = 0;
  } else {
    queue = list;
    index = Math.min(Math.max(startIndex, 0), Math.max(queue.length - 1, 0));
  }
  if (!queue.length) {
    releasePlayer();
    playing = false;
    index = -1;
    emit();
    return { ok: false, error: "Empty queue" };
  }
  return loadAndPlay(queue[index]);
}

export async function playTrack(track, list = null) {
  if (Array.isArray(list) && list.length) {
    const i = list.findIndex((t) => t.id === track.id);
    return setQueueAndPlay(list, i >= 0 ? i : 0);
  }
  return setQueueAndPlay([track], 0);
}

export async function togglePlayPause() {
  if (!player) {
    if (queue[index]) return loadAndPlay(queue[index]);
    return { ok: false };
  }
  try {
    if (player.playing) {
      player.pause();
      playing = false;
    } else {
      await configureAudioSession();
      player.play();
      playing = true;
    }
    emit();
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function playNext() {
  if (!queue.length) return { ok: false };
  if (index < queue.length - 1) {
    index += 1;
  } else if (repeatMode === "all") {
    index = 0;
  } else {
    return { ok: false };
  }
  return loadAndPlay(queue[index]);
}

export async function playPrev() {
  if (!queue.length) return { ok: false };
  if (position > 3) {
    try {
      await player?.seekTo?.(0);
      position = 0;
      emit();
      return { ok: true };
    } catch {
      /* ignore */
    }
  }
  if (index > 0) {
    index -= 1;
    return loadAndPlay(queue[index]);
  }
  if (repeatMode === "all") {
    index = queue.length - 1;
    return loadAndPlay(queue[index]);
  }
  try {
    await player?.seekTo?.(0);
    player?.play?.();
    playing = true;
    emit();
  } catch {
    /* ignore */
  }
  return { ok: true };
}

export async function seekTo(seconds) {
  if (!player) return { ok: false };
  try {
    await player.seekTo(Math.max(0, Number(seconds) || 0));
    position = Number(seconds) || 0;
    emit();
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export function setVolume(v) {
  volume = Math.min(1, Math.max(0, Number(v) || 0));
  if (player) {
    try {
      player.volume = volume;
    } catch {
      /* ignore */
    }
  }
  emit();
  return volume;
}

export function bumpVolume(delta = 0.1) {
  return setVolume(volume + Number(delta) || 0);
}

export function toggleShuffle() {
  shuffle = !shuffle;
  if (!queue.length) {
    emit();
    return shuffle;
  }
  const current = queue[index];
  if (shuffle) {
    if (!originalQueue.length) originalQueue = [...queue];
    const rest = originalQueue.filter((t) => t.id !== current?.id);
    queue = current ? [current, ...shuffleArray(rest)] : shuffleArray(originalQueue);
    index = 0;
  } else {
    queue = originalQueue.length ? [...originalQueue] : [...queue];
    index = current ? Math.max(0, queue.findIndex((t) => t.id === current.id)) : 0;
  }
  emit();
  return shuffle;
}

export function cycleRepeat() {
  repeatMode = repeatMode === "off" ? "all" : repeatMode === "all" ? "one" : "off";
  emit();
  return repeatMode;
}

export async function toggleLike() {
  await ensureLikes();
  const track = queue[index];
  if (!track?.id) return false;

  if (likedIds.has(track.id)) {
    likedIds.delete(track.id);
    await removeFromLikedSongs(track.id).catch(() => {});
  } else {
    likedIds.add(track.id);
    await addToLikedSongs(track).catch(() => {});
  }
  await persistLikes();
  emit();
  return likedIds.has(track.id);
}

export async function getLikedIds() {
  await ensureLikes();
  return [...likedIds];
}

export async function stopMusic() {
  releasePlayer();
  playing = false;
  index = -1;
  position = 0;
  duration = 0;
  emit();
}
