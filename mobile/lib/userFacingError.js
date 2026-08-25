/**
 * Map raw errors to user-facing copy. Never leak hosts, IPs, or API URLs.
 */

const OFFLINE_RE =
  /network request failed|failed to fetch|NetworkError|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|offline|no internet|Unable to resolve host|UnknownHostException|DNS|getaddrinfo|socket|connection.*(refused|reset|closed)/i;

const LEAK_RE =
  /https?:\/\/|wss?:\/\/|www\.|localhost|127\.0\.0\.1|\d{1,3}(?:\.\d{1,3}){3}|(?:^|\s)[\w.-]+\.(?:io|com|net|org|dev|app)(?::\d+)?(?:\/|\s|$)|:\d{2,5}\b|api-movie|ismailabbasi|aoneroom|supabase/i;

export function isLikelyOffline(err) {
  const msg = String(err?.message || err || "");
  const name = String(err?.name || "");
  return OFFLINE_RE.test(msg) || OFFLINE_RE.test(name);
}

/**
 * @param {unknown} err
 * @param {string} [fallback]
 */
export function toUserMessage(
  err,
  fallback = "Something went wrong. Please try again."
) {
  if (!err && !fallback) return "Something went wrong. Please try again.";
  const name = String(err?.name || "");
  const msg = String(err?.message || err || "").trim();

  if (name === "AbortError" || /timed?\s*out|aborted/i.test(msg)) {
    return "Request timed out. Check your connection and try again.";
  }

  if (isLikelyOffline(err) || LEAK_RE.test(msg)) {
    if (isLikelyOffline(err) || /resolve|ENOTFOUND|Network request failed/i.test(msg)) {
      return "You're offline. Check your internet connection and try again.";
    }
    return fallback;
  }

  if (
    msg &&
    msg.length <= 120 &&
    !LEAK_RE.test(msg) &&
    !/[/\\]|\.js\b|at\s+\w+|npm |server/i.test(msg)
  ) {
    return msg;
  }

  return fallback;
}
