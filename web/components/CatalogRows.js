import Hero from "./Hero";
import TitleCard from "./TitleCard";
import RowScroller from "./RowScroller";
import styles from "./CatalogRows.module.css";

const MAX_PER_ROW = 18;

export default function CatalogRows({ sections = [], showHero = true }) {
  const usable = sections.filter((s) => s.movies?.length);
  if (!usable.length) {
    return <p className="status">No titles found.</p>;
  }

  const banner = usable.find((s) => s.section?.toLowerCase() === "banner");
  const rows = usable.filter((s) => s !== banner);
  const featured = banner?.movies?.[0] || rows[0]?.movies?.[0];

  return (
    <div>
      {showHero && featured ? <Hero item={featured} /> : null}
      {rows.map((section, index) => (
        <section
          key={`${section.section || "row"}-${index}`}
          className={styles.row}
        >
          <div className="row-head">
            <h2>{section.section}</h2>
            <span>{section.count || section.movies.length} titles</span>
          </div>
          <RowScroller>
            {section.movies.slice(0, MAX_PER_ROW).map((item, i) => (
              <TitleCard
                key={item.slug || item.id || `${item.name}-${i}`}
                item={item}
              />
            ))}
          </RowScroller>
        </section>
      ))}
    </div>
  );
}
