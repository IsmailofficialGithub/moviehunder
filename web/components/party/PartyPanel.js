"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, Check, LogOut, Power, Share2, Users, MessageCircle, Mic, MicOff, Lock, Globe } from "lucide-react";
import VoiceBar from "./VoiceBar";
import Avatar, { hueFor } from "./Avatar";
import { partyShareLink } from "../../lib/party/api";
import styles from "./party.module.css";

const QUICK_REACTIONS = ["😂", "😮", "😍", "🔥", "👏", "😢"];

/** Room header (code, invite, end/leave), chat with reactions, and the member list with host tools. */
export default function PartyPanel({ party, voice, inviteToken, onLeave }) {
  const { room, members, chat, you, isHost, actions, status } = party;
  const [tab, setTab] = useState("chat");
  const [copied, setCopied] = useState(null);

  if (!room) return null;
  const shareRoom = { code: room.code, inviteToken };

  const copy = async (what, text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  const share = async () => {
    const url = partyShareLink(shareRoom);
    if (navigator.share) {
      try {
        await navigator.share({ title: "Join my watch party", text: room.content?.title || "", url });
        return;
      } catch {
        /* cancelled → fall back to copy */
      }
    }
    copy("link", url);
  };

  return (
    <section className={styles.panel} aria-label="Watch party">
      <div className={styles.panelHeader}>
        <div className={styles.roomTitle}>
          <span className={`${styles.statusDot} ${status === "open" ? styles.statusOnline : styles.statusOffline}`} aria-hidden="true" />
          <div className={styles.roomTitleText}>
            <h2>{room.name || room.content?.title || "Watch party"}</h2>
            <span className={styles.muted}>
              {room.visibility === "PUBLIC" ? <Globe size={11} /> : <Lock size={11} />}{" "}
              {room.visibility === "PUBLIC" ? "Public" : "Private"} · {members.length}/{room.maxMembers} watching
              {status !== "open" ? " · reconnecting" : ""}
            </span>
          </div>
          <div className={styles.avatarStack} aria-label={`${members.length} people in the party`}>
            {members.slice(0, 5).map((m) => (
              <Avatar key={m.userId} id={m.userId} name={m.name} src={m.avatarUrl} size={26} speaking={voice?.speakers?.includes(m.userId)} />
            ))}
            {members.length > 5 && <span className={styles.avatarMore}>+{members.length - 5}</span>}
          </div>
        </div>
        <div className={styles.headerActions}>
          <button type="button" className={`${styles.btn} ${styles.codeBtn}`} onClick={() => copy("code", room.code)} title="Copy room ID">
            <span className={styles.code}>{room.code}</span>
            {copied === "code" ? <Check size={14} /> : <Copy size={14} />}
          </button>
          {inviteToken && (
            <button type="button" className={styles.btn} onClick={share}>
              {copied === "link" ? <Check size={14} /> : <Share2 size={14} />} Invite link
            </button>
          )}
          {isHost ? (
            <button
              type="button"
              className={`${styles.btn} ${styles.btnDanger}`}
              onClick={() => window.confirm("End the party for everyone?") && actions.end()}
            >
              <Power size={14} /> End party
            </button>
          ) : (
            <button type="button" className={styles.btn} onClick={onLeave}>
              <LogOut size={14} /> Leave
            </button>
          )}
        </div>
      </div>

      {voice ? <VoiceBar voice={voice} /> : null}

      <div className={styles.tabs} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "chat"}
          className={`${styles.tab} ${tab === "chat" ? styles.tabActive : ""}`}
          onClick={() => setTab("chat")}
        >
          <MessageCircle size={13} style={{ verticalAlign: -2 }} /> Chat
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "people"}
          className={`${styles.tab} ${tab === "people" ? styles.tabActive : ""}`}
          onClick={() => setTab("people")}
        >
          <Users size={13} style={{ verticalAlign: -2 }} /> People ({members.length})
        </button>
      </div>

      {tab === "chat" ? (
        <ChatTab chat={chat} actions={actions} myId={you?.userId} />
      ) : (
        <PeopleTab members={members} you={you} isHost={isHost} actions={actions} voice={voice} myRole={party.role} />
      )}
    </section>
  );
}

function ChatTab({ chat, actions, myId }) {
  const [text, setText] = useState("");
  const listRef = useRef(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.length]);

  const submit = (e) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    actions.sendChat(t);
    setText("");
  };

  return (
    <>
      <div className={styles.chatList} ref={listRef} aria-live="polite">
        {chat.length === 0 && (
          <div className={styles.emptyChat}>
            <MessageCircle size={22} />
            <p>Say hi 👋</p>
            <span className={styles.muted}>Messages are only kept while the party is live.</span>
          </div>
        )}
        {chat.map((m, i) => {
          const mine = m.userId === myId;
          const grouped = i > 0 && chat[i - 1].userId === m.userId && m.at - chat[i - 1].at < 120_000;
          return (
            <div key={m.id} className={`${styles.chatRow} ${mine ? styles.chatRowMine : ""} ${grouped ? styles.chatRowGrouped : ""}`}>
              {!mine && (grouped ? <span className={styles.avatarSpacer} /> : <Avatar id={m.userId} name={m.name} size={26} />)}
              <div className={styles.chatBubbleWrap}>
                {!mine && !grouped && (
                  <span className={styles.chatName} style={{ color: `hsl(${hueFor(m.userId)} 80% 75%)` }}>
                    {m.name}
                  </span>
                )}
                <div className={`${styles.chatBubble} ${mine ? styles.chatBubbleMine : ""}`} title={new Date(m.at).toLocaleTimeString()}>
                  {m.text}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className={styles.reactBar}>
        {QUICK_REACTIONS.map((e) => (
          <button key={e} type="button" className={styles.reactBtn} onClick={() => actions.react(e)} aria-label={`React ${e}`}>
            {e}
          </button>
        ))}
      </div>
      <form className={styles.chatForm} onSubmit={submit}>
        <input
          className={styles.input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={500}
          placeholder="Message the party"
          aria-label="Chat message"
        />
        <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`}>
          Send
        </button>
      </form>
    </>
  );
}

function PeopleTab({ members, you, isHost, actions, voice, myRole }) {
  const speaking = new Set(voice?.speakers || []);
  const order = { HOST: 0, COHOST: 1, VIEWER: 2 };
  const sorted = [...members].sort((a, b) => order[a.role] - order[b.role] || a.name.localeCompare(b.name));
  return (
    <ul className={styles.memberList}>
      {sorted.map((m) => {
        const isMe = m.userId === you?.userId;
        return (
          <li key={m.userId} className={styles.member}>
            <Avatar id={m.userId} name={m.name} src={m.avatarUrl} speaking={speaking.has(m.userId)} />
            <div className={styles.memberInfo}>
              <div className={styles.memberName}>
                {m.name}
                {isMe && " (you)"}
                {m.role !== "VIEWER" && <span className={styles.badge}>{m.role === "HOST" ? "HOST" : "CO-HOST"}</span>}
                {voice?.mics?.[m.userId] ? (
                  <Mic size={12} style={{ marginLeft: 6, verticalAlign: -1 }} aria-label="Mic on" />
                ) : voice?.mics?.[m.userId] === false ? (
                  <MicOff size={12} style={{ marginLeft: 6, verticalAlign: -1, opacity: 0.6 }} aria-label="Mic off" />
                ) : null}
              </div>
              <div className={`${styles.syncState} ${m.buffering ? styles.syncWarn : m.detached ? styles.syncAway : styles.syncOk}`}>
                {m.buffering ? "Buffering…" : m.detached ? "Watching on their own" : "In sync"}
              </div>
            </div>
            {!isMe && voice?.mics?.[m.userId] && (isHost || (myRole === "COHOST" && m.role === "VIEWER")) && (
              <button type="button" className={styles.linkBtn} onClick={() => voice.hostMute(m.userId)}>
                Mute
              </button>
            )}
            {isHost && !isMe && (
              <div className={styles.memberActions}>
                <button
                  type="button"
                  className={styles.linkBtn}
                  onClick={() => actions.setRole(m.userId, m.role === "COHOST" ? "VIEWER" : "COHOST")}
                >
                  {m.role === "COHOST" ? "Remove co-host" : "Make co-host"}
                </button>
                <button type="button" className={styles.linkBtn} onClick={() => actions.transferHost(m.userId)}>
                  Make host
                </button>
                <button
                  type="button"
                  className={`${styles.linkBtn} ${styles.btnDanger}`}
                  onClick={() => window.confirm(`Remove ${m.name} from the party?`) && actions.kick(m.userId)}
                >
                  Remove
                </button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
