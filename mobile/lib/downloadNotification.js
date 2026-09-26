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
const completedNotifiedIds = new Set();

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

function isSeriesItem(item) {
  return (
    item?.kind === "series" ||
    (item?.se != null && String(item.se) !== "0" && String(item.se) !== "") ||
    (item?.ep != null && String(item.ep) !== "0" && String(item.ep) !== "")
  );
}

export function handleDownloadNotificationResponse(response) {
  try {
    const data = response?.notification?.request?.content?.data;
    if (data?.type !== "download") return;

    const isSeries = !!data.isSeries || (data.se != null && String(data.se) !== "0");
    const packKey =
      data.packKey ||
      (data.subjectId && data.detailPath
        ? `${data.subjectId}|${data.detailPath}`
        : "");

    if (isSeries && packKey) {
      router.push({
        pathname: "/series-detail",
        params: { packKey: encodeURIComponent(packKey) },
      });
      return;
    }

    router.push({
      pathname: "/(tabs)/downloads",
      params: { tab: isSeries ? "series" : "movies" },
    });
  } catch {
    // ignore navigation errors
  }
}

export async function setupDownloadNotifications() {
  if (ready || IS_EXPO_GO) return;
  const N = loadNotifications();
  if (!N) return;

  try {
    N.setNotificationHandler({
      handleNotification: async (notif) => {
        const isProgress = notif?.request?.identifier === PROGRESS_NOTIF_ID;
        return {
          shouldShowBanner: !isProgress,
          shouldShowList: true,
          shouldPlaySound: false,
          shouldSetBadge: false,
        };
      },
    });

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
        handleDownloadNotificationResponse(response);
      });
    }

    // Handle cold start: notification clicked while app was closed
    setTimeout(() => {
      N.getLastNotificationResponseAsync()
        .then((response) => {
          if (response) {
            handleDownloadNotificationResponse(response);
          }
        })
        .catch(() => {});
    }, 450);

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

  const isSeries = isSeriesItem(top);
  const seNum = Number(top.se) || 0;
  const epNum = Number(top.ep) || 0;
  const epTag = isSeries
    ? seNum > 0
      ? `S${seNum}E${epNum}`
      : `Ep ${epNum}`
    : "";

  const titleText = active.length > 1
    ? `Downloading (${active.length}) · ${pct}%`
    : isSeries
      ? `Downloading ${epTag} · ${pct}%`
      : `Downloading · ${pct}%`;

  const itemTitle = (top.title || "Movie").trim();
  const bodyText = active.length > 1 && isSeries
    ? `${itemTitle} ${epTag}${speed ? ` · ${speed}` : ""}`
    : `${itemTitle}${speed ? ` · ${speed}` : ""}`;
  const key = `${top.id}|${pct}|${active.length}|${speed}`;
  if (key === lastKey) return;
  lastKey = key;

  const packKey =
    top.subjectId && top.detailPath
      ? `${top.subjectId}|${top.detailPath}`
      : "";

  try {
    await N.scheduleNotificationAsync({
      identifier: PROGRESS_NOTIF_ID,
      content: {
        title: titleText,
        body: bodyText,
        data: {
          type: "download",
          id: top.id,
          subjectId: top.subjectId,
          detailPath: top.detailPath,
          se: top.se,
          ep: top.ep,
          kind: top.kind,
          isSeries,
          packKey,
        },
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
  if (item?.id && completedNotifiedIds.has(item.id)) return;
  if (item?.id) completedNotifiedIds.add(item.id);

  const N = loadNotifications();
  if (!N) return;
  try {
    const isSeries = isSeriesItem(item);
    const seNum = Number(item.se) || 0;
    const epNum = Number(item.ep) || 0;
    const epLabel = isSeries
      ? seNum > 0
        ? ` · S${seNum}E${epNum}`
        : ` · Ep ${epNum}`
      : "";

    const titleText = "Download Complete";
    const bodyText = `${(item.title || "Movie").trim()}${epLabel}`;

    const packKey =
      item.subjectId && item.detailPath
        ? `${item.subjectId}|${item.detailPath}`
        : "";

    await N.scheduleNotificationAsync({
      identifier: `complete-${item.id}`,
      content: {
        title: titleText,
        body: bodyText,
        data: {
          type: "download",
          id: item.id,
          subjectId: item.subjectId,
          detailPath: item.detailPath,
          se: item.se,
          ep: item.ep,
          kind: item.kind,
          isSeries,
          packKey,
        },
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
