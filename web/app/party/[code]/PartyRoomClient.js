"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "../../../components/AuthProvider";
import PlayClient from "../../play/PlayClient";
import PartyOverlay from "../../../components/party/PartyOverlay";
import PartyPanel from "../../../components/party/PartyPanel";
import { INVITE_KEY, TICKET_KEY } from "../../../components/party/CreatePartyButton";
import { joinParty } from "../../../lib/party/api";
import { usePartyRoom } from "../../../lib/party/usePartyRoom";
import { usePartyVoice } from "../../../lib/party/usePartyVoice";
import styles from "../../../components/party/party.module.css";

const FATAL_TEXT = {
  ROOM_NOT_FOUND: "This party has ended or doesn't exist.",
  BANNED: "You were removed from this party.",
  KICKED: "You were removed from this party.",
  NOT_A_MEMBER: "You're not a member of this party.",
  ROOM_FULL: "This party is full.",
  JOIN_FAILED: "Couldn't join the party. Check your connection and try again.",
};

function takeSession(key) {
  try {
    const v = sessionStorage.getItem(key);
    if (v) sessionStorage.removeItem(key);
    return v;
  } catch {
    return null;
  }
}

export default function PartyRoomClient() {
  const router = useRouter();
  const { code: rawCode } = useParams();
  const search = useSearchParams();
  const code = String(rawCode || "").toUpperCase();
  const invite = search.get("invite") || "";
  const { isSignedIn, loading } = useAuth();

  // phase: joining → (password) → ready | error
  const [phase, setPhase] = useState("joining");
  const [joined, setJoined] = useState(null); // { room, ticket } from REST
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const join = useCallback(
    async (pw) => {
      setBusy(true);
      setError("");
      try {
        const res = await joinParty({ code, invite: invite || undefined, password: pw });
        setJoined(res);
        setPhase("ready");
      } catch (err) {
        if (err.status === 401 && !invite && /password/i.test(err.message || "")) {
          setPhase("password");
          if (pw !== undefined) setError(err.message || "Wrong password");
        } else {
          setError(err.message || "Couldn't join the party");
          setPhase("error");
        }
      } finally {
        setBusy(false);
      }
    },
    [code, invite]
  );

  useEffect(() => {
    if (loading) return;
    if (!isSignedIn) {
      const here = `/party/${code}${invite ? `?invite=${encodeURIComponent(invite)}` : ""}`;
      router.replace(`/login?redirect=${encodeURIComponent(here)}`);
      return;
    }
    // Coming straight from "Create party": reuse the ticket instead of a second join round-trip.
    const ticket = takeSession(TICKET_KEY(code));
    if (ticket) {
      setJoined({ ticket, room: { code, inviteToken: takeSession(INVITE_KEY(code)) } });
      setPhase("ready");
      return;
    }
    join();
  }, [loading, isSignedIn, code, invite, router, join]);

  const party = usePartyRoom({ code, initialTicket: joined?.ticket || null, enabled: phase === "ready" });
  const voice = usePartyVoice(party);
  const inviteToken = joined?.room?.inviteToken || null;

  const partyProp = useMemo(() => {
    const content = party.room?.content;
    if (!content) return null;
    return {
      content,
      role: party.role,
      canControl: party.canControl,
      canNavigate: party.role === "HOST", // only the creator changes title/episode
      onNavigate: party.actions.navigate,
      onActiveVideo: party.onActiveVideo,
      overlay: <PartyOverlay party={party} voice={voice} />,
      panel: <PartyPanel party={party} voice={voice} inviteToken={inviteToken} onLeave={() => router.push("/party")} />,
    };
  }, [party, voice, inviteToken, router]);

  if (phase === "password") {
    return (
      <main className={styles.center}>
        <form
          className={styles.card}
          onSubmit={(e) => {
            e.preventDefault();
            join(password);
          }}
        >
          <h1 style={{ fontSize: 20, margin: 0 }}>Join party {code}</h1>
          <p className={styles.muted}>This is a private room. Ask the host for the password or an invite link.</p>
          <label className={styles.field}>
            Room password
            <input
              className={styles.input}
              type="password"
              autoFocus
              autoComplete="off"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && <p className={styles.error}>{error}</p>}
          <div className={styles.modalActions}>
            <Link href="/party" className={styles.btn}>
              Back
            </Link>
            <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`} disabled={busy || !password}>
              {busy ? "Joining…" : "Join"}
            </button>
          </div>
        </form>
      </main>
    );
  }

  const fatalText = party.ended
    ? "The host ended this party."
    : party.fatal
      ? FATAL_TEXT[party.fatal] || "You can't join this party."
      : phase === "error"
        ? error
        : "";
  if (fatalText) {
    return (
      <main className={styles.center}>
        <div className={styles.card}>
          <h1 style={{ fontSize: 20, margin: 0 }}>Party unavailable</h1>
          <p className={styles.muted}>{fatalText}</p>
          <div className={styles.row}>
            <Link href="/party" className={`${styles.btn} ${styles.btnPrimary}`}>
              Find a party
            </Link>
            <Link href="/" className={styles.btn}>
              Home
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (!partyProp) {
    return (
      <main className={styles.center}>
        <p className={styles.muted}>{party.status === "reconnecting" ? "Reconnecting to the party…" : "Joining the party…"}</p>
      </main>
    );
  }

  return <PlayClient party={partyProp} />;
}
