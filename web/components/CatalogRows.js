"use client";

import Hero from "./Hero";
import TitleCard from "./TitleCard";
import RowScroller from "./RowScroller";
import LazyRow from "./LazyRow";
import styles from "./CatalogRows.module.css";

/** Fewer cards = fewer decoded images in memory */
const MAX_PER_ROW = 12;

export default function CatalogRows({ sections = [], showHero = true }) {
  const usable = sections.filter((s) => s.movies?.length);
  if (!usable.length) {
    return <p className="status">No titles found.</p>;
  }

  const banner = usable.find((s) => s.section?.toLowerCase() === "banner");
  const rows = usable.filter((s) => s !== banner);
  const bannerItems =
    banner?.movies?.length
      ? banner.movies
      : rows[0]?.movies?.slice(0, 6) || [];

  return (
    <div>
      {showHero && bannerItems.length ? <Hero items={bannerItems} /> : null}
      {rows.map((section, index) => (
        <section
          key={`${section.section || "row"}-${index}`}
          className={styles.row}
        >
          <div className="row-head">
            <h2>{section.section}</h2>
            <span>{section.count || section.movies.length} titles</span>
          </div>
          <LazyRow minHeight={300}>
            <RowScroller>
              {section.movies.slice(0, MAX_PER_ROW).map((item, i) => (
                <TitleCard
                  key={item.slug || item.id || `${item.name}-${i}`}
                  item={item}
                />
              ))}
            </RowScroller>
          </LazyRow>
        </section>
      ))}
    </div>
  );
}
