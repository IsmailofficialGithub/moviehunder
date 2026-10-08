import TitleCard from "./TitleCard";
import EmptyState from "./EmptyState";
import styles from "./TitleGrid.module.css";

export default function TitleGrid({ title, movies = [] }) {
  if (!movies.length) {
    return <EmptyState title="No items found" />;
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <h2 className={styles.title}>{title}</h2>
        <span className={styles.count}>{movies.length} titles</span>
      </div>
      <div className={styles.grid}>
        {movies.slice(0, 60).map((item) => (
          <TitleCard key={item.slug || item.name} item={item} />
        ))}
      </div>
    </div>
  );
}
