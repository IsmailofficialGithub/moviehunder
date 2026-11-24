"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Film, Lock, MessageCircle, Mic, RefreshCw, Users, Zap } from "lucide-react";
import { useAuth } from "../../components/AuthProvider";
import { hueFor } from "../../components/party/Avatar";
import { listPublicParties, partyHistory } from "../../lib/party/api";
import styles from "./lobby.module.css";

const FEATURES = [
  { icon: Zap, title: "Perfectly in sync", text: "Play, pause and seek together — everyone stays on the same frame." },
  { icon: Mic, title: "Voice chat", text: "Talk while you watch. The movie lowers itself when someone speaks." },
  { icon: MessageCircle, title: "Chat & reactions", text: "Send messages and emoji reactions that float over the video." },
  { icon: Lock, title: "Private rooms", text: "Room ID + password, or a private invite link only friends get." },
];

/** Join by room ID, browse live public parties, and see your party history. */
export default function PartyLobbyClient() {
  const router = useRouter();
  const { isSignedIn, loading } = useAuth();
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const [rooms, setRooms] = useState(null);
  const [history, setHistory] = useState(null);

  useEffect(() => {
    if (loading) return;
    if (!isSignedIn) {
      router.replace(`/login?redirect=${encodeURIComponent("/party")}`);
      return;
    }
    let alive = true;
    const load = () => {
      listPublicParties()
        .then((r) => alive && setRooms(r.rooms || []))
        .catch(() => alive && setRooms([]));
    };
    load();
    partyHistory()
      .then((r) => alive && setHistory(r.parties || []))
      .catch(() => alive && setHistory([]));
    const iv = setInterval(load, 15_000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [loading, isSignedIn, router]);

  const clean = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const submit = (e) => {
    e.preventDefault();
    if (clean.length !== 6) {
      setCodeError("Room IDs are 6 letters/numbers, e.g. K7P2QX.");
      return;
    }
    router.push(`/party/${clean}`);
  };

  const live = (history || []).filter((p) => !p.endedAt);
  const past = (history || []).filter((p) => p.endedAt);
  const heroPosters = [...(rooms || []), ...(history || [])].map((r) => r.content?.poster).filter(Boolean).slice(0, 6);

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroGlow} />
        <div className={styles.heroText}>
          <span className={styles.eyebrow}>
            <span className={styles.eyebrowDot} /> Watch Party
          </span>
          <h1 className={styles.heroTitle}>
            Watch together, <span>wherever you are.</span>
          </h1>
          <p className={styles.heroSub}>
            Start a party from any movie or show, invite friends with a room ID or a private link, and watch in perfect
            sync with voice and chat.
          </p>
          <form className={styles.joinBox} onSubmit={submit}>
            <input
              className={styles.codeInput}
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setCodeError("");
              }}
              placeholder="Enter room ID"
              maxLength={8}
              aria-label="Room ID"
              autoComplete="off"
              spellCheck={false}
            />
            <button type="submit" className={styles.primaryBtn} disabled={clean.length < 6}>
              Join <ArrowRight size={16} />
            </button>
          </form>
          {codeError && <p className={styles.joinError}>{codeError}</p>}
          <Link href="/" className={styles.ghostLink}>
            <Film size={15} /> Or pick a title and press “Watch together”
          </Link>
        </div>
        <div className={styles.heroArt} aria-hidden="true">
          <div className={styles.heroPosters}>
            {Array.from({ length: 9 }).map((_, i) => (
              <div
                key={i}
                className={styles.heroPoster}
                style={
                  heroPosters[i % (heroPosters.length || 1)]
                    ? { backgroundImage: `url(${heroPosters[i % heroPosters.length]})` }
                    : { background: `linear-gradient(160deg, hsl(${270 + i * 12} 45% 26%), #15151b)` }
                }
              />
            ))}
          </div>
          <div className={styles.heroArtFade} />
          <div className={styles.chatMock}>
            <div className={styles.chatMockMsg}>
              <b>Sara</b>no way 😂
            </div>
            <div className={styles.chatMockMsg}>
              <b>Ali</b>rewind that part!
            </div>
            <div className={`${styles.chatMockMsg} ${styles.chatMockMine}`}>on it 🔥</div>
          </div>
        </div>
      </section>

      <div className={styles.features}>
        {FEATURES.map(({ icon: Icon, title, text }) => (
          <div key={title} className={styles.feature}>
            <span className={styles.featureIcon}>
              <Icon size={18} />
            </span>
            <div>
              <strong>{title}</strong>
              <span>{text}</span>
            </div>
          </div>
        ))}
      </div>

      {live.length > 0 && (
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2>Your live parties</h2>
            <span className={styles.countBadge}>{live.length}</span>
          </div>
          <div className={styles.grid}>
            {live.map((r) => (
              <RoomCard key={r.id} room={r} meta={`Room ${r.code} · ${r.role === "HOST" ? "You're hosting" : "Joined"}`} />
            ))}
          </div>
        </section>
      )}

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2>Public parties</h2>
          {rooms?.length ? <span className={styles.countBadge}>{rooms.length} live</span> : null}
        </div>
        {rooms === null ? (
          <SkeletonGrid />
        ) : rooms.length === 0 ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}>
              <Users size={22} />
            </span>
            <div>
              <strong>No public parties right now</strong>
              <span>Start one from any title — public rooms show up here for everyone.</span>
            </div>
            <Link href="/" className={`${styles.primaryBtn} ${styles.emptyAction}`}>
              Browse titles
            </Link>
          </div>
        ) : (
          <div className={styles.grid}>
            {rooms.map((r) => (
              <RoomCard key={r.id} room={r} watching={r.online} meta={`Hosted by ${r.host?.name || "someone"}`} />
            ))}
          </div>
        )}
      </section>

      {past.length > 0 && (
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2>Recently watched together</h2>
            <span className={styles.countBadge}>
              <RefreshCw size={11} style={{ marginRight: 4 }} /> history
            </span>
          </div>
          <div className={styles.grid}>
            {past.map((r) => (
              <RoomCard
                key={r.id}
                room={r}
                ended
                meta={`${r.memberCount} watched · ${new Date(r.joinedAt).toLocaleDateString()}`}
              />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function SkeletonGrid() {
  return (
    <div className={styles.grid} aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className={styles.skeleton} />
      ))}
    </div>
  );
}

function RoomCard({ room, meta, ended = false, watching = null }) {
  const title = room.content?.title || "Untitled";
  const hue = hueFor(room.host?.id || room.id);
  const body = (
    <>
      <div className={styles.thumb}>
        {room.content?.poster ? (
          <img src={room.content.poster} alt="" loading="lazy" />
        ) : (
          <div className={styles.thumbFallback} style={{ background: `linear-gradient(135deg, hsl(${hue} 50% 28%), #121217)` }}>
            {title}
          </div>
        )}
        <div className={styles.thumbShade} />
        {ended ? <span className={styles.badgeEnded}>ENDED</span> : <span className={styles.badgeLive}>LIVE</span>}
        {room.visibility === "PRIVATE" && (
          <span className={styles.badgePrivate}>
            <Lock size={10} /> Private
          </span>
        )}
        {watching ? (
          <span className={styles.watchers}>
            <Users size={13} /> {watching} watching
          </span>
        ) : null}
      </div>
      <div className={styles.cardBody}>
        <span className={styles.hostAvatar} style={{ background: `hsl(${hue} 55% 32%)`, color: `hsl(${hue} 90% 88%)` }}>
          {room.host?.avatarUrl ? <img src={room.host.avatarUrl} alt="" /> : (room.host?.name || "?").charAt(0).toUpperCase()}
        </span>
        <div className={styles.cardText}>
          <div className={styles.cardTitle}>{room.name || title}</div>
          <div className={styles.cardMeta}>
            {room.name ? `${title} · ` : ""}
            {meta}
          </div>
        </div>
        {!ended && <span className={styles.joinPill}>Join</span>}
      </div>
    </>
  );
  if (ended) return <div className={`${styles.card} ${styles.cardEnded}`}>{body}</div>;
  return (
    <Link href={`/party/${room.code}`} className={styles.card}>
      {body}
    </Link>
  );
}
