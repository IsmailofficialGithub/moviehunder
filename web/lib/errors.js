/** Safe, user-facing copy — never leak backend / fetch / stack details. */
export function friendlyError(err, fallback = "Something went wrong. Please try again.") {
  const raw = String(err?.message ?? err ?? "").trim();
  if (!raw) return fallback;

  const lower = raw.toLowerCase();

  if (
    /failed to fetch|fetch failed|networkerror|load failed|network request failed|econnrefused|enotfound|etimedout|socket|cors|abort/i.test(
      lower
    )
  ) {
    return "Couldn’t connect. Check your connection and try again.";
  }

  if (/429|rate.?limit|too many/i.test(lower)) {
    return "Too many requests. Please wait a moment and try again.";
  }

  if (/404|not found/i.test(lower)) {
    return "We couldn’t find that.";
  }

  if (/401|403|unauthorized|forbidden|api.?key/i.test(lower)) {
    return "This action isn’t available right now.";
  }

  if (/no playable|no stream|empty stream|sources/i.test(lower)) {
    return "This title isn’t available to play.";
  }

  if (/subtitle|srt|vtt|cue/i.test(lower) && /parse|found|file/i.test(lower)) {
    return "Couldn’t read that subtitle file.";
  }

  // Anything that looks technical / backend-ish
  if (
    /https?:\/\/|moviebox|wrangler|worker|relay|stack|exception|errno|econn|status\s*\d{3}|request failed|internal|traceback|at\s+\S+:\d+/i.test(
      raw
    ) ||
    raw.length > 140
  ) {
    return fallback;
  }

  // Short plain messages are OK (e.g. form validation)
  if (/^[A-Za-z0-9][\w\s.,'!?-]{2,100}$/.test(raw) && !/failed|error:/i.test(lower)) {
    return raw;
  }

  return fallback;
}

export function friendlyPlaybackError(err) {
  return friendlyError(err, "Couldn’t load this video. Please try again.");
}

export function friendlyPageError(err) {
  return friendlyError(err, "Couldn’t load this page. Please try again.");
}

export function friendlySearchError(err) {
  return friendlyError(err, "Search didn’t work. Please try again.");
}
