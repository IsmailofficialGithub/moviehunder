import "./network.js";
import { getApiBase, getPlayRelayBase } from "./config.js";
import { createPlaybackTicket } from "./mediaSecurity.js";

function cleanTitle(title, detailPath) {
  let s = String(title || "").trim();
  if (!s || /^\d+$/.test(s)) {
    s = String(detailPath || "")
      .replace(/^.*\/detail\//, "")
      .replace(/^\/+/, "")
      .replace(/-[A-Za-z0-9]{8,16}$/, "")
      .replace(/-/g, " ");
  }
  return s
    .replace(/\[\s*[^\]]*\]|\(\s*[^)]*\)/g, " ")
    .replace(/\bhindi\b|\benglish\b|\btamil\b|\btelugu\b|\bdubbed\b|\bdub\b/gi, " ")
    .replace(/\bs\d+(?:-s\d+)?\b/gi, " ")
    .replace(/\bseason\s*\d+\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function resolveServer2Streams({ title, detailPath, se = "0", ep = "0", currentSubjectId = "", lang = "" }) {
  try {
    const query = cleanTitle(title, detailPath);
    if (!query) return null;

    const base = getApiBase();
    const appKey = String(process.env.APP_CLIENT_KEY || "").trim();
    const serverHeaders = {
      Accept: "application/json",
      "X-MovieHunter-Client": "web",
    };
    if (appKey) serverHeaders["X-App-Key"] = appKey;

    // 1. Search for sibling/alternate direct streams for this title
    const searchRes = await fetch(
      `${base}/search?q=${encodeURIComponent(query)}`,
      { headers: serverHeaders, signal: AbortSignal.timeout(3500) }
    ).catch(() => null);

    let candidates = [];
    if (searchRes && searchRes.ok) {
      const searchData = await searchRes.json().catch(() => ({}));
      candidates = Array.isArray(searchData.movies) ? searchData.movies : [];
    }

    const currentSlug = String(detailPath || "")
      .replace(/^\/?detail\//, "")
      .replace(/^\/+/, "")
      .trim();

    const targetLang = (lang || "").toLowerCase().trim();

    let altMatch = null;
    if (targetLang === "hindi") {
      altMatch = candidates.find((m) => {
        const text = `${m.name || ""} ${m.slug || ""}`.toLowerCase();
        return text.includes("hindi") || (!text.includes("english") && m.slug !== currentSlug);
      });
      if (!altMatch) {
        altMatch = candidates.find((m) => !`${m.name || ""} ${m.slug || ""}`.toLowerCase().includes("english"));
      }
    } else if (targetLang === "english") {
      altMatch = candidates.find((m) => {
        const text = `${m.name || ""} ${m.slug || ""}`.toLowerCase();
        return text.includes("english");
      });
    }

    if (!altMatch) {
      // Prefer a sibling title that is DIFFERENT from currentSlug
      altMatch = candidates.find(
        (m) =>
          m.slug &&
          m.slug !== currentSlug &&
          String(m.subject_id) !== String(currentSubjectId) &&
          (m.name?.toLowerCase().includes(query.toLowerCase()) ||
            m.slug.toLowerCase().includes(query.toLowerCase().replace(/\s+/g, "-")))
      );
    }

    // If no different slug, but candidates exist, take the best candidate
    if (!altMatch && candidates.length > 0) {
      altMatch = candidates[0];
    }

    const targetSubjectId = altMatch?.subject_id || currentSubjectId;
    const targetSlug = altMatch?.slug || currentSlug;

    if (!targetSubjectId && !targetSlug) return null;

    // 2. Fetch direct streams for the alternate subject
    const curSe = String(se || "0");
    const curEp = String(ep || "0");

    const fetchSources = async (sub, slg, s, e) => {
      const url = `${base}/api/stream/${encodeURIComponent(
        sub || slg
      )}?detail_path=${encodeURIComponent(slg || sub)}&se=${s}&ep=${e}`;
      const res = await fetch(url, {
        headers: serverHeaders,
        signal: AbortSignal.timeout(4000),
      }).catch(() => null);
      if (!res || !res.ok) return null;
      const data = await res.json().catch(() => ({}));
      return Array.isArray(data.sources) && data.sources.length ? data.sources : null;
    };

    let rawSources = null;
    let finalSubjectId = targetSubjectId;
    let finalSlug = targetSlug;

    if (curSe === "0" && curEp === "0") {
      rawSources = await fetchSources(targetSubjectId, targetSlug, "0", "0");
      if (!rawSources) {
        rawSources = await fetchSources(targetSubjectId, targetSlug, "1", "1");
      }
    } else {
      rawSources = await fetchSources(targetSubjectId, targetSlug, curSe, curEp);
    }

    // Fallback: if altMatch had no streams, try current title
    if (!rawSources && (targetSlug !== currentSlug || targetSubjectId !== currentSubjectId)) {
      finalSubjectId = currentSubjectId;
      finalSlug = currentSlug;
      if (curSe === "0" && curEp === "0") {
        rawSources = await fetchSources(currentSubjectId, currentSlug, "0", "0");
        if (!rawSources) {
          rawSources = await fetchSources(currentSubjectId, currentSlug, "1", "1");
        }
      } else {
        rawSources = await fetchSources(currentSubjectId, currentSlug, curSe, curEp);
      }
    }

    if (!rawSources || !rawSources.length) return null;

    const relayBase = getPlayRelayBase();

    // Convert raw CDN URLs to secure masked playback tickets for zero-ad native playback
    const maskedSources = rawSources
      .filter((s) => s?.url)
      .map((s) => {
        const height =
          parseInt(String(s.resolution || "").replace(/p$/i, ""), 10) || 0;
        const ticket = createPlaybackTicket(s.url);
        const directUrl = relayBase
          ? `${relayBase}/api/media?ticket=${ticket}`
          : `/api/media?ticket=${ticket}`;
        return {
          url: `/api/media?ticket=${ticket}`,
          direct_url: directUrl,
          resolution: s.resolution || (height ? `${height}p` : "Auto"),
          height,
          format: s.format || "MP4",
          size_bytes: s.size_bytes ?? null,
          id: s.id || null,
          server: "Server 2",
        };
      })
      .sort((a, b) => b.height - a.height);

    if (!maskedSources.length) return null;

    return {
      ok: true,
      host: "Server 2",
      via: "direct",
      sources: maskedSources,
      meta: {
        id: targetSubjectId,
        title: altMatch?.name || title || query,
        slug: targetSlug,
      },
    };
  } catch (err) {
    console.error("[server2Resolver] error:", err?.message || err);
    return null;
  }
}
