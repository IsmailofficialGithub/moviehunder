import Image from "next/image";
import styles from "./settings.module.css";

export const metadata = {
  title: "Settings",
};

export default function SettingsPage() {
  return (
    <main className={`page ${styles.page}`}>
      <header className={styles.head}>
        <Image
          src="/brand/logo-full.png"
          alt="MovieHunter"
          width={220}
          height={64}
          className={styles.logo}
          priority
        />
        <h1>Settings</h1>
        <p className={styles.sub}>
          MovieHunter web — same brand and catalog as the mobile app.
        </p>
      </header>

      <section className={styles.card}>
        <h2>About</h2>
        <dl className={styles.dl}>
          <div>
            <dt>App</dt>
            <dd>MovieHunter</dd>
          </div>
          <div>
            <dt>Platform</dt>
            <dd>Web</dd>
          </div>
          <div>
            <dt>Catalog</dt>
            <dd>Movies, TV, Anime, Ranking, Songs</dd>
          </div>
        </dl>
      </section>

      <section className={styles.card}>
        <h2>Brand</h2>
        <p className={styles.muted}>
          Primary <code>#3d0081</code> · Secondary <code>#bd84db</code> · Accent{" "}
          <code>#5a00a2</code>
        </p>
        <div className={styles.swatches}>
          <span style={{ background: "#3d0081" }} />
          <span style={{ background: "#bd84db" }} />
          <span style={{ background: "#5a00a2" }} />
          <span style={{ background: "#f5c518" }} />
        </div>
      </section>

      <section className={styles.card}>
        <h2>Tips</h2>
        <ul className={styles.tips}>
          <li>Use the header search for titles, or Songs for music.</li>
          <li>On laptop, scroll a row sideways with the trackpad or shift+wheel.</li>
          <li>Install the mobile app for downloads and lock-screen music.</li>
        </ul>
      </section>
    </main>
  );
}
