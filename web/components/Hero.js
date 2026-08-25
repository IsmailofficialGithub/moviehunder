import Link from "next/link";
import styles from "./Hero.module.css";

export default function Hero({ item }) {
  if (!item?.slug) return null;
  return (
    <section className={styles.hero}>
      {item.poster_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.poster_url} alt="" />
      ) : null}
      <div className={styles.copy}>
        <p className={styles.eyebrow}>Featured</p>
        <h1>{item.name}</h1>
        <p>{item.badge || "Featured pick"}</p>
        <Link className="play-btn" href={`/title/${encodeURIComponent(item.slug)}`}>
          View details
        </Link>
      </div>
    </section>
  );
}
