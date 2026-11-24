import { useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors, radii } from "../../lib/theme";
import PartySheet from "./PartySheet";

/** Sits on top of the player: live/behind pill, party button (opens the sheet), floating reactions. */
export default function PartyOverlay({ party, voice, inviteToken, onLeave }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const holdRef = useRef(false); // true while hold-to-talk is active
  const { status, detached, behindBy, canControl, members, room, reactions, chat, actions } = party;
  const host = members.find((m) => m.userId === room?.hostUserId);
  const [seenChat, setSeenChat] = useState(0);
  const unread = sheetOpen ? 0 : Math.max(0, chat.length - seenChat);

  let pill;
  if (status === "reconnecting" || status === "connecting") {
    pill = (
      <View style={[styles.pill, styles.pillWarn]}>
        <Text style={styles.pillText}>Reconnecting…</Text>
      </View>
    );
  } else if (detached) {
    pill = (
      <Pressable style={[styles.pill, styles.pillAction]} onPress={actions.jumpToLive} accessibilityRole="button">
        <Text style={styles.pillText}>
          {behindBy > 1 ? `Behind by ${formatSecs(behindBy)} · ` : ""}Jump to live
        </Text>
      </Pressable>
    );
  } else {
    pill = (
      <View style={styles.pill}>
        <View style={styles.liveDot} />
        <Text style={styles.pillText} numberOfLines={1}>
          {canControl ? "Live · you control" : `Live${host ? ` · ${host.name}` : ""}`}
        </Text>
      </View>
    );
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <View style={styles.topRow} pointerEvents="box-none">
        {pill}
        {host?.buffering && !canControl ? (
          <View style={[styles.pill, styles.pillWarn]}>
            <Text style={styles.pillText}>Host buffering…</Text>
          </View>
        ) : null}
        {voice?.available ? (
          <Pressable
            style={[styles.pill, styles.partyBtn, voice.micLive && voice.micOn && styles.micOn]}
            onPress={() => (voice.micLive ? voice.toggleMic() : voice.startMic())}
            onLongPress={() => {
              if (!voice.micLive || voice.micOn) return;
              holdRef.current = true; // hold-to-talk: unmute while pressed
              voice.setMic(true);
            }}
            onPressOut={() => holdRef.current && voice.setMic(false)}
            delayLongPress={300}
            onPressIn={() => (holdRef.current = false)}
            accessibilityLabel={voice.micLive ? (voice.micOn ? "Mute mic" : "Unmute mic") : "Join voice"}
          >
            <Ionicons name={voice.micLive && voice.micOn ? "mic" : "mic-off"} size={14} color="#fff" />
            {!voice.micLive ? <Text style={styles.pillText}>Voice</Text> : null}
          </Pressable>
        ) : null}
        <Pressable
          style={[styles.pill, !voice?.available && styles.partyBtn]}
          onPress={() => {
            setSheetOpen(true);
            setSeenChat(chat.length);
          }}
          accessibilityLabel="Open watch party"
        >
          <Ionicons name="people" size={14} color="#fff" />
          <Text style={styles.pillText}>{members.length}</Text>
          {unread > 0 ? <View style={styles.unreadDot} /> : null}
        </Pressable>
      </View>

      {voice?.speakers?.length ? (
        <View style={styles.speakerRow} pointerEvents="none">
          {voice.speakers.map((id) => {
            const m = members.find((x) => x.userId === id);
            return m ? (
              <View key={id} style={[styles.pill, styles.speakerPill]}>
                <Text style={styles.pillText}>🎙 {m.name}</Text>
              </View>
            ) : null;
          })}
        </View>
      ) : null}

      <View style={styles.reactions} pointerEvents="none">
        {reactions.map((r, i) => (
          <Text key={r.id} style={[styles.reaction, { right: (i * 23) % 36, bottom: 20 + ((i * 41) % 120) }]}>
            {r.emoji}
          </Text>
        ))}
      </View>

      <PartySheet
        visible={sheetOpen}
        onClose={() => {
          setSheetOpen(false);
          setSeenChat(chat.length);
        }}
        party={party}
        voice={voice}
        inviteToken={inviteToken}
        onLeave={onLeave}
      />
    </View>
  );
}

function formatSecs(s) {
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}

const styles = StyleSheet.create({
  topRow: {
    position: "absolute",
    top: 14,
    left: 56,
    right: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  pillWarn: { borderColor: "rgba(245,197,24,0.5)" },
  pillAction: { backgroundColor: colors.accent, borderColor: colors.accentBorder },
  partyBtn: { marginLeft: "auto" },
  micOn: { backgroundColor: "#16a34a", borderColor: "#22c55e" },
  speakerRow: { position: "absolute", left: 56, bottom: 90, flexDirection: "row", gap: 6, flexWrap: "wrap" },
  speakerPill: { borderColor: "rgba(34,197,94,0.6)" },
  pillText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#22c55e" },
  unreadDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.secondary },
  reactions: { position: "absolute", right: 20, bottom: 80, width: 60, height: 200 },
  reaction: { position: "absolute", fontSize: 26 },
});
