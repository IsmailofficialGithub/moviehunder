import { useEffect, useState } from "react";
import {
  getDownloadSummaryForPath,
  hydrateDownloads,
  subscribeDownloads,
} from "./downloads";

export function useDownloadSummary(detailPath) {
  const path = detailPath ? String(detailPath) : "";
  const [summary, setSummary] = useState(() =>
    path ? getDownloadSummaryForPath(path) : null
  );

  useEffect(() => {
    if (!path) {
      setSummary(null);
      return;
    }
    hydrateDownloads().catch(() => {});
    const refresh = () => setSummary(getDownloadSummaryForPath(path));
    refresh();
    return subscribeDownloads(refresh);
  }, [path]);

  return summary;
}
