import { getBlockedPerformers } from "./blockedPerformers.js";

/**
 * Adult / NSFW content guard.
 * Filters queries, autocomplete suggestions, and post-response catalog rows.
 */

export const SAFE_SEARCH_MESSAGE =
  "I'm a well-behaved kid, beta. Keep your search clean.";

export const SAFE_SEARCH_TITLE = "Nope.";

/** Only the Will Ferrell comedy — not other “step*” adult tropes. */
const ALLOWED_TITLE_EXCEPTIONS = [
  /^\s*step\s*brothers?\s*$/i,
  /^\s*stepbrothers?\s*$/i,
];

const NORMALIZED_PERFORMERS = getBlockedPerformers();

/** Adult / porn intent — query + suggestions + title + description. */
const BLOCKED_PATTERNS = [
  // Sites / formats
  /\bporn(?:o|ography|ographic|hub|videos?|star|stars)?\b/i,
  /\bx{3,}\b/i,
  /\bnsfw\b/i,
  /\bhentai\b/i,
  /\brule\s*34\b/i,
  /\bonlyfans\b/i,
  /\bfansly\b/i,
  /\bmanyvids\b/i,
  /\bchaturbate\b/i,
  /\bxvideos?\b/i,
  /\bxnxx\b/i,
  /\bredtube\b/i,
  /\byouporn\b/i,
  /\bspankbang\b/i,
  /\bpornhub\b/i,
  /\bxhamster\b/i,
  /\bbrazzers\b/i,
  /\bbangbros\b/i,
  /\breality\s*kings\b/i,
  /\bnaughty\s*america\b/i,
  /\bvixen\s*media\b/i,
  /\bblacked\b/i,
  /\btushy\b/i,
  /\bdeeper\b/i,
  /\bkink\.com\b/i,
  /\bjav\b/i,
  /\b18\s*\+\b/i,
  /\bover\s*18\b/i,
  /\b18\s*plus\b/i,
  /\buncensored\s+(?:jav|hentai|porn)\b/i,
  /\bx-?rated\b/i,

  // Sex / masturbation (cover “i masturbate”, typos, slang)
  /\bmasturbat\w*/i,
  /\bmasterbat\w*/i,
  /\bjack(?:ing|ed|s)?\s*off\b/i,
  /\bjerk(?:ing|ed|s)?\s*off\b/i,
  /\bwank(?:ing|ed|s|er)?\b/i,
  /\bself[\s-]*pleasur\w*/i,
  /\bhand\s*job\b/i,
  /\bblow\s*job\b/i,
  /\bfoot\s*job\b/i,

  /\bsex\s*(?:tape|video|cam|chat|film|movie|scene|slave|toy|doll|ed|life)?\b/i,
  /^\s*sex\s*$/i,
  /\bsex\s+next\s+door\b/i,
  /\bsex\s+doll\b/i,
  /\brevenge\s+porn\b/i,
  /\b(?:hardcore|softcore)\b/i,
  /\b(?:nude|nudes)\b/i,
  /\bnaked\s*(?:video|scene|women|girls?|pics?|photos?|model)s?\b/i,
  /\b(?:blowjob|handjob|footjob|boobjob)\b/i,
  /\b(?:cumshot|creampie|gangbang|threesome|foursome)\b/i,
  /\b(?:anal|oral)\s*(?:sex|porn|scene)?\b/i,
  /\bstrip(?:per|tease|ping)\b/i,
  /\berotic(?:a|ally)?\b/i,
  /\badult\s*(?:video|film|movie|content|site|entertainment|movies?)?\b/i,
  /^\s*adult\s*$/i,
  /\bpornstar\b/i,
  /\bcam\s*girl\b/i,
  /\bcamgirl\b/i,
  /\bleaked\s*(?:nudes?|sex|tape|video)s?\b/i,
  /\borgasm\b/i,
  /\bfetish(?:es)?\b/i,
  /\bbdsm\b/i,
  /\bbondage\b/i,
  /\bsadomasoch/i,
  /\bincest\b/i,
  /\btaboo\b/i,
  /\bmilf\b/i,
  /\bgilf\b/i,
  /\bdilf\b/i,
  /\bteen\s*(?:porn|sex|xxx|nude)\b/i,
  /\bbarely\s*legal\b/i,
  /\blebian\s*(?:porn|sex|xxx)\b/i,
  /\bgay\s*(?:porn|sex|xxx)\b/i,
  /\bbisexual\s*(?:porn|sex)\b/i,
  /\bthreesome\b/i,
  /\borgy\b/i,
  /\bsquirting\b/i,
  /\bdeepthroat\b/i,
  /\bfuck(?:ing|s|ed)?\b/i,
  /\bslut(?:s|ty)?\b/i,
  /\bwhore\b/i,
  /\bcocks?\b/i,
  /\bdick\s*(?:suck|pic)?\b/i,
  /\bpussy\b/i,
  /\bvagina\b/i,
  /\bpenis\b/i,
  /\bboob(?:s|ies)?\b/i,
  /\btits?\b/i,
  /\bass\s*(?:fuck|sex|hole)\b/i,
  /\bhorny\b/i,
  /\blust(?:ful|y)?\b/i,
  /\bseduce[sd]?\b/i,
  /\bseduction\b/i,
  /\bsex\s*scene\b/i,
  /\bnudity\b/i,
  /\bexplicit\b/i,
  /\bplayboy\b/i,
  /\bpenthouse\b/i,
  /\bhustler\b/i,
  /\bescort\s*(?:girl|service)?\b/i,
  /\bprostitut/i,
  /\bhooker\b/i,
  /\bcall\s*girl\b/i,
  /\bhappy\s*ending\b/i,
  /\bintercourse\b/i,
  /\bpornographic\b/i,
  /\bhot\s*wife\b/i,
  /\bcuckold\b/i,
  /\bbabysitter\b/i,
  /\bmassag(?:e|es)\s*(?:parlor|parlour)\b/i,

  // Step-family adult tropes (block suggestions like stepmom / stepson)
  /\bstep\s*-?\s*moms?\b/i,
  /\bstepmoms?\b/i,
  /\bstep\s*-?\s*mummies\b/i,
  /\bstep\s*-?\s*dads?\b/i,
  /\bstepdads?\b/i,
  /\bstep\s*-?\s*fathers?\b/i,
  /\bstepfathers?\b/i,
  /\bstep\s*-?\s*sons?\b/i,
  /\bstepsons?\b/i,
  /\bstep\s*-?\s*daughters?\b/i,
  /\bstepdaughters?\b/i,
  /\bstep\s*-?\s*sis(?:ters?)?\b/i,
  /\bstepsisters?\b/i,
  /\bstep\s*-?\s*bro(?:thers?)?\b/i,
  /\bstepbrothers?\b/i,
  /\bstep\s*-?\s*family\b/i,
  /\bstep\s*-?\s*sibling/i,
];

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isAllowedException(text) {
  const t = String(text || "").trim();
  if (!t) return false;
  return ALLOWED_TITLE_EXCEPTIONS.some((re) => re.test(t));
}

function containsBlockedPerformer(text) {
  const n = normalizeText(text);
  if (!n) return false;
  for (const name of NORMALIZED_PERFORMERS) {
    if (!name) continue;
    if (n === name) return true;
    if (
      n.includes(` ${name} `) ||
      n.startsWith(`${name} `) ||
      n.endsWith(` ${name}`)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * True if raw text matches blocked adult patterns or performer names.
 * @param {string} text
 */
export function textMatchesBlockedContent(text) {
  const raw = String(text || "").trim();
  if (!raw) return false;
  if (isAllowedException(raw)) return false;
  if (containsBlockedPerformer(raw)) return true;
  for (const re of BLOCKED_PATTERNS) {
    if (re.test(raw)) return true;
  }
  return false;
}

/**
 * @param {string} query
 * @returns {{ blocked: boolean, message?: string, title?: string }}
 */
export function checkSafeSearch(query) {
  const q = String(query || "").trim();
  if (!q) return { blocked: false };
  if (isAllowedException(q)) return { blocked: false };
  if (textMatchesBlockedContent(q)) {
    return {
      blocked: true,
      title: SAFE_SEARCH_TITLE,
      message: SAFE_SEARCH_MESSAGE,
    };
  }
  return { blocked: false };
}

export function isSafeSearchBlocked(query) {
  return checkSafeSearch(query).blocked;
}

/**
 * Filter autocomplete suggestion strings after the API responds.
 * @param {string[]} suggestions
 */
export function filterSafeSuggestions(suggestions) {
  if (!Array.isArray(suggestions)) return [];
  return suggestions
    .map((s) => String(s || "").trim())
    .filter(Boolean)
    .filter((s) => !textMatchesBlockedContent(s) && !isSafeSearchBlocked(s));
}

/**
 * Drop catalog rows whose title/description look adult.
 * @param {Array<Record<string, unknown>>} items
 */
export function filterSafeCatalogItems(items) {
  if (!Array.isArray(items)) return [];
  return items.filter((item) => !isBlockedCatalogItem(item));
}

/**
 * If filtering removed everything from an adult-leaning result set,
 * treat the whole search as blocked (e.g. porn-star name search).
 */
export function shouldBlockEmptyAdultSearch(query, before, after) {
  if (checkSafeSearch(query).blocked) return true;
  const b = Array.isArray(before) ? before : [];
  const a = Array.isArray(after) ? after : [];
  if (!b.length || a.length) return false;
  const adultHits = b.filter((item) => isBlockedCatalogItem(item)).length;
  return adultHits >= Math.max(1, Math.ceil(b.length * 0.5));
}

/**
 * @param {Record<string, unknown>|null|undefined} item
 */
export function isBlockedCatalogItem(item) {
  if (!item || typeof item !== "object") return false;
  const title = String(item.name || item.title || "").trim();
  if (isAllowedException(title)) return false;

  const haystack = [
    title,
    item.description,
    item.desc,
    item.overview,
    item.plot,
    item.genre,
    item.badge,
    item.corner,
    item.slug,
  ]
    .filter((x) => x != null && String(x).trim())
    .join(" \n ");

  return textMatchesBlockedContent(haystack);
}
