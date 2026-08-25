import Link from "next/link";
import styles from "./EmptyState.module.css";

export default function EmptyState({
  title = "No items found",
  hint = "Try a different title or check the spelling.",
  actionHref = "/",
  actionLabel = "Back to Home",
  query = "",
}) {
  return (
    <div className={styles.wrap} role="status">
      <div className={styles.glow} aria-hidden />
      <div className={styles.icon} aria-hidden>
        <svg viewBox="0 0 48 48" width="48" height="48" fill="none">
          <circle cx="22" cy="22" r="12" stroke="currentColor" strokeWidth="2.5" />
          <path
            d="M31 31l8 8"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <h2 className={styles.title}>{title}</h2>
      {query ? (
        <p className={styles.query}>
          Nothing matched <span>“{query}”</span>
        </p>
      ) : null}
      <p className={styles.hint}>{hint}</p>
      {actionHref ? (
        <Link className={styles.action} href={actionHref}>
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}
