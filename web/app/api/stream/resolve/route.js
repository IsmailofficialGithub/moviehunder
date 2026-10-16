import "../../../../lib/network.js";
import { NextResponse } from "next/server";
import { getApiBase, getPlayRelayBase } from "../../../../lib/config";
import { createPlaybackTicket } from "../../../../lib/mediaSecurity";
import { resolveServer2Streams } from "../../../../lib/server2Resolver";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Server-side in-memory cache for ultra-fast instant stream resolution
const serverCache = new Map();
const CACHE_TTL_MS = 15 * 60 * 1000;

export async function GET(request) {
  try {
    const url = new URL(request.url);
    let subjectId = url.searchParams.get("subjectId");
    const detailPath = url.searchParams.get("detailPath");
    const se = url.searchParams.get("se") || "0";
    const ep = url.searchParams.get("ep") || "0";
    const requestedServer = url.searchParams.get("server") || "1";
    const requestedLang = (url.searchParams.get("lang") || "").trim().toLowerCase();

    const cacheKey = `${subjectId || ""}_${detailPath || ""}_${se}_${ep}_s${requestedServer}_l${requestedLang}`;
    const cachedHit = serverCache.get(cacheKey);
    if (cachedHit && Date.now() - cachedHit.ts < CACHE_TTL_MS) {
      return NextResponse.json(cachedHit.payload);
    }

    // Security: Only allow requests originating from our website
    const origin = request.headers.get("origin") || "";
    const referer = request.headers.get("referer") || "";
    const secFetchSite = request.headers.get("sec-fetch-site") || "";
    const allowed = ["offstream.co", "localhost", "127.0.0.1"];
    const isAllowedOrigin = !origin || allowed.some((h) => origin.includes(h));
    const isAllowedReferer = !referer || allowed.some((h) => referer.includes(h));

    if (secFetchSite === "cross-site" || !isAllowedOrigin || !isAllowedReferer) {
      return NextResponse.json(
        { ok: false, error: "Access denied. Streams only accessible from official website." },
        { status: 403 }
      );
    }

    if (!subjectId && !detailPath) {
      return NextResponse.json(
        { ok: false, error: "subjectId or detailPath is required" },
        { status: 400 }
      );
    }

    const appKey = String(process.env.APP_CLIENT_KEY || "").trim();
    const serverHeaders = {
      Accept: "application/json",
      "X-MovieHunter-Client": "web",
    };
    if (appKey) serverHeaders["X-App-Key"] = appKey;

    let detailMeta = null;
    const isSubjectNumeric = subjectId && /^\d+$/.test(String(subjectId).trim());
    if (!isSubjectNumeric && (detailPath || subjectId)) {
      const slugToQuery = detailPath || subjectId;
      try {
        const detailRes = await fetch(
          `${getApiBase()}/detail/${encodeURIComponent(slugToQuery)}`,
          { headers: serverHeaders }
        );
        if (detailRes.ok) {
          const detailData = await detailRes.json();
          if (detailData?.metadata?.id) {
            subjectId = String(detailData.metadata.id);
          }
          detailMeta = detailData?.metadata || null;
        }
      } catch {}
    }

    if (!subjectId) subjectId = detailPath;

    const isHindiRequested = requestedLang === "hindi" || requestedLang.includes("hindi");
    const s1Title = String(detailMeta?.title || url.searchParams.get("title") || "");
    const s1Slug = String(detailPath || subjectId || "");
    const s1HasNativeHindi = /\[\s*hindi\s*\]|\(\s*hindi\s*\)|-hindi-|\bhindi\b/i.test(`${s1Title} ${s1Slug}`);

    // If Hindi is requested and Server 1 has no native Hindi dub, route directly to Server 2
    const forceServer2 = requestedServer === "2" || (isHindiRequested && !s1HasNativeHindi);

    const fetchStreamAttempt = async (curSe, curEp) => {
      const sp = `/api/stream/${encodeURIComponent(
        subjectId
      )}?detail_path=${encodeURIComponent(detailPath || subjectId)}&se=${curSe}&ep=${curEp}`;

      const attempts = [];
      const relayBase = getPlayRelayBase();
      if (relayBase) {
        attempts.push(
          fetch(`${relayBase}${sp}`, {
            headers: serverHeaders,
            signal: AbortSignal.timeout(2400),
          }).then(async (r) => {
            if (!r.ok) throw new Error("relay failed");
            const d = await r.json();
            if (Array.isArray(d.sources) && d.sources.length > 0) {
              return { data: d, via: "relay", streamDomain: d.stream_domain || "relay" };
            }
            throw new Error("relay no sources");
          })
        );
      }

      attempts.push(
        fetch(`${getApiBase()}${sp}`, {
          headers: serverHeaders,
          signal: AbortSignal.timeout(2800),
        }).then(async (r) => {
          if (!r.ok) throw new Error("api failed");
          const d = await r.json();
          if (Array.isArray(d.sources) && d.sources.length > 0) {
            return { data: d, via: "worker", streamDomain: d.stream_domain || "worker" };
          }
          throw new Error("api no sources");
        })
      );

      try {
        return await Promise.any(attempts);
      } catch {
        return null;
      }
    };

    let resolved = null;
    if (!forceServer2) {
      if (se === "0" && ep === "0") {
        resolved = await fetchStreamAttempt("0", "0");
        if (!resolved) {
          resolved = await fetchStreamAttempt("1", "1");
        }
      } else {
        resolved = await fetchStreamAttempt(se, ep);
      }
    }

    // Fallback: If Server 1 has no streams or Server 2 is requested/forced -> Server 2 (Universal Multi-Source)
    if (!resolved || !resolved.data || !Array.isArray(resolved.data.sources) || !resolved.data.sources.length) {
      const s2 = await resolveServer2Streams({
        title: detailMeta?.title || url.searchParams.get("title") || "",
        detailPath: detailPath || subjectId,
        se,
        ep,
        currentSubjectId: subjectId,
        lang: requestedLang,
      });

      if (s2 && s2.sources?.length) {
        const payload = {
          ok: true,
          sources: s2.sources,
          host: "Server 2",
          via: "fallback",
          meta: detailMeta
            ? {
                id: detailMeta.id,
                country: detailMeta.country,
                genre: detailMeta.genre,
                year: detailMeta.release_date,
                rating: detailMeta.imdb_rating,
                title: detailMeta.title,
                duration: detailMeta.duration,
              }
            : s2.meta || null,
        };
        serverCache.set(cacheKey, { payload, ts: Date.now() });
        return NextResponse.json(payload, {
          headers: {
            "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600",
          },
        });
      }

      return NextResponse.json(
        { ok: false, error: "No playable streams found" },
        { status: 404 }
      );
    }

    const { data, via, streamDomain } = resolved;
    const rawSources = Array.isArray(data.sources) ? data.sources : [];

    const relayBase = getPlayRelayBase();

    // Mask raw CDN URLs by converting them into secure, short-lived playback tickets
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
        };
      })
      .sort((a, b) => b.height - a.height);

    const payload = {
      ok: true,
      sources: maskedSources,
      host: "Server 1",
      via: "secure",
      meta: detailMeta
        ? {
            id: detailMeta.id,
            country: detailMeta.country,
            genre: detailMeta.genre,
            year: detailMeta.release_date,
            rating: detailMeta.imdb_rating,
            title: detailMeta.title,
            duration: detailMeta.duration,
          }
        : null,
    };

    if (serverCache.size > 250) {
      const oldestKey = serverCache.keys().next().value;
      serverCache.delete(oldestKey);
    }
    serverCache.set(cacheKey, { payload, ts: Date.now() });

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600",
      },
    });
  } catch (err) {
    console.error("[api/stream/resolve] error:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to resolve media streams" },
      { status: 500 }
    );
  }
}
