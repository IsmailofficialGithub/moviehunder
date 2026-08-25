/**
 * All upstream hosts / paths / headers come from env bindings.
 * Worker: wrangler `.dev.vars` (local) or dashboard secrets.
 * Play relay: `server/.env`
 */

function pick(env, key, fallback = "") {
  const v = env?.[key];
  if (v == null || String(v).trim() === "") return fallback;
  return String(v).trim();
}

function list(env, key, fallback = []) {
  const raw = pick(env, key, "");
  if (!raw) return [...fallback];
  return raw
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * @param {Record<string, string | undefined>} env
 */
export function createConfig(env = {}) {
  const BASE_URL = pick(env, "BASE_URL").replace(/\/+$/, "");
  const MIRROR_URL = pick(env, "MIRROR_URL").replace(/\/+$/, "");
  const H5_API = pick(env, "H5_API").replace(/\/+$/, "");
  const DEFAULT_DOMAIN = pick(env, "DEFAULT_DOMAIN").replace(/\/+$/, "");
  const WEB_BFF_PATH = pick(env, "WEB_BFF_PATH");
  const H5_BFF_PATH = pick(env, "H5_BFF_PATH");
  const PLAY_PATH = pick(env, "PLAY_PATH");
  const H5_HOST_QUERY = pick(env, "H5_HOST_QUERY", "");

  const SITE_HOSTS = list(env, "SITE_HOSTS", []).map((h) =>
    h.replace(/\/+$/, "")
  );
  const PLAY_HOSTS = list(env, "PLAY_HOSTS", []).map((h) =>
    h.replace(/\/+$/, "")
  );
  const MEDIA_ALLOW_SUFFIXES = list(env, "MEDIA_ALLOW_SUFFIXES", []).map((h) =>
    h.replace(/^\.+/, "").toLowerCase()
  );
  const TRAILER_MARKERS = list(env, "TRAILER_MARKERS", []);

  const USER_AGENT = pick(env, "USER_AGENT", "");
  const CLIENT_TIMEZONE = pick(env, "CLIENT_TIMEZONE", "");
  const REQUEST_LANG = pick(env, "REQUEST_LANG", "");
  const CLIENT_TYPE = pick(env, "CLIENT_TYPE", "");

  const missing = [];
  if (!BASE_URL) missing.push("BASE_URL");
  if (!H5_API) missing.push("H5_API");
  if (!DEFAULT_DOMAIN) missing.push("DEFAULT_DOMAIN");
  if (!WEB_BFF_PATH) missing.push("WEB_BFF_PATH");
  if (!H5_BFF_PATH) missing.push("H5_BFF_PATH");
  if (!PLAY_PATH) missing.push("PLAY_PATH");
  if (!SITE_HOSTS.length) missing.push("SITE_HOSTS");
  if (!PLAY_HOSTS.length) missing.push("PLAY_HOSTS");
  if (!MEDIA_ALLOW_SUFFIXES.length) missing.push("MEDIA_ALLOW_SUFFIXES");
  if (!USER_AGENT) missing.push("USER_AGENT");
  if (!CLIENT_TIMEZONE) missing.push("CLIENT_TIMEZONE");
  if (!REQUEST_LANG) missing.push("REQUEST_LANG");
  if (!CLIENT_TYPE) missing.push("CLIENT_TYPE");

  return {
    missing,
    BASE_URL,
    MIRROR_URL: MIRROR_URL || BASE_URL,
    H5_API,
    DEFAULT_DOMAIN,
    WEB_BFF_PATH,
    H5_BFF_PATH,
    PLAY_PATH,
    H5_HOST_QUERY,
    SITE_HOSTS,
    PLAY_HOSTS,
    MEDIA_ALLOW_SUFFIXES,
    TRAILER_MARKERS,
    USER_AGENT,
    CLIENT_TIMEZONE,
    REQUEST_LANG,
    CLIENT_TYPE,
    AUDIUS_API_BASE: pick(env, "AUDIUS_API_BASE").replace(/\/+$/, ""),
    AUDIUS_APP_NAME: pick(env, "AUDIUS_APP_NAME", ""),
    AUDIUS_WEB_BASE: pick(env, "AUDIUS_WEB_BASE").replace(/\/+$/, ""),
    /** Comma-separated browser origins allowed to call the API (web app). */
    CORS_ALLOWED_ORIGINS: list(env, "CORS_ALLOWED_ORIGINS", []).map((h) =>
      h.replace(/\/+$/, "")
    ),
    /** Shared secret for the mobile app (header X-App-Key). */
    APP_CLIENT_KEY: pick(env, "APP_CLIENT_KEY", ""),
    get WEB_BFF() {
      return `${this.BASE_URL}${this.WEB_BFF_PATH}`;
    },
    get MIRROR_WEB_BFF() {
      return `${this.MIRROR_URL}${this.WEB_BFF_PATH}`;
    },
    h5(path) {
      const p = path.startsWith("/") ? path : `/${path}`;
      return `${this.H5_API}${this.H5_BFF_PATH}${p}`;
    },
    playUrl(host, subjectId, detailPath, se, ep) {
      const base = String(host).replace(/\/+$/, "");
      const q = new URLSearchParams({
        subjectId: String(subjectId),
        se: String(se),
        ep: String(ep),
        detailPath: String(detailPath),
      });
      return `${base}${this.PLAY_PATH}?${q}`;
    },
    apiHeaders() {
      return {
        "User-Agent": this.USER_AGENT,
        Accept: "application/json",
        "X-Client-Info": JSON.stringify({ timezone: this.CLIENT_TIMEZONE }),
        "X-Request-Lang": this.REQUEST_LANG,
        Origin: this.BASE_URL,
        Referer: `${this.BASE_URL}/`,
      };
    },
    isAllowedMediaHost(hostname) {
      const h = String(hostname || "").toLowerCase();
      return this.MEDIA_ALLOW_SUFFIXES.some(
        (suf) => h === suf || h.endsWith(`.${suf}`)
      );
    },
    isTrailerUrl(url) {
      if (!url) return true;
      const u = String(url).toLowerCase();
      return this.TRAILER_MARKERS.some((m) => u.includes(String(m).toLowerCase()));
    },
  };
}

/** @type {ReturnType<typeof createConfig> | null} */
let active = null;

export function setActiveConfig(cfg) {
  active = cfg;
}

export function cfg() {
  if (!active) {
    throw new Error("Server config not loaded — check .env / .dev.vars");
  }
  return active;
}
