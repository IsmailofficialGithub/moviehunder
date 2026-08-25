/**
 * Sticky notification for now-playing (notification shade).
 * Actions: Pause / Resume / Stop
 *
 * Android push/local notification APIs were removed from Expo Go in SDK 53+ —
 * this only runs in a development/production build.
 */
import Constants from "expo-constants";
import { Platform } from "react-native";
import {
  getMusicState,
  stopMusic,
  subscribeMusicPlayer,
  togglePlayPause,
} from "./musicPlayer";

const CHANNEL = "moviehunter-music";
const NOTIF_ID = "moviehunter-now-playing";
const CATEGORY = "music_playback";

const IS_EXPO_GO =
  Constants.appOwnership === "expo" ||
  Constants.executionEnvironment === "storeClient";

let Notifications = null;
let ready = false;
let lastKey = "";
let responseSub = null;
let stateSub = null;

function loadNotifications() {
  if (IS_EXPO_GO) return null;
  if (Notifications) return Notifications;
  try {
    // eslint-disable-next-line global-require
    Notifications = require("expo-notifications");
  } catch {
    Notifications = null;
  }
  return Notifications;
}

export async function setupMusicNotifications() {
  if (ready || IS_EXPO_GO) return;
  const N = loadNotifications();
  if (!N) return;

  try {
    N.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: false,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });

    const perm = await N.getPermissionsAsync();
    if (perm.status !== "granted") {
      await N.requestPermissionsAsync();
    }

    if (Platform.OS === "android") {
      await N.setNotificationChannelAsync(CHANNEL, {
        name: "Music",
        importance: N.AndroidImportance.DEFAULT,
        sound: null,
        vibrationPattern: [0],
        enableVibrate: false,
        showBadge: false,
        lockscreenVisibility: N.AndroidNotificationVisibility.PUBLIC,
      });
    }

    await N.setNotificationCategoryAsync(CATEGORY, [
      {
        identifier: "music_toggle",
        buttonTitle: "Play / Pause",
        options: { opensAppToForeground: false },
      },
      {
        identifier: "music_stop",
        buttonTitle: "Stop",
        options: { opensAppToForeground: false, isDestructive: true },
      },
    ]);

    if (!responseSub) {
      responseSub = N.addNotificationResponseReceivedListener((response) => {
        const action = response.actionIdentifier;
        if (
          action === "music_toggle" ||
          action === N.DEFAULT_ACTION_IDENTIFIER
        ) {
          togglePlayPause().catch(() => {});
        } else if (action === "music_stop") {
          stopMusic().catch(() => {});
        }
      });
    }

    if (!stateSub) {
      stateSub = subscribeMusicPlayer((state) => {
        syncMusicNotification(state).catch(() => {});
      });
    }

    ready = true;
  } catch {
    /* Expo Go / permission failures — ignore */
  }
}

export async function clearMusicNotification() {
  lastKey = "";
  const N = loadNotifications();
  if (!N) return;
  try {
    await N.dismissNotificationAsync(NOTIF_ID);
  } catch {
    /* ignore */
  }
  try {
    await N.dismissAllNotificationsAsync();
  } catch {
    /* ignore */
  }
}

export async function syncMusicNotification(state = getMusicState()) {
  await setupMusicNotifications();
  const N = loadNotifications();
  if (!N) return;

  const track = state?.track;
  if (!track) {
    await clearMusicNotification();
    return;
  }

  const key = `${track.id}|${state.playing ? 1 : 0}|${track.name}`;
  if (key === lastKey) return;
  lastKey = key;

  try {
    await N.dismissNotificationAsync(NOTIF_ID).catch(() => {});

    await N.scheduleNotificationAsync({
      identifier: NOTIF_ID,
      content: {
        title: state.playing ? "♪ Playing" : "❚❚ Paused",
        body: `${track.name}${track.artist ? ` — ${track.artist}` : ""}`,
        data: { type: "music", trackId: track.id },
        sticky: true,
        autoDismiss: false,
        categoryIdentifier: CATEGORY,
        sound: null,
        ...(Platform.OS === "android"
          ? {
              channelId: CHANNEL,
              color: "#5a00a2",
              priority: N.AndroidNotificationPriority.DEFAULT,
            }
          : {}),
      },
      trigger: null,
    });
  } catch {
    /* ignore */
  }
}
