import { router } from "expo-router";
import { getDownloadSummaryForPath } from "./downloads";

/** Open Downloads if this title has downloads; otherwise the detail page. */
export function openCatalogTitle(slug) {
  if (!slug) return;
  const summary = getDownloadSummaryForPath(slug);
  if (summary) {
    router.push({
      pathname: "/(tabs)/downloads",
      params: { expand: summary.packKey },
    });
    return;
  }
  router.push(`/title/${encodeURIComponent(slug)}`);
}
