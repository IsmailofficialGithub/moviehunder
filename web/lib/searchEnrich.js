/**
 * Hindi dubs are separate catalog entries (e.g. "Title [Hindi]").
 * Enrich search results when the API hasn't already merged them.
 */

export function isHindiDubTitle(name) {
  return /\[\s*hindi\s*\]|\(\s*hindi\s*\)|\bhindi\s*dub|\bdubbed\s*(?:in\s+)?hindi\b/i.test(
    String(name || "")
  );
}

function baseTitleKey(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/\[\s*[^\]]*\]|\(\s*[^)]*\)/g, " ")
    .replace(/\bhindi\b|\bdubbed\b|\bdub\b|\bofficial\b/gi, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function mergeWithHindiVariants(primary, hindiHits) {
  const list = Array.isArray(primary) ? primary : [];
  const seen = new Set(list.map((m) => m.slug).filter(Boolean));
  const hindi = (hindiHits || []).filter(
    (m) => m?.slug && isHindiDubTitle(m.name) && !seen.has(m.slug)
  );
  if (!hindi.length) return list;

  const out = [];
  const used = new Set();
  for (const m of list) {
    out.push(m);
    const key = baseTitleKey(m.name);
    if (!key) continue;
    for (const h of hindi) {
      if (used.has(h.slug)) continue;
      const hk = baseTitleKey(h.name);
      if (!hk) continue;
      if (hk === key || hk.startsWith(key) || key.startsWith(hk)) {
        out.push({ ...h, badge: h.badge || "Hindi", dub_lang: "hi" });
        used.add(h.slug);
        seen.add(h.slug);
      }
    }
  }
  for (const h of hindi) {
    if (used.has(h.slug)) continue;
    out.push({ ...h, badge: h.badge || "Hindi", dub_lang: "hi" });
  }
  return out;
}

export function alreadyHasHindiResults(movies) {
  return (movies || []).some(
    (m) =>
      m?.dub_lang === "hi" ||
      isHindiDubTitle(m?.name) ||
      /hindi/i.test(String(m?.badge || ""))
  );
}
