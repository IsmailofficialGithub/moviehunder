"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Users } from "lucide-react";
import { useAuth } from "../AuthProvider";
import { createParty } from "../../lib/party/api";
import styles from "./party.module.css";

export const TICKET_KEY = (code) => `mh.party.ticket.${code}`;
export const INVITE_KEY = (code) => `mh.party.invite.${code}`;

/** "Watch together" button + create-room modal for the title currently playing. */
export default function CreatePartyButton({ content, className }) {
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const [open, setOpen] = useState(false);
  const [visibility, setVisibility] = useState("PRIVATE");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const start = () => {
    if (!isSignedIn) {
      const here = `${window.location.pathname}${window.location.search}`;
      router.push(`/login?redirect=${encodeURIComponent(here)}`);
      return;
    }
    setOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (visibility === "PRIVATE" && password.length < 4) {
      setError("Use a password of at least 4 characters.");
      return;
    }
    setBusy(true);
    try {
      const res = await createParty({
        visibility,
        password: visibility === "PRIVATE" ? password : undefined,
        name: name.trim() || undefined,
        subjectId: content.subjectId,
        detailPath: content.detailPath,
        se: content.se,
        ep: content.ep,
        title: content.title,
        poster: content.poster,
      });
      try {
        sessionStorage.setItem(TICKET_KEY(res.room.code), res.ticket);
        if (res.room.inviteToken) sessionStorage.setItem(INVITE_KEY(res.room.code), res.room.inviteToken);
      } catch {
        /* storage blocked: the room page will just re-join */
      }
      router.push(`/party/${res.room.code}`);
    } catch (err) {
      setError(err.message || "Could not create the party");
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" className={className || `${styles.btn} ${styles.btnPrimary}`} onClick={start}>
        <Users size={14} /> Watch together
      </button>
      {open && (
        <div className={styles.backdrop} role="dialog" aria-modal="true" aria-labelledby="party-create-title" onClick={() => !busy && setOpen(false)}>
          <form className={styles.modal} onSubmit={submit} onClick={(e) => e.stopPropagation()}>
            <h3 id="party-create-title">Start a watch party</h3>
            <p className={styles.muted}>Everyone watches {content.title || "this title"} in sync. You control playback.</p>

            <div className={styles.segmented}>
              <button
                type="button"
                className={`${styles.segment} ${visibility === "PRIVATE" ? styles.segmentActive : ""}`}
                onClick={() => setVisibility("PRIVATE")}
              >
                <strong>Private</strong>
                <span>Room ID + password, or your invite link</span>
              </button>
              <button
                type="button"
                className={`${styles.segment} ${visibility === "PUBLIC" ? styles.segmentActive : ""}`}
                onClick={() => setVisibility("PUBLIC")}
              >
                <strong>Public</strong>
                <span>Listed in the party lobby</span>
              </button>
            </div>

            <label className={styles.field}>
              Party name (optional)
              <input className={styles.input} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Friday movie night" />
            </label>
            {visibility === "PRIVATE" && (
              <label className={styles.field}>
                Room password
                <input
                  className={styles.input}
                  type="password"
                  value={password}
                  minLength={4}
                  maxLength={64}
                  autoComplete="new-password"
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
            )}
            {error && <p className={styles.error}>{error}</p>}
            <div className={styles.modalActions}>
              <button type="button" className={styles.btn} onClick={() => setOpen(false)} disabled={busy}>
                Cancel
              </button>
              <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`} disabled={busy}>
                {busy ? "Creating…" : "Create party"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
