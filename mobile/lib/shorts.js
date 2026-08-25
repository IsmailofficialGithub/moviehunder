import { router } from "expo-router";

/** Detect Hot Short TV catalog rows. */
export function isHotShortsSection(section) {
  const name = String(section?.section || "")
    .replace(/[^\w\s]/g, " ")
    .toLowerCase();
  return /hot\s*short|short\s*tv/.test(name);
}

/** Short-form catalog item (upstream subject_type 7). */
export function isShortSubject(item) {
  return Number(item?.subject_type) === 7;
}

export function openShorts(slug, ep) {
  if (!slug) return;
  const path = `/shorts/${encodeURIComponent(slug)}`;
  if (ep) {
    router.push(`${path}?ep=${encodeURIComponent(String(ep))}`);
    return;
  }
  router.push(path);
}
