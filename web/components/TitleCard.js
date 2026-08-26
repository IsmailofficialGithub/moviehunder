import Link from "next/link";
import LazyPoster from "./LazyPoster";
import styles from "./TitleCard.module.css";

function isHindiItem(item) {
  return (
    item?.dub_lang === "hi" ||
    /hindi/i.test(String(item?.badge || "")) ||
    /\[\s*hindi\s*\]|\(\s*hindi\s*\)/i.test(String(item?.name || ""))
  );
}

export default function TitleCard({ item }) {
  const slug = item?.slug || "";
  if (!slug) return null;

  const hindi = isHindiItem(item);
  const badgeLabel = hindi
    ? "Hindi"
    : item.badge
      ? String(item.badge)
      : null;

  return (
    <Link href={`/title/${encodeURIComponent(slug)}`} className={styles.card}>
      <div className={styles.posterWrap}>
        {item.poster_url ? (
          <LazyPoster
            src={item.poster_url}
            alt={item.name || ""}
            width={148}
            height={220}
            className={styles.poster}
          />
        ) : (
          <div className={styles.fallback}>{item.name || "No poster"}</div>
        )}
        {badgeLabel ? (
          <span className={hindi ? styles.hindiBadge : styles.badge}>
            {badgeLabel}
          </span>
        ) : null}
        {item.rank ? <span className={styles.rank}>#{item.rank}</span> : null}
      </div>
      <h3>{item.name || "Untitled"}</h3>
      {item.year || item.rating ? (
        <p className={styles.meta}>
          {[item.year, item.rating ? `★ ${item.rating}` : ""]
            .filter(Boolean)
            .join(" · ")}
        </p>
      ) : null}
    </Link>
  );
}
