/**
 * Subtitle helpers: parse SRT/VTT → cues, sync offset.
 */

function parseTimestamp(ts) {
  const raw = String(ts).trim().replace(",", ".");
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

    cues.push({ start, end, text: textLines.join("\n") });
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

export function toWebVtt(raw, filename = "") {
  const cues = parseCues(raw);
  if (!cues.length) {
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

function decodeBytes(bytes) {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(buf.subarray(2));
  }
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    const swapped = new Uint8Array(buf.subarray(2));
    for (let i = 0; i + 1 < swapped.length; i += 2) {
      const a = swapped[i];
      swapped[i] = swapped[i + 1];
      swapped[i + 1] = a;
    }
    return new TextDecoder("utf-16le").decode(swapped);
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder("windows-1252").decode(buf);
  }
}

export { decodeBytes };
