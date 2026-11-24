"use client";

import styles from "./party.module.css";

/** Status pills, "Jump to live", tap-to-sync and floating reactions on top of the player. */
export default function PartyOverlay({ party, voice }) {
  const { status, detached, behindBy, needsGesture, reactions, canControl, members, room, actions } = party;
  const host = members.find((m) => m.userId === room?.hostUserId);
  const behind = Math.round(behindBy);

  return (
    <div className={styles.overlay}>
      <div className={styles.pillRow} aria-live="polite">
        {status === "reconnecting" || status === "connecting" ? (
          <span className={`${styles.pill} ${styles.pillWarn}`}>Reconnecting…</span>
        ) : detached ? (
          <button type="button" className={`${styles.pill} ${styles.pillButton}`} onClick={actions.jumpToLive}>
            {behind > 1 ? `Behind live by ${formatSecs(behind)} · ` : ""}Jump to live
          </button>
        ) : (
          <span className={`${styles.pill} ${styles.pillLive}`}>
            {canControl ? "Live · you control playback" : `Live${host ? ` · ${host.name} is hosting` : ""}`}
          </span>
        )}
        {host?.buffering && !canControl && <span className={`${styles.pill} ${styles.pillWarn}`}>Host is buffering…</span>}
      </div>

      {voice?.speakers?.length ? (
        <div className={styles.speakerRow} aria-live="polite">
          {voice.speakers.map((id) => {
            const m = members.find((x) => x.userId === id);
            return m ? (
              <span key={id} className={`${styles.pill} ${styles.speakerPill}`}>
                🎙 {m.name}
              </span>
            ) : null;
          })}
        </div>
      ) : null}

      {needsGesture && (
        <button type="button" className={styles.gestureCover} onClick={actions.jumpToLive}>
          Tap to join the party playback
        </button>
      )}

      <div className={styles.reactions} aria-hidden="true">
        {reactions.map((r, i) => (
          <span key={r.id} className={styles.reaction} style={{ left: `${(i * 37) % 40}px` }}>
            {r.emoji}
          </span>
        ))}
      </div>
    </div>
  );
}

function formatSecs(s) {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${String(s % 60).padStart(2, "0")}s`;
}
