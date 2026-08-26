import Link from "next/link";
import styles from "./settings.module.css";

export const metadata = {
  title: "Settings",
};

export default function SettingsPage() {
  return (
    <main className={`page ${styles.page}`}>
      <header className={styles.head}>
        <h1>Settings</h1>
        <p className={styles.sub}>
          Account, playback, and app information for MovieHunter on the web.
        </p>
      </header>

      <section className={styles.group} aria-labelledby="settings-general">
        <h2 id="settings-general" className={styles.groupTitle}>
          General
        </h2>
        <div className={styles.panel}>
          <div className={styles.row}>
            <div className={styles.rowText}>
              <p className={styles.rowLabel}>App</p>
              <p className={styles.rowHint}>MovieHunter</p>
            </div>
            <span className={styles.rowValue}>Web</span>
          </div>
          <div className={styles.row}>
            <div className={styles.rowText}>
              <p className={styles.rowLabel}>Catalog</p>
              <p className={styles.rowHint}>
                Movies, TV series, anime, rankings, and songs
              </p>
            </div>
          </div>
          <div className={styles.row}>
            <div className={styles.rowText}>
              <p className={styles.rowLabel}>Search</p>
              <p className={styles.rowHint}>
                Use the header search to find titles quickly
              </p>
            </div>
            <Link href="/" className={styles.rowLink}>
              Home
            </Link>
          </div>
        </div>
      </section>

      <section className={styles.group} aria-labelledby="settings-playback">
        <h2 id="settings-playback" className={styles.groupTitle}>
          Playback
        </h2>
        <div className={styles.panel}>
          <div className={styles.row}>
            <div className={styles.rowText}>
              <p className={styles.rowLabel}>Quality &amp; display</p>
              <p className={styles.rowHint}>
                Choose quality, fit mode, and subtitles in the player settings
              </p>
            </div>
          </div>
          <div className={styles.row}>
            <div className={styles.rowText}>
              <p className={styles.rowLabel}>Browse rows</p>
              <p className={styles.rowHint}>
                Hover a row on desktop to scroll with the side arrows
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.group} aria-labelledby="settings-about">
        <h2 id="settings-about" className={styles.groupTitle}>
          About
        </h2>
        <div className={styles.panel}>
          <div className={styles.row}>
            <div className={styles.rowText}>
              <p className={styles.rowLabel}>Version</p>
              <p className={styles.rowHint}>Web client</p>
            </div>
            <span className={styles.rowValue}>1.0</span>
          </div>
          <div className={styles.row}>
            <div className={styles.rowText}>
              <p className={styles.rowLabel}>Mobile app</p>
              <p className={styles.rowHint}>
                Downloads and lock-screen music on the native app
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
