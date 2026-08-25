const app = document.getElementById("app");
const searchForm = document.getElementById("search-form");
const searchInput = document.getElementById("search-input");
const suggestList = document.getElementById("suggest-list");
const detailOverlay = document.getElementById("detail-overlay");
const detailPanel = document.getElementById("detail-panel");
const playerOverlay = document.getElementById("player-overlay");
const player = document.getElementById("player");
const playerStage = document.getElementById("player-stage");
const playerClose = document.getElementById("player-close");
const playerTitle = document.getElementById("player-title");
const qualitySelect = document.getElementById("quality-select");
const playerLoaderSlot = document.getElementById("player-loader-slot");
const playerBigPlay = document.getElementById("player-big-play");
const playerPlayBtn = document.getElementById("player-play");
const playerMuteBtn = document.getElementById("player-mute");
const playerFsBtn = document.getElementById("player-fs");
const playerSeek = document.getElementById("player-seek");
const playerVolume = document.getElementById("player-volume");
const playerTime = document.getElementById("player-time");

const PLAY_RELAY_DEFAULT = "http://127.0.0.1:8788";

function getPlayRelayBase() {
  try {
    const saved = localStorage.getItem("PLAY_RELAY");
    if (saved) return saved.replace(/\/+$/, "");
  } catch {
    /* ignore */
  }
  return PLAY_RELAY_DEFAULT;
}

function playUrlForSource(sourceUrl, relayBase) {
  if (!sourceUrl) return "";
  if (sourceUrl.includes("/api/media?")) return sourceUrl;
  if (!relayBase) return sourceUrl;
  return `${relayBase}/api/media?url=${encodeURIComponent(sourceUrl)}`;
}

async function playRelayAvailable(base) {
  try {
    const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(1200) });
    if (!res.ok) return false;
    const data = await res.json().catch(() => ({}));
    return !!data.ok;
  } catch {
    return false;
  }
}

function playCacheKey(subjectId, se, ep) {
  return `mb:play:${subjectId}:${se}:${ep}`;
}

function readPlayCache(subjectId, se, ep) {
  try {
    const raw = sessionStorage.getItem(playCacheKey(subjectId, se, ep));
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data?.sources?.length) return null;
    if (Date.now() - (data.ts || 0) > 10 * 60 * 1000) return null;
    return data.sources;
  } catch {
    return null;
  }
}

function writePlayCache(subjectId, se, ep, sources) {
  try {
    sessionStorage.setItem(
      playCacheKey(subjectId, se, ep),
      JSON.stringify({ ts: Date.now(), sources })
    );
  } catch {
    /* ignore quota */
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function sourcesFromApiPayload(data) {
  if (!Array.isArray(data?.sources) || !data.sources.length) return [];
  return normalizeStreams(
    data.sources.map((s) => ({
      url: s.url,
      resolutions: String(s.resolution || "").replace(/p$/i, ""),
      format: s.format,
      size: s.size_bytes,
    }))
  );
}

/**
 * Prefer local play relay (localhost) — can set Origin/Referer.
 * Fall back to Cloudflare Worker /api/stream (often 429).
 */
async function resolvePlayback(subjectId, slug, se, ep) {
  const cached = readPlayCache(subjectId, se, ep);
  if (cached?.length) return { sources: cached, host: "cache" };

  const path = `/api/stream/${subjectId}?detail_path=${encodeURIComponent(
    slug
  )}&se=${se}&ep=${ep}`;

  const relay = getPlayRelayBase();
  if (await playRelayAvailable(relay)) {
    try {
      const res = await fetch(`${relay}${path}`);
      const data = await res.json().catch(() => ({}));
      const sources = sourcesFromApiPayload(data);
      if (res.ok && sources.length) {
        writePlayCache(subjectId, se, ep, sources);
        return { sources, host: data.stream_domain || "localhost-relay" };
      }
      if (!res.ok) {
        console.warn("Local relay failed:", data.error || res.status);
      }
    } catch (err) {
      console.warn("Local relay unreachable:", err.message);
    }
  }

  // Cloudflare Worker fallback (may rate-limit)
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await sleep(2000 * attempt);
    try {
      const res = await fetch(path);
      const data = await res.json().catch(() => ({}));
      const sources = sourcesFromApiPayload(data);
      if (res.ok && sources.length) {
        writePlayCache(subjectId, se, ep, sources);
        return { sources, host: data.stream_domain || "worker" };
      }
      if (res.status === 429 || data.code === "RATE_LIMITED") {
        lastErr = new Error(data.error || "Rate limited — retrying…");
        continue;
      }
      lastErr = new Error(data.error || `Stream failed (${res.status})`);
    } catch (err) {
      lastErr = err;
    }
  }

  throw (
    lastErr ||
    new Error(
      `Could not resolve stream. Start local relay: npm run play:relay (${PLAY_RELAY_DEFAULT})`
    )
  );
}

let suggestTimer = null;
let suggestController = null;
/** @type {{ url: string, resolution: string, format: string, size: number|null }[]} */
let currentSources = [];
let currentTimeBeforeQualitySwitch = 0;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function loaderHtml(message = "Loading...") {
  return `
    <div class="loader" role="status" aria-live="polite">
      <div class="spinner" aria-hidden="true"></div>
      <p>${escapeHtml(message)}</p>
    </div>
  `;
}

async function api(path) {
  const res = await fetch(path);
  const contentType = res.headers.get("content-type") || "";
  if (!res.ok) {
    if (contentType.includes("application/json")) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Request failed (${res.status})`);
    }
    throw new Error(`Request failed (${res.status})`);
  }
  return res.json();
}

function poster(item) {
  if (item.poster_url) {
    return `<img src="${escapeHtml(item.poster_url)}" alt="${escapeHtml(item.name)}" loading="lazy" />`;
  }
  return `<div class="poster-fallback">${escapeHtml(item.name || "No poster")}</div>`;
}

function card(item) {
  const slug = item.slug || "";
  return `
    <article class="card" data-slug="${escapeHtml(slug)}" tabindex="0" role="button">
      <div class="poster-wrap">
        ${poster(item)}
        ${item.badge ? `<span class="badge">${escapeHtml(item.badge)}</span>` : ""}
        ${item.rank ? `<span class="rank">#${escapeHtml(item.rank)}</span>` : ""}
      </div>
      <h3>${escapeHtml(item.name || "Untitled")}</h3>
      ${
        item.year || item.rating
          ? `<p class="card-meta">${escapeHtml(
              [item.year, item.rating ? `★ ${item.rating}` : ""].filter(Boolean).join(" · ")
            )}</p>`
          : ""
      }
    </article>
  `;
}

function bindCards(root) {
  root.querySelectorAll(".card[data-slug]").forEach((el) => {
    const open = () => {
      const slug = el.getAttribute("data-slug");
      if (slug) openDetail(slug);
    };
    el.addEventListener("click", open);
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
    });
  });
}

function setNav(route) {
  document.querySelectorAll(".nav a").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === route);
  });
}

function hideSuggest() {
  suggestList.hidden = true;
  suggestList.innerHTML = "";
}

function renderSuggest(items) {
  if (!items.length) {
    hideSuggest();
    return;
  }
  suggestList.innerHTML = items
    .map(
      (word, i) =>
        `<li role="option" data-index="${i}"><button type="button">${escapeHtml(word)}</button></li>`
    )
    .join("");
  suggestList.hidden = false;
  suggestList.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const q = btn.textContent.trim();
      searchInput.value = q;
      hideSuggest();
      location.hash = `/search?q=${encodeURIComponent(q)}`;
    });
  });
}

async function fetchSuggest(q) {
  if (suggestController) suggestController.abort();
  suggestController = new AbortController();
  try {
    const res = await fetch(`/search/suggest?q=${encodeURIComponent(q)}`, {
      signal: suggestController.signal,
    });
    if (!res.ok) return;
    const data = await res.json();
    renderSuggest(data.suggestions || []);
  } catch (err) {
    if (err.name !== "AbortError") hideSuggest();
  }
}

function renderRows(sections, { hero = true } = {}) {
  const usable = (sections || []).filter((s) => s.movies?.length);
  const banner = usable.find((s) => s.section?.toLowerCase() === "banner");
  const rows = usable.filter((s) => s !== banner);
  const featured = banner?.movies?.[0] || rows[0]?.movies?.[0];

  if (!usable.length) {
    app.innerHTML = `<p class="status">No titles found.</p>`;
    return;
  }

  let html = "";
  if (hero && featured) {
    html += `
      <section class="hero">
        ${featured.poster_url ? `<img src="${escapeHtml(featured.poster_url)}" alt="" />` : ""}
        <div class="hero-copy">
          <p class="eyebrow">Featured</p>
          <h1>${escapeHtml(featured.name)}</h1>
          <p>${featured.badge ? escapeHtml(featured.badge) : "Featured pick"}</p>
          <button class="play-btn" data-slug="${escapeHtml(featured.slug || "")}">View details</button>
        </div>
      </section>
    `;
  }

  html += rows
    .map(
      (section) => `
        <section class="row">
          <div class="row-head">
            <h2>${escapeHtml(section.section)}</h2>
            <span>${section.count || section.movies.length} titles</span>
          </div>
          <div class="scroller">
            ${section.movies.map(card).join("")}
          </div>
        </section>
      `
    )
    .join("");

  app.innerHTML = html;
  bindCards(app);
  app.querySelector(".play-btn")?.addEventListener("click", (e) => {
    const slug = e.currentTarget.getAttribute("data-slug");
    if (slug) openDetail(slug);
  });
}

function renderGrid(title, movies) {
  if (!movies.length) {
    app.innerHTML = `
      <div class="row-head"><h2>${escapeHtml(title)}</h2><span>0 titles</span></div>
      <p class="status">No results. Try another search.</p>
    `;
    return;
  }
  app.innerHTML = `
    <div class="row-head"><h2>${escapeHtml(title)}</h2><span>${movies.length} titles</span></div>
    <div class="grid">${movies.map(card).join("")}</div>
  `;
  bindCards(app);
}

async function loadHome() {
  setNav("home");
  app.innerHTML = loaderHtml("Loading homepage...");
  const data = await api("/home");
  renderRows(data.sections || []);
}

async function loadCategory(path, route, title) {
  setNav(route);
  app.innerHTML = loaderHtml(`Loading ${title}...`);
  const data = await api(path);
  if (data.sections) renderRows(data.sections, { hero: false });
  else renderGrid(title, data.movies || []);
}

async function loadSearch(query) {
  setNav("");
  hideSuggest();
  if (!query) {
    app.innerHTML = `<p class="status">Type something to search.</p>`;
    return;
  }
  app.innerHTML = loaderHtml(`Searching "${query}"...`);
  const data = await api(`/search?q=${encodeURIComponent(query)}`);
  renderGrid(`Results for "${query}"`, data.movies || []);
}

function defaultEpisode(seasons) {
  const first = seasons?.[0]?.episodes?.[0];
  if (first) return { se: String(first.se ?? 1), ep: String(first.ep ?? 1) };
  return { se: "0", ep: "0" };
}

function isTrailerUrl(url) {
  if (!url) return true;
  const u = String(url).toLowerCase();
  return (
    u.includes("-sd.mp4") ||
    u.includes("-ld.mp4") ||
    u.includes("/vone/") ||
    u.includes("trailer") ||
    u.includes("macdn.aoneroom.com/media/")
  );
}

function formatSize(bytes) {
  const n = Number(bytes);
  if (!n || n < 1) return "";
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(0)} MB`;
  return `${Math.round(n / 1e3)} KB`;
}

function normalizeStreams(raw = []) {
  const mapped = raw
    .filter((s) => s?.url && !isTrailerUrl(s.url))
    .map((s) => {
      const res = parseInt(s.resolutions || s.resolution || "0", 10) || 0;
      return {
        url: s.url,
        resolution: res ? `${res}p` : "Auto",
        height: res,
        format: s.format || "MP4",
        size: s.size ? Number(s.size) : null,
      };
    });

  // Dedupe by resolution, keep largest file for that height
  const byRes = new Map();
  for (const s of mapped) {
    const key = s.height || s.url;
    const prev = byRes.get(key);
    if (!prev || (s.size || 0) > (prev.size || 0)) byRes.set(key, s);
  }

  return [...byRes.values()].sort((a, b) => b.height - a.height);
}

function renderEpisodeButtons(season) {
  return (season?.episodes || [])
    .slice(0, 100)
    .map(
      (ep) =>
        `<button type="button" class="ep-btn" data-se="${ep.se}" data-ep="${ep.ep}">Ep ${ep.ep}</button>`
    )
    .join("");
}

function fillQualitySelect(sources, preferredHeight = 0) {
  if (!sources.length) {
    qualitySelect.hidden = true;
    qualitySelect.innerHTML = "";
    return;
  }
  qualitySelect.innerHTML = sources
    .map((s, i) => {
      const size = formatSize(s.size);
      const label = size ? `${s.resolution} · ${size}` : s.resolution;
      return `<option value="${i}">${escapeHtml(label)}</option>`;
    })
    .join("");

  let index = 0;
  if (preferredHeight > 0) {
    const match = sources.findIndex((s) => s.height === preferredHeight);
    if (match >= 0) index = match;
  } else {
    // Prefer 720p if available, else highest
    const mid = sources.findIndex((s) => s.height === 720);
    if (mid >= 0) {
      index = mid;
    } else {
      const sd = sources.findIndex((s) => s.height === 480);
      index = sd >= 0 ? sd : 0;
    }
  }
  qualitySelect.value = String(index);
  qualitySelect.hidden = false;
}

function formatClock(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function syncPlayerChrome() {
  const playing = !player.paused && !player.ended;
  playerPlayBtn.textContent = playing ? "❚❚" : "▶";
  playerPlayBtn.setAttribute("aria-label", playing ? "Pause" : "Play");
  playerBigPlay.hidden = playing;
  playerMuteBtn.textContent = player.muted || player.volume === 0 ? "🔇" : "🔊";
  if (!seeking) {
    const dur = player.duration;
    if (Number.isFinite(dur) && dur > 0) {
      playerSeek.value = String(Math.round((player.currentTime / dur) * 1000));
    }
  }
  playerTime.textContent = `${formatClock(player.currentTime)} / ${formatClock(
    player.duration
  )}`;
}

async function togglePlay() {
  if (player.paused || player.ended) {
    try {
      await player.play();
    } catch {
      playerBigPlay.hidden = false;
    }
  } else {
    player.pause();
  }
  syncPlayerChrome();
}

function toggleMute() {
  player.muted = !player.muted;
  syncPlayerChrome();
}

async function toggleFullscreen() {
  const el = playerStage;
  try {
    if (document.fullscreenElement === el) {
      await document.exitFullscreen();
    } else if (el.requestFullscreen) {
      await el.requestFullscreen();
    }
  } catch {
    /* ignore */
  }
}

let seeking = false;

playerPlayBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  togglePlay();
});
playerBigPlay.addEventListener("click", (e) => {
  e.stopPropagation();
  togglePlay();
});
playerMuteBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  toggleMute();
});
playerFsBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  toggleFullscreen();
});
player.addEventListener("click", () => togglePlay());

playerSeek.addEventListener("pointerdown", () => {
  seeking = true;
});
playerSeek.addEventListener("pointerup", () => {
  seeking = false;
});
playerSeek.addEventListener("change", () => {
  seeking = false;
});
playerSeek.addEventListener("input", () => {
  const dur = player.duration;
  if (!Number.isFinite(dur) || dur <= 0) return;
  player.currentTime = (Number(playerSeek.value) / 1000) * dur;
  playerTime.textContent = `${formatClock(player.currentTime)} / ${formatClock(
    dur
  )}`;
});

playerVolume.addEventListener("input", () => {
  player.volume = Number(playerVolume.value);
  player.muted = player.volume === 0;
  syncPlayerChrome();
});

[
  "play",
  "pause",
  "ended",
  "timeupdate",
  "loadedmetadata",
  "volumechange",
  "seeking",
  "seeked",
].forEach((evt) => player.addEventListener(evt, syncPlayerChrome));

function showPlayerLoader(message) {
  playerLoaderSlot.innerHTML = loaderHtml(message);
}

function hidePlayerLoader() {
  playerLoaderSlot.innerHTML = "";
}

function openPlayerShell(titleText) {
  playerOverlay.hidden = false;
  playerOverlay.removeAttribute("hidden");
  playerTitle.textContent = titleText || "";
  playerBigPlay.hidden = true;
  playerSeek.value = "0";
  playerTime.textContent = "0:00 / 0:00";
  showPlayerLoader("Resolving stream...");
}

async function startSource(source, { resume = false } = {}) {
  if (!source?.url) throw new Error("Empty stream URL");
  const resumeAt = resume ? currentTimeBeforeQualitySwitch : 0;
  const relay = getPlayRelayBase();
  const useRelay = await playRelayAvailable(relay);
  const playUrl = playUrlForSource(source.url, useRelay ? relay : "");

  showPlayerLoader(
    `Loading ${source.resolution}…${useRelay ? " (via localhost)" : ""}`
  );

  await new Promise((resolve, reject) => {
    const cleanup = () => {
      player.removeEventListener("loadeddata", onReady);
      player.removeEventListener("canplay", onReady);
      player.removeEventListener("error", onError);
    };
    const onReady = async () => {
      cleanup();
      if (resumeAt > 0 && Number.isFinite(resumeAt)) {
        try {
          player.currentTime = resumeAt;
        } catch {
          /* ignore */
        }
      }
      hidePlayerLoader();
      syncPlayerChrome();
      try {
        await player.play();
      } catch {
        playerBigPlay.hidden = false;
      }
      syncPlayerChrome();
      resolve();
    };
    const onError = () => {
      cleanup();
      const mediaErr = player.error;
      reject(
        new Error(
          mediaErr?.message ||
            "Video failed to load (CDN blocked the browser request)"
        )
      );
    };
    player.addEventListener("loadeddata", onReady);
    player.addEventListener("canplay", onReady);
    player.addEventListener("error", onError);
    player.src = playUrl;
    player.load();
  });
}

async function openDetail(slug) {
  detailOverlay.hidden = false;
  detailOverlay.removeAttribute("hidden");
  detailPanel.innerHTML = loaderHtml("Loading details...");
  try {
    const [detail, episodes] = await Promise.all([
      api(`/detail/${encodeURIComponent(slug)}`),
      api(`/episodes/${encodeURIComponent(slug)}`).catch(() => null),
    ]);
    const meta = detail.metadata || {};
    const seasons = episodes?.seasons || [];
    const subjectId = meta.id || episodes?.subject_id;
    const defaults = defaultEpisode(seasons);
    const isSeries = seasons.some((s) => (s.episodes || []).length > 0);
    let selectedSe = defaults.se;
    let selectedEp = defaults.ep;
    const activeSeason =
      seasons.find((s) => String(s.season) === String(selectedSe)) || seasons[0];

    const seasonOptions = seasons
      .map(
        (s) =>
          `<option value="${escapeHtml(s.season)}" ${
            String(s.season) === String(selectedSe) ? "selected" : ""
          }>Season ${escapeHtml(s.season)} (${
            s.episode_count || s.episodes?.length || 0
          } eps)</option>`
      )
      .join("");

    detailPanel.innerHTML = `
      <button class="close-btn detail-close" type="button" id="detail-close">Close</button>
      <div class="detail-top">
        ${meta.poster ? `<img src="${escapeHtml(meta.poster)}" alt="" />` : ""}
        <div>
          <h2>${escapeHtml(meta.title || slug)}</h2>
          <p class="meta">
            ${[meta.release_date, meta.genre, meta.imdb_rating ? `IMDb ${meta.imdb_rating}` : ""]
              .filter(Boolean)
              .map(escapeHtml)
              .join(" · ")}
          </p>
          <p class="desc">${escapeHtml(meta.description || "No description available.")}</p>
          <div class="detail-actions">
            <button class="play-btn" id="play-now" ${subjectId ? "" : "disabled"}>
              ${isSeries ? `Play S${selectedSe}E${selectedEp}` : "Play"}
            </button>
            <span class="play-status" id="play-status" hidden></span>
          </div>
          ${
            isSeries
              ? `
            <div class="season-bar">
              <label for="season-select">Season</label>
              <select id="season-select">${seasonOptions}</select>
            </div>
            <h3 class="eps-title">Episodes</h3>
            <div class="episodes" id="episode-list">${renderEpisodeButtons(activeSeason)}</div>
          `
              : ""
          }
        </div>
      </div>
    `;

    detailPanel.querySelector("#detail-close")?.addEventListener("click", () => {
      detailOverlay.hidden = true;
    });

    const playStatus = detailPanel.querySelector("#play-status");
    const playBtn = detailPanel.querySelector("#play-now");
    const episodeList = detailPanel.querySelector("#episode-list");
    const seasonSelect = detailPanel.querySelector("#season-select");

    const setPlayStatus = (text, isError = false) => {
      if (!playStatus) return;
      if (!text) {
        playStatus.hidden = true;
        playStatus.textContent = "";
        return;
      }
      playStatus.hidden = false;
      playStatus.textContent = text;
      playStatus.classList.toggle("is-error", isError);
    };

    const updatePlayLabel = () => {
      if (!playBtn) return;
      playBtn.textContent = isSeries ? `Play S${selectedSe}E${selectedEp}` : "Play";
    };

    const markActiveEpisode = () => {
      episodeList?.querySelectorAll(".ep-btn").forEach((btn) => {
        btn.classList.toggle(
          "active",
          btn.dataset.se === String(selectedSe) &&
            btn.dataset.ep === String(selectedEp)
        );
      });
    };

    const bindEpisodeButtons = () => {
      episodeList?.querySelectorAll(".ep-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          selectedSe = String(btn.dataset.se);
          selectedEp = String(btn.dataset.ep);
          updatePlayLabel();
          markActiveEpisode();
          play(selectedSe, selectedEp);
        });
      });
      markActiveEpisode();
    };

    seasonSelect?.addEventListener("change", () => {
      selectedSe = String(seasonSelect.value);
      const season =
        seasons.find((s) => String(s.season) === selectedSe) || seasons[0];
      selectedEp = String(season?.episodes?.[0]?.ep || 1);
      if (episodeList) episodeList.innerHTML = renderEpisodeButtons(season);
      updatePlayLabel();
      bindEpisodeButtons();
    });

    const play = async (se = selectedSe, ep = selectedEp) => {
      if (!subjectId) {
        setPlayStatus("Missing subject id — cannot stream.", true);
        return;
      }

      selectedSe = String(se);
      selectedEp = String(ep);
      updatePlayLabel();
      markActiveEpisode();
      setPlayStatus("Resolving stream...");
      if (playBtn) playBtn.disabled = true;

      const titleText = isSeries
        ? `${meta.title || slug} · S${selectedSe}E${selectedEp}`
        : meta.title || slug;
      openPlayerShell(titleText);
      showPlayerLoader("Getting stream (via server)...");

      try {
        // Worker sets Origin/Referer MovieBox requires. Browser-direct returns empty streams.
        const { sources } = await resolvePlayback(subjectId, slug, se, ep);
        currentSources = sources;
        fillQualitySelect(sources);
        const idx = Number(qualitySelect.value) || 0;
        const source = sources[idx] || sources[0];
        await startSource(source, { resume: false });
        setPlayStatus(
          `Playing ${source.resolution}${
            sources.length > 1 ? " — change quality above the player" : ""
          }`
        );
      } catch (err) {
        hidePlayerLoader();
        closePlayer();
        setPlayStatus(
          `${err.message || "Playback failed"}. Wait a few seconds and tap Play again.`,
          true
        );
      } finally {
        if (playBtn) playBtn.disabled = false;
      }
    };

    playBtn?.addEventListener("click", () => play(selectedSe, selectedEp));
    bindEpisodeButtons();
  } catch (err) {
    detailPanel.innerHTML = `
      <button class="close-btn detail-close" type="button" id="detail-close">Close</button>
      <p class="error">${escapeHtml(err.message)}</p>
    `;
    detailPanel.querySelector("#detail-close")?.addEventListener("click", () => {
      detailOverlay.hidden = true;
    });
  }
}

async function route() {
  const hash = location.hash.replace(/^#/, "") || "/home";
  const [path, queryString] = hash.split("?");
  const params = new URLSearchParams(queryString || "");

  try {
    if (path === "/home" || path === "/") await loadHome();
    else if (path === "/movies") await loadCategory("/movies", "movies", "Movies");
    else if (path === "/tv-series")
      await loadCategory("/tv-series", "tv-series", "TV Series");
    else if (path === "/animation")
      await loadCategory("/animation", "animation", "Animation");
    else if (path === "/ranking") await loadCategory("/ranking", "ranking", "Ranking");
    else if (path === "/search") await loadSearch(params.get("q") || "");
    else await loadHome();
  } catch (err) {
    app.innerHTML = `<p class="error">${escapeHtml(err.message)}</p>`;
  }
}

searchInput.addEventListener("input", () => {
  const q = searchInput.value.trim();
  clearTimeout(suggestTimer);
  if (q.length < 2) {
    hideSuggest();
    return;
  }
  suggestTimer = setTimeout(() => fetchSuggest(q), 220);
});

searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Escape") hideSuggest();
});

searchForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const q = searchInput.value.trim();
  if (!q) return;
  hideSuggest();
  location.hash = `/search?q=${encodeURIComponent(q)}`;
});

document.addEventListener("click", (e) => {
  if (!e.target.closest(".search")) hideSuggest();
});

detailOverlay.addEventListener("click", (e) => {
  if (e.target === detailOverlay) detailOverlay.hidden = true;
});

function closePlayer() {
  try {
    player.pause();
  } catch {
    /* ignore */
  }
  player.removeAttribute("src");
  player.removeAttribute("srcObject");
  try {
    player.load();
  } catch {
    /* ignore */
  }
  currentSources = [];
  qualitySelect.hidden = true;
  qualitySelect.innerHTML = "";
  playerTitle.textContent = "";
  hidePlayerLoader();
  playerOverlay.hidden = true;
  playerOverlay.setAttribute("hidden", "");
}

playerClose.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  closePlayer();
});

playerOverlay.addEventListener("click", (e) => {
  if (e.target === playerOverlay) closePlayer();
});

qualitySelect.addEventListener("change", async () => {
  const idx = Number(qualitySelect.value);
  const source = currentSources[idx];
  if (!source) return;
  currentTimeBeforeQualitySwitch = player.currentTime || 0;
  showPlayerLoader(`Switching to ${source.resolution}...`);
  try {
    await startSource(source, { resume: true });
  } catch (err) {
    hidePlayerLoader();
    console.error(err);
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (!playerOverlay.hidden) {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
        return;
      }
      closePlayer();
      return;
    }
    if (!detailOverlay.hidden) detailOverlay.hidden = true;
    return;
  }

  if (playerOverlay.hidden) return;
  const tag = (e.target && e.target.tagName) || "";
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

  if (e.key === " " || e.key === "k" || e.key === "K") {
    e.preventDefault();
    togglePlay();
  } else if (e.key === "ArrowRight") {
    e.preventDefault();
    player.currentTime = Math.min(
      (player.currentTime || 0) + 10,
      player.duration || Infinity
    );
  } else if (e.key === "ArrowLeft") {
    e.preventDefault();
    player.currentTime = Math.max((player.currentTime || 0) - 10, 0);
  } else if (e.key === "f" || e.key === "F") {
    e.preventDefault();
    toggleFullscreen();
  } else if (e.key === "m" || e.key === "M") {
    e.preventDefault();
    toggleMute();
  }
});

window.addEventListener("hashchange", route);
route();
