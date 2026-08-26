"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import {
  detectDevicePlatform,
  fetchAppRelease,
  isMobileBrowser,
} from "../lib/appRelease";
import styles from "./AppDownloadPrompt.module.css";

export const OPEN_APP_DOWNLOAD_EVENT = "mh:open-app-download";

const DISMISS_KEY = "mh.appDownload.dismissed.v1";

function platformTitle(platform) {
  if (platform === "android") return "Android";
  if (platform === "ios") return "iPhone";
  return "your device";
}

export default function AppDownloadPrompt() {
  const [open, setOpen] = useState(false);
  const [auto, setAuto] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState(null);
  const [platform, setPlatform] = useState("desktop");

  const load = useCallback(async () => {
    const detected = detectDevicePlatform();
    setPlatform(detected);
    setLoading(true);
    setError("");
    setInfo(null);
    try {
      const release = await fetchAppRelease(detected);
      setInfo(release);
    } catch (e) {
      setError(e?.message || "Could not check app releases.");
    } finally {
      setLoading(false);
    }
  }, []);

  const openModal = useCallback(
    (fromAuto = false) => {
      setAuto(Boolean(fromAuto));
      setOpen(true);
      load();
    },
    [load]
  );

  const dismiss = useCallback(() => {
    setOpen(false);
    if (auto) {
      try {
        sessionStorage.setItem(DISMISS_KEY, "1");
      } catch {
        /* ignore */
      }
    }
  }, [auto]);

  useEffect(() => {
    const onOpen = () => openModal(false);
    window.addEventListener(OPEN_APP_DOWNLOAD_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_APP_DOWNLOAD_EVENT, onOpen);
  }, [openModal]);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === "1") return;
      if (!isMobileBrowser()) return;
      const t = setTimeout(() => openModal(true), 600);
      return () => clearTimeout(t);
    } catch {
      /* private mode */
    }
  }, [openModal]);

  if (!open) return null;

  const startDownload = (url) => {
    if (!url) return;
    // Open asset URL — browser downloads the APK; keep this site open
    const w = window.open(url, "_blank", "noopener,noreferrer");
    if (!w) {
      window.location.href = url;
    }
  };

  return (
    <div
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="mh-dl-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) dismiss();
      }}
    >
      <div className={styles.sheet}>
        <button
          type="button"
          className={styles.close}
          onClick={dismiss}
          aria-label="Close"
        >
          ×
        </button>

        <div className={styles.iconWrap}>
          <Image
            src="/icon.png"
            alt="MovieHunter"
            width={72}
            height={72}
            className={styles.appIcon}
            priority
          />
        </div>

        <h2 id="mh-dl-title" className={styles.title}>
          Download MovieHunter
        </h2>

        <p className={styles.deviceBadge}>
          Detected: <strong>{platformTitle(platform)}</strong>
        </p>

        {loading ? (
          <p className={styles.sub}>Checking releases…</p>
        ) : null}

        {error ? <p className={styles.error}>{error}</p> : null}

        {!loading && !error && info && platform !== "desktop" ? (
          info.available && info.downloadUrl ? (
            <>
              <p className={styles.sub}>
                {info.version
                  ? `Version ${info.version} is available for ${platformTitle(platform)}.`
                  : `A release is available for ${platformTitle(platform)}.`}
                {info.notes ? ` ${info.notes}` : ""}
              </p>
              <button
                type="button"
                className={styles.primary}
                onClick={() => startDownload(info.downloadUrl)}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden
                  className={styles.btnIcon}
                >
                  <path
                    d="M12 3v12m0 0l-4-4m4 4l4-4M5 19h14"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Download
              </button>
            </>
          ) : (
            <p className={styles.unavailable}>
              No app is available for {platformTitle(platform)} yet.
            </p>
          )
        ) : null}

        {!loading && !error && info && platform === "desktop" ? (
          <>
            <p className={styles.sub}>
              Choose a platform
              {info.version ? ` · v${info.version}` : ""}.
            </p>
            {info.available ? (
              <>
                {info.android?.available && info.android.downloadUrl ? (
                  <button
                    type="button"
                    className={styles.primary}
                    onClick={() => startDownload(info.android.downloadUrl)}
                  >
                    Download for Android
                  </button>
                ) : (
                  <p className={styles.unavailableMuted}>
                    No Android app available
                  </p>
                )}
                {info.ios?.available && info.ios.downloadUrl ? (
                  <button
                    type="button"
                    className={styles.primary}
                    onClick={() => startDownload(info.ios.downloadUrl)}
                  >
                    Download for iPhone
                  </button>
                ) : (
                  <p className={styles.unavailableMuted}>
                    No iPhone app available
                  </p>
                )}
              </>
            ) : (
              <p className={styles.unavailable}>
                No app releases are available right now.
              </p>
            )}
          </>
        ) : null}

        {auto ? (
          <button type="button" className={styles.later} onClick={dismiss}>
            Continue in browser
          </button>
        ) : (
          <button type="button" className={styles.later} onClick={dismiss}>
            Close
          </button>
        )}
      </div>
    </div>
  );
}

export function openAppDownloadModal() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(OPEN_APP_DOWNLOAD_EVENT));
  }
}
