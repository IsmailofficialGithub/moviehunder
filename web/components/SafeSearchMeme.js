"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import styles from "./SafeSearchMeme.module.css";

const MEME_SRC = "/18plus-meme.mp4";

/**
 * Full-width looping meme for blocked searches (with sound).
 * Hard-stops on unmount / query change (parent should pass key={query}).
 */
export default function SafeSearchMeme() {
  const router = useRouter();
  const ref = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Don't leave the header search focused after a blocked search
    if (typeof document !== "undefined") {
      const active = document.activeElement;
      if (
        active?.tagName === "INPUT" ||
        active?.tagName === "TEXTAREA" ||
        active?.getAttribute?.("type") === "search"
      ) {
        active.blur?.();
      }
    }

    const el = ref.current;
    if (!el) return undefined;

    let cancelled = false;
    setReady(false);

    el.loop = true;
    el.playsInline = true;
    el.controls = false;
    el.preload = "auto";
    // Explicit src assignment so soft navigation always reloads the file
    if (el.getAttribute("src") !== MEME_SRC) {
      el.setAttribute("src", MEME_SRC);
    }
    el.load();

    const markReady = () => {
      if (!cancelled) setReady(true);
    };

    const tryPlayLoud = async () => {
      if (cancelled || !el) return;
      el.muted = false;
      el.volume = 1;
      try {
        await el.play();
        markReady();
        return;
      } catch {
        /* autoplay-with-sound blocked after SPA nav */
      }
      // Kick playback muted, then unmute (keeps gesture-friendly path)
      try {
        el.muted = true;
        await el.play();
        markReady();
        el.muted = false;
        el.volume = 1;
      } catch {
        /* still blocked — first tap on Back / page will resume via play() */
      }
    };

    const onReady = () => {
      markReady();
      tryPlayLoud();
    };

    el.addEventListener("loadeddata", onReady);
    el.addEventListener("canplay", onReady);
    tryPlayLoud();

    return () => {
      cancelled = true;
      el.removeEventListener("loadeddata", onReady);
      el.removeEventListener("canplay", onReady);
      try {
        el.pause();
        el.muted = true;
        el.removeAttribute("src");
        el.load();
      } catch {
        /* ignore */
      }
    };
  }, []);

  const goBack = () => {
    const el = ref.current;
    if (el) {
      try {
        el.pause();
        el.muted = true;
      } catch {
        /* ignore */
      }
    }
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/");
    }
  };

  return (
    <div className={styles.wrap}>
      <button type="button" className={styles.back} onClick={goBack}>
        ← Back
      </button>
      <div className={`${styles.frame} ${ready ? styles.frameReady : ""}`}>
        <video
          ref={ref}
          className={styles.video}
          src={MEME_SRC}
          loop
          playsInline
          autoPlay
          controls={false}
          preload="auto"
          disablePictureInPicture
          controlsList="nodownload noplaybackrate noremoteplayback"
        />
      </div>
      <p className={styles.caption}>Keep your search clean, beta.</p>
    </div>
  );
}
