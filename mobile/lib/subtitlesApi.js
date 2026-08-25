import { getApiBase } from "./config";

export async function searchSubtitles({
  query,
  season = "",
  episode = "",
  languages = "en",
  type = "",
}) {
  const params = new URLSearchParams({ query, languages });
  if (season) params.set("season", String(season));
  if (episode) params.set("episode", String(episode));
  if (type) params.set("type", type);

  const res = await fetch(`${getApiBase()}/api/subtitles/search?${params}`);
  return res.json().catch(() => ({}));
}

export async function downloadSubtitle(fileId) {
  const res = await fetch(`${getApiBase()}/api/subtitles/download`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_id: fileId }),
  });
  return res.json().catch(() => ({}));
}
