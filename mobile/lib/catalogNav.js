import { router } from "expo-router";

/** Open the title detail page for every catalog card. */
export function openCatalogTitle(slug) {
  if (!slug) return;
  router.push(`/title/${encodeURIComponent(slug)}`);
}
