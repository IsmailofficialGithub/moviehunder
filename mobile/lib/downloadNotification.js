// Sticky notification for ongoing downloads and download completion alerts
import Constants from "expo-constants";
import { Platform } from "react-native";
import { router } from "expo-router";

const CHANNEL = "moviehunter-downloads";
const PROGRESS_NOTIF_ID = "moviehunter-active-download";

const IS_EXPO_GO =
  Constants.appOwnership === "expo" ||
  Constants.executionEnvironment === "storeClient";

let Notifications = null;
let ready = false;
let lastKey = "";
let lastThrottleTime = 0;
let responseSub = null;

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

export async function setupDownloadNotifications() {
  if (ready || IS_EXPO_GO) return;
  const N = loadNotifications();
  if (!N) return;

  try {
    const perm = await N.getPermissionsAsync();
    if (perm.status !== "granted") {
      await N.requestPermissionsAsync();
    }

    if (Platform.OS === "android") {
      await N.setNotificationChannelAsync(CHANNEL, {
        name: "Downloads",
        importance: N.AndroidImportance.LOW,
        sound: null,
        vibrationPattern: [0],
        enableVibrate: false,
        showBadge: false,
        lockscreenVisibility: N.AndroidNotificationVisibility.PUBLIC,
      });
    }

    if (!responseSub) {
      responseSub = N.addNotificationResponseReceivedListener((response) => {
        try {
          const data = response?.notification?.request?.content?.data;
          if (data?.type === "download") {
            router.push("/(tabs)/downloads");
          }
        } catch {
          // ignore navigation errors
        }
      });
    }

    ready = true;
  } catch {
    // Expo Go / permissions failure
  }
}

export async function clearDownloadNotification() {
  lastKey = "";
  const N = loadNotifications();
  if (!N) return;
  try {
    await N.dismissNotificationAsync(PROGRESS_NOTIF_ID);
  } catch {
    // ignore
  }
}

export async function syncDownloadNotification(list = []) {
  await setupDownloadNotifications();
  const N = loadNotifications();
  if (!N) return;

  const active = list.filter((d) => d.status === "downloading");
  if (!active.length) {
    if (lastKey !== "none") {
      lastKey = "none";
      await clearDownloadNotification();
    }
    return;
  }

  // Throttle updates to at most once every 1.5s to preserve CPU & battery
  const now = Date.now();
  if (now - lastThrottleTime < 1500) return;
  lastThrottleTime = now;

  const top = active[0];
  const total = Number(top.totalBytes) || Number(top.sizeHint) || 0;
  const written = Number(top.bytesWritten) || 0;
  const pct = total > 0 ? Math.min(100, Math.round((written / total) * 100)) : 0;
  const speed = top.bytesPerSec ? `${(top.bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s` : "";

  const titleText = active.length > 1
    ? `Downloading (${active.length} active)`
    : `Downloading: ${top.title || "Movie"}`;

  const bodyText = `${pct > 0 ? `${pct}% · ` : ""}${speed ? `${speed} · ` : ""}${top.title}`;
  const key = `${top.id}|${pct}|${active.length}`;
  if (key === lastKey) return;
  lastKey = key;

  try {
    await N.scheduleNotificationAsync({
      identifier: PROGRESS_NOTIF_ID,
      content: {
        title: titleText,
        body: bodyText,
        data: { type: "download", id: top.id },
        sticky: true,
        autoDismiss: false,
        sound: null,
        ...(Platform.OS === "android"
          ? {
              channelId: CHANNEL,
              color: "#f6c443",
              priority: N.AndroidNotificationPriority.LOW,
            }
          : {}),
      },
      trigger: null,
    });
  } catch {
    // ignore
  }
}

export async function notifyDownloadComplete(item) {
  if (IS_EXPO_GO || !item?.title) return;
  const N = loadNotifications();
  if (!N) return;
  try {
    await N.scheduleNotificationAsync({
      content: {
        title: "Download Complete",
        body: `“${item.title}” is ready to watch offline.`,
        data: { type: "download", id: item.id },
        sound: null,
        ...(Platform.OS === "android"
          ? {
              channelId: CHANNEL,
              color: "#4ade80",
              priority: N.AndroidNotificationPriority.DEFAULT,
            }
          : {}),
      },
      trigger: null,
    });
  } catch {
    // ignore
  }
}
