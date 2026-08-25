/**
 * Subtitle helpers: parse SRT/VTT → cues, sync offset, file upload.
 */

function parseTimestamp(ts) {
  const raw = String(ts).trim().replace(",", ".");
  // H:MM:SS.ms | MM:SS.ms | milliseconds optional
  const m = raw.match(/^(?:(\d{1,3}):)?(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?$/);
  if (!m) return null;
  const h = m[1] != null ? Number(m[1]) : 0;
  const min = Number(m[2]);
  const sec = Number(m[3]);
  const ms = m[4] != null ? Number(String(m[4]).padEnd(3, "0").slice(0, 3)) : 0;
  return h * 3600 + min * 60 + sec + ms / 1000;
}

function stripTags(html) {
  return String(html || "")
    .replace(/\{\\an\d\}/gi, "")
    .replace(/<\/?[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

/**
 * Parse SRT or WebVTT into timed cues.
 * @returns {{ start: number, end: number, text: string }[]}
 */
export function parseCues(raw) {
  const text = String(raw || "")
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
  if (!text) return [];

  let body = text;
  if (/^WEBVTT/i.test(body)) {
    body = body.replace(/^WEBVTT[^\n]*\n+/, "");
    // Drop NOTE / STYLE blocks (simple)
    body = body.replace(/^NOTE[\s\S]*?(?=\n\n)/gm, "");
    body = body.replace(/^STYLE[\s\S]*?(?=\n\n)/gm, "");
  }

  const blocks = body.split(/\n\s*\n+/);
  const cues = [];

  for (const block of blocks) {
    const lines = block
      .split("\n")
      .map((l) => l.trimEnd())
      .filter((l) => l.length > 0);
    if (!lines.length) continue;

    let idx = 0;
    if (/^\d+$/.test(lines[0].trim())) idx = 1;
    if (idx >= lines.length) continue;

    const timingLine = lines[idx];
  const tm = timingLine.match(
    /((?:\d{1,3}:)?\d{1,2}:\d{2}(?:[,.]\d{1,3})?)\s*-->\s*((?:\d{1,3}:)?\d{1,2}:\d{2}(?:[,.]\d{1,3})?)/
  );
    if (!tm) continue;

    const start = parseTimestamp(tm[1]);
    const end = parseTimestamp(tm[2]);
    if (start == null || end == null || end <= start) continue;

    const textLines = lines
      .slice(idx + 1)
      .map(stripTags)
      .filter(Boolean);
    if (!textLines.length) continue;

    cues.push({
      start,
      end,
      text: textLines.join("\n"),
    });
  }

  cues.sort((a, b) => a.start - b.start);
  if (cues.length) return cues;
  return parseAssCues(text);
}

function parseAssCues(text) {
  const cues = [];
  const lines = String(text).split("\n");
  for (const line of lines) {
    if (!/^dialogue:/i.test(line.trim())) continue;
    const rest = line.replace(/^dialogue:/i, "").trim();
    const parts = rest.split(",");
    if (parts.length < 10) continue;
    const start = parseAssTime(parts[1]);
    const end = parseAssTime(parts[2]);
    if (start == null || end == null || end <= start) continue;
    const body = stripTags(parts.slice(9).join(",").replace(/\\N/g, "\n"));
    if (!body) continue;
    cues.push({ start, end, text: body });
  }
  cues.sort((a, b) => a.start - b.start);
  return cues;
}

function parseAssTime(ts) {
  // H:MM:SS.cc (centiseconds)
  const m = String(ts)
    .trim()
    .match(/^(\d+):(\d{2}):(\d{2})[.:](\d{1,2})$/);
  if (!m) return parseTimestamp(ts);
  return (
    Number(m[1]) * 3600 +
    Number(m[2]) * 60 +
    Number(m[3]) +
    Number(String(m[4]).padEnd(2, "0").slice(0, 2)) / 100
  );
}

/** Convert raw file to WebVTT string (kept for download/API pipeline). */
export function toWebVtt(raw, filename = "") {
  const cues = parseCues(raw);
  if (!cues.length) {
    // Fallback: if already looks like VTT with WEBVTT header
    const text = String(raw || "").replace(/^\uFEFF/, "").trim();
    if (/^WEBVTT/i.test(text) || /\.vtt$/i.test(filename || "")) {
      return text.startsWith("WEBVTT") ? text : `WEBVTT\n\n${text}`;
    }
    throw new Error("Could not parse subtitle cues");
  }

  const pad = (n, w = 2) => String(n).padStart(w, "0");
  const fmt = (s) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    const ms = Math.round((s - Math.floor(s)) * 1000);
    return `${pad(h)}:${pad(m)}:${pad(sec)}.${pad(ms, 3)}`;
  };

  const parts = ["WEBVTT", ""];
  cues.forEach((c, i) => {
    parts.push(String(i + 1));
    parts.push(`${fmt(c.start)} --> ${fmt(c.end)}`);
    parts.push(c.text);
    parts.push("");
  });
  return parts.join("\n");
}

export function cueAtTime(cues, videoTimeSec, offsetSec = 0, rate = 1) {
  if (!cues?.length) return "";
  const r = rate > 0 ? rate : 1;
  const t = (videoTimeSec - offsetSec) / r;
  let lo = 0;
  let hi = cues.length - 1;
  let ans = "";
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const c = cues[mid];
    if (t < c.start) hi = mid - 1;
    else if (t >= c.end) lo = mid + 1;
    else {
      ans = c.text;
      for (let i = mid + 1; i < cues.length && cues[i].start <= t; i++) {
        if (t < cues[i].end) ans = cues[i].text;
      }
      break;
    }
  }
  return ans;
}

/** Active cue, else the next upcoming one. */
export function referenceCue(cues, videoTimeSec, offsetSec = 0, rate = 1) {
  if (!cues?.length) return { cue: null, index: -1 };
  const r = rate > 0 ? rate : 1;
  const t = (videoTimeSec - offsetSec) / r;
  for (let i = 0; i < cues.length; i++) {
    const c = cues[i];
    if (t >= c.start && t < c.end) return { cue: c, index: i };
    if (c.start > t) return { cue: c, index: i };
  }
  return { cue: cues[cues.length - 1], index: cues.length - 1 };
}

export function formatClock(sec) {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  }
  return `${m}:${String(r).padStart(2, "0")}`;
}

/** Short UI label from ugly release filenames. */
export function shortSubtitleLabel(name, lang = "") {
  const raw = String(name || "Subtitle")
    .replace(/\.(srt|vtt|zip|txt)$/i, "")
    .replace(/^[A-Za-z0-9._-]+::/, "");
  const langGuess =
    lang ||
    (raw.match(/\b(english|eng|en|hindi|hi|urdu|spanish|es|arabic|ar)\b/i)?.[1] ??
      "");
  let tag = "";
  if (/camrip|\.cam\b|hdcam/i.test(raw)) tag = "CAM";
  else if (/web-?dl|webrip/i.test(raw)) tag = "WEB";
  else if (/bluray|bdrip|brip/i.test(raw)) tag = "BluRay";
  else if (/hdtv/i.test(raw)) tag = "HDTV";
  else if (/remux/i.test(raw)) tag = "REMUX";

  const langLabel = langGuess
    ? String(langGuess).slice(0, 1).toUpperCase() +
      String(langGuess).slice(1, 12).toLowerCase()
    : "Subs";

  if (tag) return `${langLabel} · ${tag}`;
  // Fallback: last meaningful chunk
  const parts = raw.split(/[._\-\s]+/).filter(Boolean);
  const tail = parts.slice(-3).join(" ");
  return tail.length > 28 ? `${langLabel} track` : `${langLabel}${tail ? ` · ${tail}` : ""}`;
}

export function makeSubtitleTrack({
  vttText,
  label,
  srclang = "en",
  source = "upload",
  fileId = null,
  rawText = null,
}) {
  const cues = parseCues(rawText || vttText);
  if (!cues.length) throw new Error("No subtitle cues found in file");
  const pretty = shortSubtitleLabel(label, srclang);
  return {
    id: `sub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    label: pretty,
    fullLabel: label,
    cues,
    vttText: vttText || toWebVtt(rawText || ""),
    offset: 0,
    rate: 1,
    kind: "subtitles",
    srclang,
    source,
    fileId,
  };
}

export function applySyncToTrack(track, { offset, rate } = {}) {
  return {
    ...track,
    offset:
      offset == null
        ? track.offset || 0
        : Math.max(-600, Math.min(600, Number(offset) || 0)),
    rate:
      rate == null ? track.rate || 1 : Math.max(0.8, Math.min(1.25, Number(rate) || 1)),
  };
}

export function subtitleLabelFromFile(file) {
  const name = file?.name || "Subtitles";
  return name.replace(/\.(srt|vtt|txt)$/i, "") || "Subtitles";
}

function decodeSubtitleBytes(bytes) {
  const buf = new Uint8Array(bytes);
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(buf.subarray(2));
  }
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(buf.subarray(2));
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder("windows-1252").decode(buf);
  }
}

export async function fileToSubtitleTrack(file) {
  if (!file) throw new Error("No file selected");
  const lower = file.name.toLowerCase();
  if (!/\.(srt|vtt|txt|ass|ssa)$/.test(lower)) {
    throw new Error("Use a .srt, .vtt, or .ass subtitle file");
  }
  const raw = decodeSubtitleBytes(await file.arrayBuffer());
  const vtt = toWebVtt(raw, file.name);
  return makeSubtitleTrack({
    vttText: vtt,
    rawText: raw,
    label: subtitleLabelFromFile(file),
    source: "upload",
  });
}

/** Clean titles like "Name [Hindi]" for SubDL search. */
export function cleanSearchTitle(title, detailPath = "") {
  let q = String(title || "")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(hindi|urdu|tamil|telugu|english|dubbed|official)\b/gi, " ")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (q) return q;
  return String(detailPath || "")
    .replace(/-[A-Za-z0-9]{6,}$/, "")
    .replace(/-/g, " ")
    .trim();
}

export function formatOffsetLabel(sec) {
  if (!sec) return "0.0s";
  const sign = sec > 0 ? "+" : "";
  return `${sign}${sec.toFixed(1)}s`;
}
