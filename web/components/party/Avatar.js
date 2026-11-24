"use client";

import styles from "./party.module.css";

// Stable, readable colors per user so people are easy to tell apart in chat and the member list.
const HUES = [268, 200, 330, 150, 25, 185, 300, 45];

export function hueFor(id) {
  let h = 0;
  const s = String(id || "");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return HUES[h % HUES.length];
}

export default function Avatar({ id, name, src, size = 30, speaking = false, className = "" }) {
  const hue = hueFor(id);
  return (
    <span
      className={`${styles.avatar} ${speaking ? styles.speaking : ""} ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.42),
        background: `hsl(${hue} 55% 32%)`,
        color: `hsl(${hue} 90% 88%)`,
      }}
      aria-hidden="true"
    >
      {src ? <img src={src} alt="" /> : (name || "?").trim().charAt(0).toUpperCase()}
    </span>
  );
}
