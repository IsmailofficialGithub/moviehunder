"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./ActiveUsers.module.css";

const SESSION_KEY = "mh.presence.id";
const HEARTBEAT_MS = 25_000;

function newId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `mh_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function getSessionId() {
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id || id.length < 8) {
      id = newId();
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return newId();
  }
}

function seedCount() {
  return 8000 + Math.floor(Math.random() * 5000);
}

function formatCount(n) {
  const v = Math.max(0, Math.floor(Number(n) || 0));
  return v.toLocaleString("en-US");
}

async function postPresence(path, id) {
  const res = await fetch(path, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ id }),
    keepalive: true,
  });
  if (!res.ok) throw new Error(`presence ${res.status}`);
  return res.json();
}

/**
 * Quiet header presence: fake 8k–15k + real open tabs.
 */
export default function ActiveUsers() {
  const [display, setDisplay] = useState(seedCount);
  const idRef = useRef("");
  const targetRef = useRef(0);
  const shownRef = useRef(0);
  const rafRef = useRef(0);

  useEffect(() => {
    idRef.current = getSessionId();
    shownRef.current = display;
    targetRef.current = display;

    let cancelled = false;
    let beatTimer;

    const animateTo = (next) => {
      targetRef.current = next;
      if (rafRef.current) return;
      const step = () => {
        const cur = shownRef.current;
        const tgt = targetRef.current;
        const diff = tgt - cur;
        if (Math.abs(diff) < 1) {
          shownRef.current = tgt;
          setDisplay(tgt);
          rafRef.current = 0;
          return;
        }
        shownRef.current = cur + diff * 0.22;
        setDisplay(Math.round(shownRef.current));
        rafRef.current = requestAnimationFrame(step);
      };
      rafRef.current = requestAnimationFrame(step);
    };

    const apply = (data) => {
      if (cancelled || !data) return;
      const n = Number(data.active);
      if (!Number.isFinite(n) || n < 1000) return;
      animateTo(n);
    };

    const beat = async () => {
      try {
        const data = await postPresence(
          "/api/presence/heartbeat",
          idRef.current
        );
        apply(data);
      } catch {
        /* keep last */
      }
    };

    const leave = () => {
      const id = idRef.current;
      if (!id) return;
      const body = JSON.stringify({ id });
      try {
        if (navigator.sendBeacon) {
          navigator.sendBeacon(
            "/api/presence/leave",
            new Blob([body], { type: "text/plain;charset=UTF-8" })
          );
          return;
        }
      } catch {
        /* fall through */
      }
      fetch("/api/presence/leave", {
        method: "POST",
        body,
        headers: { "Content-Type": "text/plain" },
        keepalive: true,
      }).catch(() => {});
    };

    beat();
    beatTimer = setInterval(beat, HEARTBEAT_MS);
    window.addEventListener("pagehide", leave);
    window.addEventListener("beforeunload", leave);

    return () => {
      cancelled = true;
      clearInterval(beatTimer);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener("pagehide", leave);
      window.removeEventListener("beforeunload", leave);
    };
  }, []);

  return (
    <div
      className={styles.wrap}
      title="People watching right now"
      aria-live="polite"
    >
      <svg className={styles.icon} viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
          stroke="currentColor"
          strokeWidth="1.7"
        />
        <path
          d="M8 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
          stroke="currentColor"
          strokeWidth="1.7"
        />
        <path
          d="M3.5 19.5c.7-2.4 2.7-4 5.5-4s4.8 1.6 5.5 4"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
        <path
          d="M13.2 15.2c.9-.7 2.1-1.2 3.8-1.2 2.8 0 4.8 1.6 5.5 4"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      </svg>
      <span className={styles.num}>{formatCount(display)}</span>
      <span className={styles.label}>online</span>
    </div>
  );
}
