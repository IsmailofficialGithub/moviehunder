/**
 * Catalog / stream API — Cloudflare Worker
 * Upstream hosts and paths come only from env (.dev.vars / dashboard).
 */

import { cfg, createConfig, setActiveConfig } from "./config.js";
import {
  assertAdmin,
  listDevices,
  setDeviceBlocked,
  verifyDeviceAccess,
} from "./access.js";
import {
  musicPlaylistTracks,
  musicSearch,
  musicSuggest,
  musicTrending,
} from "./music.js";
import { downloadSubdl, searchSubdl, subdlConfigured } from "./subdl.js";
import { toWebVtt } from "./subtitles.js";
import {
  activeCorsHeaders,
  authorizeClient,
  requestContext,
} from "./cors.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, init = {}, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const resp = await fetch(url, init);
      if (resp.status === 429 || resp.status >= 500) {
        lastErr = new Error(`Upstream ${resp.status} for ${url}`);
        await sleep(500 * (i + 1));
        continue;
      }
      return resp;
    } catch (err) {
      lastErr = err;
      await sleep(400 * (i + 1));
    }
  }
  throw lastErr || new Error(`Upstream failed for ${url}`);
}

/** Edge cache for list endpoints — avoids upstream 429s */
async function cachedJson(url, { ttl = 300, init = {} } = {}) {
  try {
    const hit = await caches.default.match(new Request(url, { method: "GET" }));
    if (hit) return await hit.json();
  } catch {
    /* cache unavailable */
  }

  const resp = await fetchWithRetry(url, {
    ...init,
    headers: { ...cfg().apiHeaders(), ...(init.headers || {}) },
  });
  if (!resp.ok) throw new Error(`Upstream ${resp.status} for ${url}`);
  const body = await resp.json();

  try {
    await caches.default.put(
      new Request(url, { method: "GET" }),
      new Response(JSON.stringify(body), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": `public, max-age=${ttl}`,
        },
      })
    );
  } catch {
    /* ignore cache write failures */
  }
  return body;
}

function mapSubject(s) {
  if (!s) return null;
  const name = s.title || s.name || "";
  if (!name) return null;
  const base = cfg().BASE_URL;
  return {
    name,
    poster_url: s.cover?.url || s.thumbnail || s.image?.url || null,
    url: s.detailPath ? `${base}/detail/${s.detailPath}` : null,
    slug: s.detailPath || null,
    badge: s.corner || null,
    blurhash: s.cover?.blurHash || null,
    year: s.releaseDate || null,
    rating: s.imdbRatingValue || null,
    subject_id: s.subjectId || s.id || null,
    subject_type: s.subjectType || null,
  };
}

function sectionsFromOperatingList(ops = []) {
  const sections = [];
  for (const op of ops) {
    const title = op.title || "";

    if (op.banner) {
      const items = (op.banner.items || [])
        .filter((i) => i.title && !String(i.title).includes("Communities"))
        .map((i) => ({
          name: i.title,
          poster_url: i.image?.url || i.subject?.cover?.url || null,
          url: i.detailPath ? `${cfg().BASE_URL}/detail/${i.detailPath}` : null,
          badge: i.subject?.corner || null,
          slug: i.detailPath || null,
          subject_id: i.subjectId || i.subject?.subjectId || null,
        }))
        .filter((m) => m.slug || m.poster_url);
      if (items.length) {
        sections.push({
          section: "Banner",
          count: items.length,
          movies: items,
          more_url: null,
        });
      }
      continue;
    }

    const subs = op.subjects || [];
    if (!subs.length || !title) continue;
    if (/live|join us|football|sport/i.test(title) && !subs.some((s) => s.detailPath)) {
      continue;
    }

    const movies = subs.map(mapSubject).filter(Boolean);
    if (!movies.length) continue;

    sections.push({
      section: title,
      count: movies.length,
      movies,
      more_url: null,
    });
  }
  return sections;
}

function resolveNuxt(nuxt) {
  function resolve(index, depth = 0) {
    if (depth > 10) return null;
    if (typeof index !== "number" || index < 0 || index >= nuxt.length) return index;
    const val = nuxt[index];
    if (val && typeof val === "object" && !Array.isArray(val)) {
      const out = {};
      for (const [k, v] of Object.entries(val)) out[k] = resolve(v, depth + 1);
      return out;
    }
    if (Array.isArray(val)) return val.map((v) => resolve(v, depth + 1));
    return val;
  }
  return resolve;
}

async function fetchNuxtData(pageUrl) {
  const resp = await fetchWithRetry(pageUrl, {
    headers: {
      "User-Agent": cfg().USER_AGENT,
      Accept: "text/html,application/xhtml+xml",
      Referer: `${cfg().BASE_URL}/`,
    },
    redirect: "follow",
  });
  if (!resp.ok) throw new Error(`Page ${resp.status}`);
  const html = await resp.text();
  const match = html.match(
    /<script[^>]+id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/
  );
  if (!match) throw new Error("NUXT data missing");
  return JSON.parse(match[1]);
}

function moviesFromNuxt(nuxt) {
  const resolve = resolveNuxt(nuxt);
  const movies = [];
  const seen = new Set();
  for (let i = 0; i < nuxt.length; i++) {
    const v = resolve(i);
    if (!v || typeof v !== "object" || Array.isArray(v)) continue;
    if (!v.detailPath || !v.title) continue;
    if (seen.has(v.detailPath)) continue;
    seen.add(v.detailPath);
    movies.push({
      name: v.title,
      poster_url: v.cover?.url || null,
      url: `${cfg().BASE_URL}/detail/${v.detailPath}`,
      slug: v.detailPath,
      badge: v.corner || null,
      blurhash: v.cover?.blurHash || null,
      subject_id: v.subjectId || null,
      subject_type: v.subjectType || null,
    });
  }
  return movies;
}

// ══════════════════════════════════════════════════════════════════
// Router
// ══════════════════════════════════════════════════════════════════

export default {
  async fetch(request, env) {
    // Wrangler bindings (.dev.vars) win; fall back to process.env (PM2 / shell)
    const config = createConfig({
      ...(typeof process !== "undefined" ? process.env : {}),
      ...(env || {}),
    });
    setActiveConfig(config);
    if (config.missing.length) {
      return new Response(
        JSON.stringify(
          {
            error: "Server misconfigured",
            missing: config.missing,
            hint: "Copy server/.env.example to server/.dev.vars and fill values",
          },
          null,
          2
        ),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const gate = authorizeClient(request);
    if (!gate.ok) {
      const origin = request.headers.get("Origin") || "";
      // Let browsers surface the 403 body when Origin is present (still denied)
      const denyCors = origin
        ? {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
            "Access-Control-Allow-Headers":
              "Range, Content-Type, Accept, X-MovieHunter-Client, X-App-Key, Authorization",
            Vary: "Origin",
          }
        : { "Access-Control-Allow-Origin": "null" };
      return new Response(
        JSON.stringify(
          {
            error: "Forbidden",
            reason: gate.reason || "Unauthorized client",
            received_origin: gate.received_origin || null,
          },
          null,
          2
        ),
        {
          status: 403,
          headers: {
            "Content-Type": "application/json",
            ...denyCors,
          },
        }
      );
    }

    return requestContext.run({ cors: gate.cors }, () =>
      handleRequest(request, env)
    );
  },
};

async function handleRequest(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: activeCorsHeaders(),
      });
    }

    const url = new URL(request.url);
    const p = url.pathname.replace(/\/+$/, "") || "/";

    try {
      if (p === "/api") return handleRoot();
      if (p === "/home") return await handleHome();
      if (p === "/home/sections") return await handleHomeSections();
      if (p === "/home/banner") return await handleHomeBanner();
      if (p === "/home/trending") return await handleHomeFilter("trending now", "popular movie");
      if (p === "/home/hot") return await handleHomeFilter("hot");
      if (p === "/home/cinema") return await handleHomeFilter("cinema", "popular series");

      // ── Home section by name ──────────────────────────────
      let m = p.match(/^\/home\/section\/(.+)$/);
      if (m) return await handleHomeSectionByName(decodeURIComponent(m[1]));

      // ── Movies ────────────────────────────────────────────
      if (p === "/movies") return await handleCategory("movie");
      m = p.match(/^\/movies\/sections$/);
      if (m) return await handleCategorySections("movie");
      m = p.match(/^\/movies\/section\/(.+)$/);
      if (m) return await handleCategorySectionByName("movie", decodeURIComponent(m[1]));

      // ── TV Series ─────────────────────────────────────────
      if (p === "/tv-series") return await handleCategory("tv-series");
      m = p.match(/^\/tv-series\/sections$/);
      if (m) return await handleCategorySections("tv-series");
      m = p.match(/^\/tv-series\/section\/(.+)$/);
      if (m) return await handleCategorySectionByName("tv-series", decodeURIComponent(m[1]));

      // ── Animation ─────────────────────────────────────────
      if (p === "/animation") return await handleCategory("animated-series");
      m = p.match(/^\/animation\/sections$/);
      if (m) return await handleCategorySections("animated-series");
      m = p.match(/^\/animation\/section\/(.+)$/);
      if (m)
        return await handleCategorySectionByName(
          "animated-series",
          decodeURIComponent(m[1])
        );

      // ── Ranking ───────────────────────────────────────────
      if (p === "/ranking") return await handleRanking();
      m = p.match(/^\/ranking\/sections$/);
      if (m) return await handleRankingSections();
      m = p.match(/^\/ranking\/section\/(.+)$/);
      if (m) return await handleRankingSectionByName(decodeURIComponent(m[1]));

      // ── Search ────────────────────────────────────────────
      if (p === "/search/suggest") return await handleSearchSuggest(url.searchParams);
      if (p === "/search") return await handleSearch(url.searchParams);

      // ── Detail ────────────────────────────────────────────
      m = p.match(/^\/detail\/(.+)$/);
      if (m) return await handleDetail(decodeURIComponent(m[1]));

      // ── Episodes ──────────────────────────────────────────
      m = p.match(/^\/episodes\/(.+)$/);
      if (m) return await handleEpisodes(decodeURIComponent(m[1]));

      // ── Streaming ─────────────────────────────────────────
      m = p.match(/^\/api\/stream\/(\d+)$/);
      if (m) return await handleStreamApi(m[1], url.searchParams);

      m = p.match(/^\/watch\/(\d+)$/);
      if (m) return await handleWatch(m[1], url.searchParams, request);

      if (p === "/api/subtitles/search") {
        return await handleSubtitleSearch(url.searchParams, env);
      }
      if (p === "/api/subtitles/download" && request.method === "POST") {
        return await handleSubtitleDownload(request, env);
      }

      // ── Device access (Supabase) ──────────────────────────
      if (p === "/api/access/verify" && request.method === "POST") {
        return await handleAccessVerify(request, env);
      }
      if (p === "/api/access/devices" && request.method === "GET") {
        return await handleAccessList(request, env);
      }
      if (p === "/api/access/block" && request.method === "POST") {
        return await handleAccessBlock(request, env);
      }

      // ── Free music (Audius) ────────────────────────────────
      if (p === "/api/music/search") {
        return await handleMusicSearch(url.searchParams);
      }
      if (p === "/api/music/suggest") {
        return await handleMusicSuggest(url.searchParams);
      }
      if (p === "/api/music/trending") {
        return await handleMusicTrending(url.searchParams);
      }
      m = p.match(/^\/api\/music\/playlist\/([^/]+)\/tracks$/);
      if (m) {
        return await handleMusicPlaylistTracks(
          decodeURIComponent(m[1]),
          url.searchParams
        );
      }

      // legacy Spotify routes removed — use /api/music/*

      return json({ error: "Not found" }, 404);
    } catch (err) {
      return json({ error: err.message || "Internal error" }, 500);
    }
}

// ══════════════════════════════════════════════════════════════════
// GET /api  — endpoint listing
// ══════════════════════════════════════════════════════════════════

function handleRoot() {
  return json({
    api: "Flick catalog API",
    version: "4.0.0",
    runtime: "Cloudflare Worker",
    config: {
      base: cfg().BASE_URL,
      h5: cfg().H5_API,
      play_hosts: cfg().PLAY_HOSTS.length,
    },
    endpoints: {
      ui: {
        "/": "Web app frontend",
      },
      home: {
        "/home": "Get home page data (banners and sections)",
        "/home/sections": "List section names",
        "/home/section/{name}": "Get a section by name",
        "/home/banner": "Get banner items",
        "/home/trending": "Get trending section",
        "/home/hot": "Get hot section",
        "/home/cinema": "Get cinema section",
      },
      movies: {
        "/movies": "Get all movies",
        "/movies/sections": "List movie sections",
        "/movies/section/{name}": "Get a movie section by name",
      },
      tv_series: {
        "/tv-series": "Get all TV series",
        "/tv-series/sections": "List TV series sections",
        "/tv-series/section/{name}": "Get a TV series section by name",
      },
      animation: {
        "/animation": "Get all animations",
        "/animation/sections": "List animation sections",
        "/animation/section/{name}": "Get an animation section by name",
      },
      ranking: {
        "/ranking": "Get ranking lists",
        "/ranking/sections": "List ranking sections",
        "/ranking/section/{name}": "Get a ranking section by name",
      },
      search: {
        "/search?q={query}": "Search for titles",
        "/search/suggest?q={query}": "Get autocomplete suggestions",
      },
      detail: {
        "/detail/{slug}": "Get full metadata, cast, seasons, streams",
        "/episodes/{slug}": "Get episode list and counts for all seasons",
      },
      streaming: {
        "/api/stream/{subject_id}?detail_path=...": "Get raw stream URLs (JSON)",
        "/watch/{subject_id}?detail_path=...&resolution=480":
          "Stream video directly (zero-buffer proxy). Params: detail_path, se, ep, resolution",
      },
      subtitles: {
        "/api/subtitles/search?query=...&season=&episode=&type=":
          "Search SubDL subtitles (requires SUBDL_API_KEY)",
        "/api/subtitles/download": "POST { file_id } — fetch and convert to VTT (server-side only)",
      },
      access: {
        "/api/access/verify": "POST { device_id, platform, app_version } — register/verify device",
        "/api/access/devices": "GET — list devices (header X-Admin-Key)",
        "/api/access/block": "POST { device_id, blocked, reason } (header X-Admin-Key)",
      },
      music: {
        "/api/music/search?q=": "Search free Audius tracks + playlists",
        "/api/music/suggest?q=": "Autocomplete song + artist names",
        "/api/music/trending": "Trending free tracks",
        "/api/music/playlist/{id}/tracks": "Tracks from an Audius playlist",
      },
    },
  });
}

// ══════════════════════════════════════════════════════════════════
// GET /home
// ══════════════════════════════════════════════════════════════════

async function fetchHomeData() {
  const sources = [
    `${cfg().MIRROR_WEB_BFF}/home`,
    `${cfg().WEB_BFF}/home`,
    (cfg().H5_HOST_QUERY ? `${cfg().H5_API}${cfg().H5_BFF_PATH}/home?host=${cfg().H5_HOST_QUERY}` : `${cfg().H5_API}${cfg().H5_BFF_PATH}/home`),
    `${cfg().H5_API}${cfg().H5_BFF_PATH}/tab-operating?page=1&tabId=0`,
  ];

  let lastErr;
  for (const url of sources) {
    try {
      const body = await cachedJson(url, { ttl: 180 });
      const ops = body?.data?.operatingList || [];
      const sections = sectionsFromOperatingList(ops);
      if (sections.length) return sections;
    } catch (err) {
      lastErr = err;
    }
  }

  for (const page of [`${cfg().MIRROR_URL}/`, `${cfg().BASE_URL}/`]) {
    try {
      const nuxt = await fetchNuxtData(page);
      const resolve = resolveNuxt(nuxt);
      for (let i = 0; i < nuxt.length; i++) {
        const v = resolve(i);
        if (v?.operatingList?.length) {
          const sections = sectionsFromOperatingList(v.operatingList);
          if (sections.length) return sections;
        }
      }
    } catch (err) {
      lastErr = err;
    }
  }

  throw lastErr || new Error("Home API unavailable");
}

async function handleHome() {
  const sections = await fetchHomeData();
  return json({
    source: `${cfg().WEB_BFF}/home`,
    total_sections: sections.length,
    poster_map_size: 0,
    sections,
  });
}

async function handleHomeSections() {
  const sections = await fetchHomeData();
  return json({
    total: sections.length,
    sections: sections.map((s) => ({
      name: s.section,
      count: s.count,
      more_url: s.more_url,
    })),
  });
}

async function handleHomeBanner() {
  const sections = await fetchHomeData();
  const banner = sections.find((s) => s.section === "Banner");
  return json({
    count: banner ? banner.count : 0,
    featured: banner ? banner.movies : [],
  });
}

async function handleHomeFilter(...keywords) {
  const sections = await fetchHomeData();
  const match = sections.find((s) =>
    keywords.some((kw) => s.section.toLowerCase().includes(kw))
  );
  if (!match) return json({ error: "Section not found" }, 404);
  return json(match);
}

async function handleHomeSectionByName(name) {
  const sections = await fetchHomeData();
  const matched = sections.filter((s) =>
    s.section.toLowerCase().includes(name.toLowerCase())
  );
  if (!matched.length) {
    return json(
      {
        message: `No section matching '${name}'`,
        available: sections.map((s) => s.section),
      },
      404
    );
  }
  return json({ results: matched });
}

// ══════════════════════════════════════════════════════════════════
// GET /movies, /tv-series, /animation
// ══════════════════════════════════════════════════════════════════

async function fetchTrendingSection(tabId, sectionName) {
  const body = await cachedJson(
    `${cfg().H5_API}${cfg().H5_BFF_PATH}/subject/trending?tabId=${tabId}&page=1&perPage=36`,
    { ttl: 180 }
  );
  const items = (body?.data?.subjectList || []).map(mapSubject).filter(Boolean);
  if (!items.length) return null;
  return {
    section: sectionName,
    more_url: null,
    count: items.length,
    movies: items,
  };
}

async function fetchCategoryData(category) {
  if (category === "movie") {
    try {
      const body = await cachedJson(
        `${cfg().H5_API}${cfg().H5_BFF_PATH}/tab-operating?page=1&tabId=2`,
        { ttl: 180 }
      );
      const sections = sectionsFromOperatingList(body?.data?.operatingList || []);
      if (sections.length) return sections;
    } catch {
      /* fall through */
    }
    try {
      const trending = await fetchTrendingSection(2, "Trending Movies");
      if (trending) return [trending];
    } catch {
      /* fall through */
    }
    // Fallback: reuse home feed rows (avoids h5-api 429)
    const home = await fetchHomeData();
    const filtered = home.filter((s) =>
      /movie|cinema|film|punjabi|trending|hot|top/i.test(s.section)
    );
    return filtered.length ? filtered : home;
  }

  if (category === "tv-series") {
    const sections = [];
    for (const [tabId, name] of [
      [5, "Trending Dramas"],
      [0, "Popular Series"],
    ]) {
      try {
        const sec = await fetchTrendingSection(tabId, name);
        if (sec) sections.push(sec);
      } catch {
        /* skip */
      }
    }
    if (sections.length) return sections;

    const home = await fetchHomeData();
    const filtered = home.filter((s) =>
      /series|drama|tv|show|episode/i.test(s.section)
    );
    return filtered.length ? filtered : home.slice(0, 4);
  }

  // animation / anime
  const home = await fetchHomeData();
  const anime = home.filter((s) =>
    /anime|animation|cartoon|animat/i.test(s.section)
  );
  if (anime.length) return anime;

  try {
    const trending = await fetchTrendingSection(2, "Movies");
    const series = await fetchTrendingSection(0, "Series");
    return [trending, series].filter(Boolean);
  } catch {
    return home.slice(0, 3);
  }
}

async function handleCategory(category) {
  const sections = await fetchCategoryData(category);
  return json({
    source: `${cfg().H5_API}${cfg().H5_BFF_PATH}/tab-operating`,
    total_sections: sections.length,
    poster_map_size: 0,
    sections,
  });
}

async function handleCategorySections(category) {
  const sections = await fetchCategoryData(category);
  return json({
    total: sections.length,
    sections: sections.map((s) => ({
      name: s.section,
      count: s.count,
      more_url: s.more_url,
    })),
  });
}

async function handleCategorySectionByName(category, name) {
  const sections = await fetchCategoryData(category);
  const matched = sections.filter((s) =>
    s.section.toLowerCase().includes(name.toLowerCase())
  );
  if (!matched.length) {
    return json(
      {
        message: `No section matching '${name}'`,
        available: sections.map((s) => s.section),
      },
      404
    );
  }
  return json({ results: matched });
}

// ══════════════════════════════════════════════════════════════════
// GET /ranking
// ══════════════════════════════════════════════════════════════════

async function fetchRankingData() {
  const rankUrls = [
    `${cfg().MIRROR_WEB_BFF}/subject/search-rank`,
    `${cfg().WEB_BFF}/subject/search-rank`,
  ];
  for (const url of rankUrls) {
    try {
      const body = await cachedJson(url, { ttl: 300 });
      const data = body?.data || {};
      const sections = [];
      for (const [key, label] of [
        ["movie", "Top Movies"],
        ["tv", "Top TV Series"],
      ]) {
        const items = (data[key] || []).map(mapSubject).filter(Boolean);
        if (items.length) {
          sections.push({
            section: label,
            more_url: null,
            count: items.length,
            movies: items.map((m, i) => ({ ...m, rank: String(i + 1) })),
          });
        }
      }
      if (sections.length) return sections;
    } catch {
      /* try next */
    }
  }

  const resp = await fetch(`${cfg().H5_API}${cfg().H5_BFF_PATH}/subject/rank-list`, {
    headers: cfg().apiHeaders(),
  });
  if (!resp.ok) throw new Error(`Ranking API returned ${resp.status}`);
  const body = await resp.json();
  const lists = body?.data || [];

  const sections = [];
  for (const list of Array.isArray(lists) ? lists : [lists]) {
    const title = list.title || "Most Watched";
    const items = list.items || list.subjects || [];
    const movies = items.map(mapSubject).filter(Boolean);
    sections.push({
      section: title,
      more_url: null,
      count: movies.length,
      movies: movies.map((m, i) => ({ ...m, rank: String(i + 1) })),
    });
  }
  return sections;
}

async function handleRanking() {
  const sections = await fetchRankingData();
  return json({
    source: `${cfg().H5_API}${cfg().H5_BFF_PATH}/subject/rank-list`,
    total_sections: sections.length,
    poster_map_size: 0,
    sections,
  });
}

async function handleRankingSections() {
  const sections = await fetchRankingData();
  return json({
    total: sections.length,
    sections: sections.map((s) => ({
      name: s.section,
      count: s.count,
      more_url: s.more_url,
    })),
  });
}

async function handleRankingSectionByName(name) {
  const sections = await fetchRankingData();
  const matched = sections.filter((s) =>
    s.section.toLowerCase().includes(name.toLowerCase())
  );
  if (!matched.length) {
    return json(
      {
        message: `No section matching '${name}'`,
        available: sections.map((s) => s.section),
      },
      404
    );
  }
  return json({ results: matched });
}

// ══════════════════════════════════════════════════════════════════
// GET /search/suggest  and  GET /search
// ══════════════════════════════════════════════════════════════════

async function handleSearchSuggest(params) {
  const q = params.get("q");
  if (!q) return json({ error: "q parameter required" }, 400);

  try {
    const resp = await fetch(
      `${cfg().H5_API}${cfg().H5_BFF_PATH}/subject/search-suggest`,
      {
        method: "POST",
        headers: {
          ...cfg().apiHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ keyword: q, perPage: 10 }),
      }
    );
    if (resp.ok) {
      const body = await resp.json();
      const suggestions = (body?.data?.items || [])
        .map((i) => i.word)
        .filter(Boolean);
      if (suggestions.length) return json({ query: q, suggestions });
    }
  } catch {
    /* fall through */
  }

  // Soft fallback: filter popular searches
  for (const url of [
    `${cfg().MIRROR_WEB_BFF}/subject/everyone-search`,
    `${cfg().WEB_BFF}/subject/everyone-search`,
  ]) {
    try {
      const body = await cachedJson(url, { ttl: 600 });
      const all = (body?.data?.everyoneSearch || [])
        .map((i) => i.title)
        .filter(Boolean);
      const ql = q.toLowerCase();
      const suggestions = all
        .filter((t) => t.toLowerCase().includes(ql))
        .slice(0, 10);
      if (suggestions.length) return json({ query: q, suggestions });
    } catch {
      /* try next */
    }
  }

  // Last resort: use search result titles as suggestions
  try {
    const pageUrl = `${cfg().MIRROR_URL}/web/searchResult?keyword=${encodeURIComponent(q)}`;
    const movies = moviesFromNuxt(await fetchNuxtData(pageUrl));
    const suggestions = movies.map((m) => m.name).filter(Boolean).slice(0, 8);
    return json({ query: q, suggestions });
  } catch {
    return json({ query: q, suggestions: [] });
  }
}

async function handleSearch(params) {
  const q = params.get("q");
  if (!q) return json({ error: "q parameter required" }, 400);

  const pages = [
    `${cfg().MIRROR_URL}/web/searchResult?keyword=${encodeURIComponent(q)}`,
    `${cfg().BASE_URL}/web/searchResult?keyword=${encodeURIComponent(q)}`,
  ];
  let lastErr;
  for (const pageUrl of pages) {
    try {
      const movies = moviesFromNuxt(await fetchNuxtData(pageUrl));
      if (movies.length) return json({ query: q, count: movies.length, movies });
    } catch (err) {
      lastErr = err;
    }
  }
  return json({ error: lastErr?.message || "Search failed" }, 502);
}

// ══════════════════════════════════════════════════════════════════
// GET /detail/{slug}  — full metadata from NUXT_DATA
// ══════════════════════════════════════════════════════════════════

async function handleDetail(slug) {
  let html = "";
  let pageUrl = `${cfg().BASE_URL}/detail/${slug}`;
  for (const host of cfg().SITE_HOSTS) {
    pageUrl = `${host}/detail/${slug}`;
    const resp = await fetchWithRetry(pageUrl, {
      headers: { "User-Agent": cfg().USER_AGENT, Accept: "text/html", Referer: `${host}/` },
      redirect: "follow",
    });
    if (resp.ok) {
      html = await resp.text();
      break;
    }
  }
  if (!html) return json({ error: "Movie not found" }, 404);

  // Extract __NUXT_DATA__
  const match = html.match(
    /<script[^>]+id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/
  );
  if (!match) return json({ error: "Could not find NUXT data" }, 500);

  let nuxt;
  try {
    nuxt = JSON.parse(match[1]);
  } catch {
    return json({ error: "Failed to parse NUXT data" }, 500);
  }
  if (!Array.isArray(nuxt)) return json({ error: "Unexpected NUXT format" }, 500);

  // Resolve NUXT references
  function resolve(index) {
    if (typeof index !== "number" || index < 0 || index >= nuxt.length) return index;
    const val = nuxt[index];
    if (val && typeof val === "object" && !Array.isArray(val)) {
      const out = {};
      for (const [k, v] of Object.entries(val)) out[k] = resolve(v);
      return out;
    }
    if (Array.isArray(val)) return val.map(resolve);
    return val;
  }

  // Find movie metadata, seasons, cast, reviews
  let movieDict = null;
  let seasons = [];
  let topCast = [];
  let userReviews = [];

  for (let i = 0; i < nuxt.length; i++) {
    const resolved = resolve(i);
    if (!resolved || typeof resolved !== "object" || Array.isArray(resolved)) continue;

    if (resolved.subjectId && resolved.title && resolved.duration && !movieDict) {
      movieDict = resolved;
    }
    if (resolved.seasons) seasons = resolved.seasons;
    if (resolved.stars) topCast = resolved.stars;
    if (
      resolved.items &&
      Array.isArray(resolved.items) &&
      resolved.items.some((it) => it && typeof it === "object" && it.content)
    ) {
      userReviews = resolved.items;
    }
  }

  if (!movieDict) return json({ error: "Could not extract movie metadata" }, 404);

  // Collect stream URLs from raw data
  const mp4Urls = nuxt.filter((v) => typeof v === "string" && v.includes(".mp4"));
  const hlsUrls = nuxt.filter(
    (v) => typeof v === "string" && (v.includes(".m3u8") || v.includes("/m3u8/"))
  );

  return json({
    slug,
    source: pageUrl,
    metadata: {
      id: movieDict.subjectId,
      title: movieDict.title,
      description: movieDict.description,
      release_date: movieDict.releaseDate,
      duration: movieDict.duration,
      genre: movieDict.genre,
      country: movieDict.countryName,
      imdb_rating: movieDict.imdbRatingValue,
      poster:
        movieDict.cover && typeof movieDict.cover === "object"
          ? movieDict.cover.url
          : null,
      badge: movieDict.corner,
      dubs: movieDict.dubs || [],
      top_cast: topCast,
      seasons,
      user_reviews: userReviews
        .filter((r) => r && typeof r === "object" && r.content)
        .map((r) => ({
          user: r.user?.nickname || null,
          content: r.content,
          created_at: r.createdAt || null,
        })),
    },
    streams: { mp4: mp4Urls, hls: hlsUrls },
  });
}

// ══════════════════════════════════════════════════════════════════
// GET /episodes/{slug}  — episode list from detail page NUXT
// ══════════════════════════════════════════════════════════════════

async function handleEpisodes(slug) {
  let nuxt;
  let lastErr;
  for (const host of cfg().SITE_HOSTS) {
    try {
      nuxt = await fetchNuxtData(`${host}/detail/${slug}`);
      break;
    } catch (err) {
      lastErr = err;
    }
  }
  if (!nuxt) {
    return json({ error: lastErr?.message || "Movie/Series not found" }, 404);
  }

  const resolve = resolveNuxt(nuxt);
  let subjectId = null;
  let seasonsData = [];

  for (let i = 0; i < nuxt.length; i++) {
    const v = resolve(i);
    if (!v || typeof v !== "object" || Array.isArray(v)) continue;

    if (!subjectId && v.subjectId && v.title) subjectId = String(v.subjectId);

    if (Array.isArray(v.seasons) && v.seasons.length && v.seasons[0]?.maxEp != null) {
      seasonsData = v.seasons;
    }
    if (v.resource?.seasons?.length && v.resource.seasons[0]?.maxEp != null) {
      seasonsData = v.resource.seasons;
    }
  }

  // Movies often ship a dummy season { se: 0, maxEp: 0 } — treat as no seasons.
  const usable = (seasonsData || []).filter((s) => Number(s?.maxEp) > 0);
  if (!usable.length) {
    return json({
      slug,
      subject_id: subjectId,
      message: "No seasons/episodes found. This might be a movie.",
      is_movie: true,
      seasons: [],
    });
  }

  const seasons = usable.map((s) => {
    const epCount = Number(s.maxEp) || 0;
    const episodes = [];
    for (let i = 1; i <= epCount; i++) {
      episodes.push({
        name: `Episode ${i}`,
        ep: i,
        se: s.se,
        watch_url: subjectId
          ? `/watch/${subjectId}?detail_path=${encodeURIComponent(slug)}&se=${s.se}&ep=${i}`
          : null,
        stream_api_url: subjectId
          ? `/api/stream/${subjectId}?detail_path=${encodeURIComponent(slug)}&se=${s.se}&ep=${i}`
          : null,
      });
    }
    return {
      season: s.se,
      episode_count: epCount,
      episodes,
    };
  });

  return json({
    slug,
    subject_id: subjectId,
    total_seasons: seasons.length,
    is_movie: false,
    seasons,
  });
}

// ══════════════════════════════════════════════════════════════════
// GET /api/stream/{subject_id}  — raw stream URLs
// ══════════════════════════════════════════════════════════════════

async function discoverDomain() {
  try {
    const resp = await fetchWithRetry(
      `${cfg().H5_API}${cfg().H5_BFF_PATH}/media-player/get-domain`,
      { headers: { "User-Agent": cfg().USER_AGENT, "X-Client-Type": "h5" } }
    );
    if (resp.ok) {
      const d = await resp.json();
      const domain = String(d.data || cfg().DEFAULT_DOMAIN).replace(/\/+$/, "");
      if (domain) return domain;
    }
  } catch {}
  return cfg().DEFAULT_DOMAIN;
}

function isTrailerUrl(url) {
  return cfg().isTrailerUrl(url);
}

async function fetchStreamsFromDetailPage(detailPath) {
  // Detail pages usually only embed preview/trailer clips — skip those.
  for (const host of cfg().SITE_HOSTS) {
    try {
      const nuxt = await fetchNuxtData(`${host}/detail/${detailPath}`);
      const urls = [
        ...new Set(
          nuxt.filter(
            (v) =>
              typeof v === "string" &&
              /^https?:\/\//i.test(v) &&
              (/\.mp4(\?|$)/i.test(v) || /\.m3u8(\?|$)/i.test(v) || v.includes("/m3u8/"))
          )
        ),
      ].filter((u) => !isTrailerUrl(u));
      if (!urls.length) continue;
      return {
        domain: host,
        streams: urls.map((url, i) => ({
          format: /\.m3u8/i.test(url) ? "HLS" : "MP4",
          id: String(i),
          url,
          resolutions: String(1080 - i * 180),
          size: null,
        })),
      };
    } catch {
      /* try next host */
    }
  }
  return null;
}

async function playOnHost(host, subjectId, detailPath, se, ep) {
  const playUrl = cfg().playUrl(host, subjectId, detailPath, se, ep);
  const resp = await fetch(playUrl, {
    headers: {
      accept: "application/json",
      referer: `${host}/spa/videoPlayPage/movies/${detailPath}`,
      origin: host,
      "x-client-info": JSON.stringify({ timezone: cfg().CLIENT_TIMEZONE }),
      "x-client-type": cfg().CLIENT_TYPE,
      "User-Agent": cfg().USER_AGENT,
    },
  });
  if (resp.status === 429) {
    const err = new Error("Play API returned 429");
    err.status = 429;
    throw err;
  }
  if (!resp.ok) throw new Error(`Play API returned ${resp.status}`);
  const body = await resp.json();
  return (body?.data?.streams || []).filter((s) => s?.url && !isTrailerUrl(s.url));
}

function clientPlayUrls(subjectId, detailPath, se, ep) {
  return cfg().PLAY_HOSTS.map((host) =>
    cfg().playUrl(host, subjectId, detailPath, se, ep)
  );
}

async function fetchStreams(domain, subjectId, detailPath, se, ep) {
  // Prefer one reliable host first; only fall through on failure to reduce 429 pressure.
  const candidates = [...cfg().PLAY_HOSTS, domain, cfg().DEFAULT_DOMAIN].filter(
    (v, i, arr) => v && arr.indexOf(v) === i
  );

  const attempt = { se: String(se), ep: String(ep) };
  let lastErr;
  let saw429 = false;

  for (let i = 0; i < candidates.length; i++) {
    const host = candidates[i];
    try {
      const streams = await playOnHost(
        host,
        subjectId,
        detailPath,
        attempt.se,
        attempt.ep
      );
      if (streams.length) {
        return {
          streams,
          domain: host,
          se: attempt.se,
          ep: attempt.ep,
        };
      }
      // Empty streams with 200 usually means bad Origin/geo — try next host
      lastErr = new Error(`No streams from ${host}`);
    } catch (err) {
      lastErr = err;
      if (err.status === 429 || String(err.message || "").includes("429")) {
        saw429 = true;
        await sleep(1200 + i * 800);
      }
    }
  }

  const err =
    lastErr || new Error("No full streams found (play API unavailable)");
  if (saw429) {
    err.status = 429;
    err.message =
      "Play API rate-limited from Cloudflare. Wait a few seconds and tap Play again.";
  }
  throw err;
}

async function handleStreamApi(subjectId, params) {
  const detailPath = params.get("detail_path");
  if (!detailPath) return json({ error: "detail_path is required" }, 400);
  const se = params.get("se") || "0";
  const ep = params.get("ep") || "0";

  const cacheKey = `https://stream-cache.local/${subjectId}/${detailPath}/${se}/${ep}`;
  try {
    const hit = await caches.default.match(cacheKey);
    if (hit) return hit;
  } catch {
    /* ignore */
  }

  try {
    const domain = await discoverDomain();
    const {
      streams,
      domain: streamDomain,
      se: resolvedSe,
      ep: resolvedEp,
    } = await fetchStreams(domain, subjectId, detailPath, se, ep);

    if (!streams.length) return json({ error: "No streams found" }, 404);

    const formatted = streams
      .map((s) => ({
        resolution: s.resolutions ? `${s.resolutions}p` : "Unknown",
        format: s.format || null,
        url: s.url,
        size_bytes: s.size || null,
        id: s.id || null,
      }))
      .sort((a, b) => {
        const ra = parseInt(a.resolution) || 0;
        const rb = parseInt(b.resolution) || 0;
        return rb - ra;
      });

    const payload = {
      subject_id: subjectId,
      detail_path: detailPath,
      season: parseInt(resolvedSe ?? se, 10),
      episode: parseInt(resolvedEp ?? ep, 10),
      stream_domain: streamDomain,
      count: formatted.length,
      sources: formatted,
      client_play: clientPlayUrls(subjectId, detailPath, resolvedSe ?? se, resolvedEp ?? ep),
      subtitles: [],
    };
    const response = json(payload);
    try {
      const toCache = new Response(JSON.stringify(payload, null, 2), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=300",
          ...activeCorsHeaders(),
        },
      });
      await caches.default.put(cacheKey, toCache);
    } catch {
      /* ignore */
    }
    return response;
  } catch (err) {
    const status = err.status === 429 ? 429 : 500;
    return json(
      {
        error: err.message || "Stream failed",
        code: status === 429 ? "RATE_LIMITED" : "STREAM_ERROR",
        client_play: clientPlayUrls(subjectId, detailPath, se, ep),
        retry_after_ms: status === 429 ? 2500 : 1000,
      },
      status
    );
  }
}

// ══════════════════════════════════════════════════════════════════
// GET /watch/{subject_id}  — zero-buffer video streaming
// ══════════════════════════════════════════════════════════════════

async function handleWatch(subjectId, params, request) {
  const detailPath = params.get("detail_path");
  if (!detailPath) return json({ error: "detail_path is required" }, 400);
  const se = params.get("se") || "0";
  const ep = params.get("ep") || "0";
  const resolution = parseInt(params.get("resolution") || "0", 10);

  const discovered = await discoverDomain();
  const { streams, domain } = await fetchStreams(
    discovered,
    subjectId,
    detailPath,
    se,
    ep
  );
  if (!streams.length) return json({ error: "No streams found" }, 404);

  // Pick resolution
  let stream;
  if (resolution > 0) {
    stream =
      streams.find((s) => parseInt(s.resolutions) === resolution) ||
      streams[streams.length - 1];
  } else {
    stream = streams.sort(
      (a, b) => parseInt(b.resolutions) - parseInt(a.resolutions)
    )[0];
  }

  const streamUrl = stream.url;
  if (!streamUrl) return json({ error: "Stream URL is empty" }, 404);

  // Build CDN headers
  const cdnHeaders = {
    Referer: `${domain}/`,
    Origin: domain,
    Accept: "*/*",
    "User-Agent": cfg().USER_AGENT,
  };

  // Forward Range header for seeking
  const rangeHeader = request.headers.get("Range");
  if (rangeHeader) cdnHeaders["Range"] = rangeHeader;

  const vidResp = await fetch(streamUrl, {
    headers: cdnHeaders,
    redirect: "follow",
  });

  if (vidResp.status !== 200 && vidResp.status !== 206) {
    const errBody = await vidResp.text();
    return json(
      { error: `CDN returned ${vidResp.status}`, detail: errBody.slice(0, 200) },
      vidResp.status
    );
  }

  // Response headers
  const respHeaders = new Headers(activeCorsHeaders());
  respHeaders.set("Accept-Ranges", "bytes");
  respHeaders.set(
    "Content-Type",
    vidResp.headers.get("Content-Type") || "video/mp4"
  );
  respHeaders.set("X-Stream-Resolution", `${stream.resolutions}p`);
  respHeaders.set("Cache-Control", "no-store");

  const cl = vidResp.headers.get("Content-Length");
  if (cl) respHeaders.set("Content-Length", cl);
  const cr = vidResp.headers.get("Content-Range");
  if (cr) respHeaders.set("Content-Range", cr);

  // Pipe ReadableStream straight through — ZERO buffering
  return new Response(vidResp.body, {
    status: vidResp.status,
    headers: respHeaders,
  });
}

// ══════════════════════════════════════════════════════════════════
// Subtitles (SubDL proxy)
// ══════════════════════════════════════════════════════════════════

async function handleSubtitleSearch(params, env) {
  try {
    if (!subdlConfigured(env)) {
      return json(
        {
          ok: false,
          configured: false,
          error: "Online subtitles aren’t set up yet",
          results: [],
        },
        200
      );
    }

    const query = params.get("query") || "";
    const season = params.get("season") || "";
    const episode = params.get("episode") || "";
    const languages = params.get("languages") || "en";
    const type = params.get("type") || "";

    if (!query.trim()) {
      return json({ ok: false, error: "query is required", results: [] }, 400);
    }

    const results = await searchSubdl(env, {
      query: query.trim(),
      season,
      episode,
      languages,
      type: type || undefined,
    });

    return json({
      ok: true,
      configured: true,
      provider: "subdl",
      count: results.length,
      results,
    });
  } catch (err) {
    console.error("[subtitles/search]", err);
    return json(
      {
        ok: false,
        configured: subdlConfigured(env),
        error: "Subtitle search didn’t work",
        results: [],
      },
      502
    );
  }
}

async function handleSubtitleDownload(request, env) {
  try {
    if (!subdlConfigured(env)) {
      return json({ ok: false, error: "Online subtitles aren’t set up yet" }, 400);
    }

    const body = await request.json().catch(() => ({}));
    const fileId = body.file_id;
    if (!fileId) {
      return json({ ok: false, error: "file_id is required" }, 400);
    }
    if (body.download_url) {
      return json({ ok: false, error: "Use file_id from search results" }, 400);
    }

    const { text, file_name } = await downloadSubdl(env, fileId);
    const vtt = toWebVtt(text, file_name);

    return json({
      ok: true,
      provider: "subdl",
      file_name,
      vtt,
      label: String(file_name || "SubDL").replace(/\.(srt|vtt|txt|ass|ssa)$/i, ""),
    });
  } catch (err) {
    console.error("[subtitles/download]", err);
    return json({ ok: false, error: "Couldn’t download that subtitle" }, 502);
  }
}

// ══════════════════════════════════════════════════════════════════
// Device access (Supabase)
// ══════════════════════════════════════════════════════════════════

async function handleAccessVerify(request, env) {
  const body = await request.json().catch(() => ({}));
  try {
    const result = await verifyDeviceAccess(env, body);
    return json(
      { ok: result.allowed, ...result },
      result.allowed ? 200 : 403
    );
  } catch (err) {
    console.error("[access/verify]", err);
    // Supabase / network errors — do NOT treat as "blocked device"
    return json(
      {
        ok: false,
        allowed: true,
        mode: "degraded",
        error: err.message || "Access check failed",
        hint: "Check SUPABASE_URL, SUPABASE_SERVICE_KEY, and that app_devices table exists",
      },
      503
    );
  }
}

async function handleAccessList(request, env) {
  const auth = assertAdmin(env, request);
  if (!auth.ok) return json({ error: auth.error }, 401);
  try {
    const limit = new URL(request.url).searchParams.get("limit");
    const devices = await listDevices(env, { limit });
    return json({ ok: true, devices });
  } catch (err) {
    return json({ error: err.message || "List failed" }, 502);
  }
}

async function handleAccessBlock(request, env) {
  const auth = assertAdmin(env, request);
  if (!auth.ok) return json({ error: auth.error }, 401);
  const body = await request.json().catch(() => ({}));
  try {
    const row = await setDeviceBlocked(env, body);
    return json({ ok: true, device: row });
  } catch (err) {
    return json({ error: err.message || "Block failed" }, 502);
  }
}

async function handleMusicSearch(params) {
  try {
    const result = await musicSearch({
      q: params.get("q") || "",
      limit: params.get("limit") || 20,
    });
    return json({ ok: true, source: "audius", ...result });
  } catch (err) {
    return json({ ok: false, error: err.message || "Search failed" }, 502);
  }
}

async function handleMusicSuggest(params) {
  try {
    const result = await musicSuggest({
      q: params.get("q") || "",
      limit: params.get("limit") || 8,
    });
    return json({ ok: true, source: "audius", ...result });
  } catch (err) {
    return json({ ok: false, error: err.message || "Suggest failed" }, 502);
  }
}

async function handleMusicTrending(params) {
  try {
    const result = await musicTrending({
      limit: params.get("limit") || 20,
    });
    return json({ ok: true, source: "audius", ...result });
  } catch (err) {
    return json({ ok: false, error: err.message || "Trending failed" }, 502);
  }
}

async function handleMusicPlaylistTracks(playlistId, params) {
  try {
    const result = await musicPlaylistTracks(playlistId, {
      limit: params.get("limit") || 50,
    });
    return json({ ok: true, source: "audius", ...result });
  } catch (err) {
    return json({ ok: false, error: err.message || "Playlist failed" }, 502);
  }
}

// ══════════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════════

function json(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json", ...activeCorsHeaders() },
  });
}
