"use client";

import { Mic, MicOff, PhoneOff } from "lucide-react";
import styles from "./party.module.css";

const ERRORS = {
  MIC_BLOCKED: "Microphone access was blocked — allow it in your browser's site settings.",
  MUTED_BY_HOST: "The host muted you.",
  VOICE_UNAVAILABLE: "Voice isn't available on this server right now.",
  VOICE_CONNECTION_FAILED: "Voice couldn't connect (a firewall may be blocking it).",
};

/** Mic controls: join with mic, mute/unmute, push-to-talk, leave mic. */
export default function VoiceBar({ voice }) {
  if (!voice.available) return null;
  const { micLive, micOn, forceMuted, pushToTalk, error, joined } = voice;

  return (
    <div className={styles.voiceBar}>
      {!micLive ? (
        <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={voice.startMic} disabled={forceMuted}>
          <Mic size={14} /> {joined ? "Join voice" : "Connecting voice…"}
        </button>
      ) : (
        <>
          {!pushToTalk && (
            <button
              type="button"
              className={`${styles.btn} ${micOn ? styles.btnPrimary : ""}`}
              onClick={voice.toggleMic}
              aria-pressed={micOn}
              disabled={forceMuted}
            >
              {micOn ? <Mic size={14} /> : <MicOff size={14} />} {micOn ? "Mute" : "Unmute"}
            </button>
          )}
          <label className={styles.muted} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <input type="checkbox" checked={pushToTalk} onChange={(e) => voice.setPushToTalk(e.target.checked)} />
            Push-to-talk {pushToTalk ? (micOn ? "· talking" : "· hold V") : ""}
          </label>
          <button type="button" className={styles.btn} onClick={voice.stopMic} title="Turn off your mic">
            <PhoneOff size={14} />
          </button>
        </>
      )}
      {forceMuted ? <span className={styles.muted}>{ERRORS.MUTED_BY_HOST}</span> : null}
      {error && ERRORS[error] ? <span className={styles.error} style={{ margin: 0 }}>{ERRORS[error]}</span> : null}
    </div>
  );
}
