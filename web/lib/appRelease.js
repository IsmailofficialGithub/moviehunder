/**
 * @returns {"android" | "ios" | "desktop"}
 */
export function detectDevicePlatform() {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent || "";
  if (/Android/i.test(ua)) return "android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) {
    return "ios";
  }
  return "desktop";
}

export function isMobileBrowser() {
  const p = detectDevicePlatform();
  return p === "android" || p === "ios";
}

/**
 * Ask the website API whether a release exists for this device.
 * @param {"android" | "ios" | "desktop"} [platform]
 */
export async function fetchAppRelease(platform = detectDevicePlatform()) {
  const res = await fetch(
    `/api/app-release?platform=${encodeURIComponent(platform)}`,
    { cache: "no-store" }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Could not load release info (${res.status})`);
  }
  return data;
}
