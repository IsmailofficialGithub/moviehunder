/**
 * App update check — reads remote version.json, downloads + installs APK (Android).
 *
 * Env:
 *   EXPO_PUBLIC_VERSION_JSON_URL  — raw URL to version.json
 *   EXPO_PUBLIC_GITHUB_RELEASES_URL — releases page fallback
 *
 * Example version.json:
 * {
 *   "latest_version": "1.0.4",
 *   "min_supported_version": "1.0.4",
 *   "release_notes": "…",
 *   "android": {
 *     "version_code": 4,
 *     "apk_url": "https://github.com/ORG/REPO/releases/download/v1.0.4/app.apk",
 *     "force": true
 *   }
 * }
 */
import { Linking, Platform } from "react-native";
import Constants from "expo-constants";
import * as FileSystem from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";

const IS_EXPO_GO =
  Constants.appOwnership === "expo" ||
  Constants.executionEnvironment === "storeClient";

export function getVersionJsonUrl() {
  return String(process.env.EXPO_PUBLIC_VERSION_JSON_URL || "").trim();
}

export function getGitHubReleasesUrl() {
  return String(process.env.EXPO_PUBLIC_GITHUB_RELEASES_URL || "").trim();
}

export function getLocalAppVersion() {
  return String(
    Constants.expoConfig?.version ||
      Constants.nativeAppVersion ||
      "0.0.0"
  ).replace(/^v/i, "");
}

export function getLocalVersionCode() {
  const fromConfig = Constants.expoConfig?.android?.versionCode;
  if (fromConfig != null) return Number(fromConfig) || 0;
  const native = Constants.nativeBuildVersion;
  const n = Number(native);
  return Number.isFinite(n) ? n : 0;
}

/** Compare semver-like strings. -1 if a<b, 0 equal, 1 if a>b */
export function compareSemver(a, b) {
  const pa = String(a || "0")
    .replace(/^v/i, "")
    .split(/[.+-]/)
    .map((x) => parseInt(x, 10) || 0);
  const pb = String(b || "0")
    .replace(/^v/i, "")
    .split(/[.+-]/)
    .map((x) => parseInt(x, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}

/**
 * @typedef {object} UpdateInfo
 * @property {boolean} updateAvailable
 * @property {boolean} force
 * @property {string} latestVersion
 * @property {string} minSupported
 * @property {string} currentVersion
 * @property {number} currentVersionCode
 * @property {string} [releaseNotes]
 * @property {string} [apkUrl]
 * @property {string} [releasesUrl]
 * @property {boolean} canInstallApk
 */

/**
 * @returns {Promise<UpdateInfo|null>} null if check skipped / failed soft
 */
export async function checkForAppUpdate() {
  const url = getVersionJsonUrl();
  if (!url) return null;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: "application/json", "Cache-Control": "no-cache" },
    });
    if (!res.ok) throw new Error(`version.json HTTP ${res.status}`);
    const data = await res.json();

    const latestVersion = String(
      data.latest_version || data.latestVersion || ""
    ).replace(/^v/i, "");
    const minSupported = String(
      data.min_supported_version || data.minSupportedVersion || latestVersion
    ).replace(/^v/i, "");
    const releaseNotes = String(data.release_notes || data.releaseNotes || "");
    const android = data.android || {};
    const remoteCode = Number(android.version_code ?? android.versionCode) || 0;
    const apkUrl = String(
      android.apk_url || android.apkUrl || data.apk_url || data.apkUrl || ""
    ).trim();
    const forceFlag = Boolean(android.force ?? data.force);
    const releasesUrl = getGitHubReleasesUrl();

    const currentVersion = getLocalAppVersion();
    const currentVersionCode = getLocalVersionCode();

    const belowMin = compareSemver(currentVersion, minSupported) < 0;
    const belowLatest = compareSemver(currentVersion, latestVersion) < 0;
    const belowCode =
      remoteCode > 0 && currentVersionCode > 0
        ? currentVersionCode < remoteCode
        : remoteCode > 0 && currentVersionCode === 0
          ? belowLatest
          : false;

    const updateAvailable = belowLatest || belowCode;
    const force = belowMin || (updateAvailable && forceFlag);

    return {
      updateAvailable,
      force,
      latestVersion: latestVersion || currentVersion,
      minSupported: minSupported || latestVersion,
      currentVersion,
      currentVersionCode,
      releaseNotes,
      apkUrl,
      releasesUrl,
      canInstallApk:
        Platform.OS === "android" && !IS_EXPO_GO && Boolean(apkUrl),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Download APK then open the system installer (replaces existing app if same package + higher versionCode).
 * @param {string} apkUrl
 * @param {(pct: number) => void} [onProgress]
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function downloadAndInstallApk(apkUrl, onProgress) {
  if (Platform.OS !== "android") {
    return { ok: false, error: "APK install is Android-only" };
  }
  if (IS_EXPO_GO) {
    return {
      ok: false,
      error: "Install a release build to update via APK (not Expo Go)",
    };
  }
  if (!apkUrl) return { ok: false, error: "Missing apk_url in version.json" };

  const dir = `${FileSystem.cacheDirectory || ""}updates/`;
  try {
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    }
  } catch {
    /* ignore */
  }

  const dest = `${dir}moviehunter-update.apk`;
  try {
    await FileSystem.deleteAsync(dest, { idempotent: true });
  } catch {
    /* ignore */
  }

  try {
    const result = await FileSystem.createDownloadResumable(
      apkUrl,
      dest,
      {},
      (prog) => {
        if (!onProgress) return;
        const total = prog.totalBytesExpectedToWrite || 0;
        const done = prog.totalBytesWritten || 0;
        if (total > 0) onProgress(Math.min(1, done / total));
      }
    ).downloadAsync();

    if (!result?.uri) {
      return { ok: false, error: "Download failed" };
    }

    const contentUri = await FileSystem.getContentUriAsync(result.uri);
    await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
      data: contentUri,
      flags: 1,
      type: "application/vnd.android.package-archive",
    });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err?.message || "Couldn’t download or install update",
    };
  }
}

export async function openReleasesPage() {
  const url = getGitHubReleasesUrl() || getVersionJsonUrl();
  if (!url) return false;
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}
