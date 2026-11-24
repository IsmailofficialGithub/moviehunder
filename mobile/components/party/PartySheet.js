import { useRef, useState } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors, radii, spacing } from "../../lib/theme";
import { partyShareLink } from "../../lib/party/api";

const QUICK_REACTIONS = ["😂", "😮", "😍", "🔥", "👏", "😢"];

/** Right-side sheet: room info + invite, chat with reactions, people with host tools. */
export default function PartySheet({ visible, onClose, party, voice, inviteToken, onLeave }) {
  const { room, members, chat, you, isHost, actions } = party;
  const [tab, setTab] = useState("chat");
  const [text, setText] = useState("");
  const listRef = useRef(null);
  if (!room) return null;

  const share = () => {
    const url = partyShareLink({ code: room.code, inviteToken });
    const msg = inviteToken
      ? `Join my watch party: ${url}`
      : `Join my watch party on MovieHunter — Room ID ${room.code}`;
    Share.share({ message: msg, url }).catch(() => {});
  };

  const send = () => {
    const t = text.trim();
    if (!t) return;
    actions.sendChat(t);
    setText("");
  };

  const speaking = new Set(voice?.speakers || []);
  const canMute = (m) => voice?.mics?.[m.userId] && (isHost || (party.role === "COHOST" && m.role === "VIEWER"));
  const memberMenu = (m) => {
    if (m.userId === you?.userId) return;
    if (!isHost) {
      if (canMute(m)) {
        Alert.alert(m.name, undefined, [
          { text: "Mute mic", onPress: () => voice.hostMute(m.userId) },
          { text: "Cancel", style: "cancel" },
        ]);
      }
      return;
    }
    Alert.alert(m.name, undefined, [
      ...(canMute(m) ? [{ text: "Mute mic", onPress: () => voice.hostMute(m.userId) }] : []),
      {
        text: m.role === "COHOST" ? "Remove co-host" : "Make co-host",
        onPress: () => actions.setRole(m.userId, m.role === "COHOST" ? "VIEWER" : "COHOST"),
      },
      { text: "Make host", onPress: () => actions.transferHost(m.userId) },
      { text: "Remove from party", style: "destructive", onPress: () => actions.kick(m.userId) },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} supportedOrientations={["landscape", "portrait"]}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.sheet}
          onStartShouldSetResponder={() => true}
        >
          <Pressable style={{ flex: 1 }} onPress={() => {}}>
            <View style={styles.header}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title} numberOfLines={1}>
                  {room.name || "Watch party"}
                </Text>
                <Text style={styles.muted}>
                  Room ID <Text style={styles.code}>{room.code}</Text> · {members.length}/{room.maxMembers}
                </Text>
              </View>
              <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
                <Ionicons name="close" size={22} color={colors.text} />
              </Pressable>
            </View>

            <View style={styles.actionsRow}>
              <Pressable style={styles.btn} onPress={share}>
                <Ionicons name="share-social-outline" size={14} color={colors.text} />
                <Text style={styles.btnText}>Invite</Text>
              </Pressable>
              {isHost ? (
                <Pressable
                  style={styles.btn}
                  onPress={() =>
                    Alert.alert("End the party?", "Everyone will be disconnected.", [
                      { text: "Cancel", style: "cancel" },
                      { text: "End party", style: "destructive", onPress: actions.end },
                    ])
                  }
                >
                  <Ionicons name="power" size={14} color={colors.danger} />
                  <Text style={[styles.btnText, { color: colors.danger }]}>End</Text>
                </Pressable>
              ) : (
                <Pressable style={styles.btn} onPress={onLeave}>
                  <Ionicons name="exit-outline" size={14} color={colors.text} />
                  <Text style={styles.btnText}>Leave</Text>
                </Pressable>
              )}
            </View>

            {voice?.available ? (
              <View style={styles.voiceRow}>
                {!voice.micLive ? (
                  <Pressable style={[styles.btn, styles.btnPrimary]} onPress={voice.startMic} disabled={voice.forceMuted}>
                    <Ionicons name="mic" size={14} color="#fff" />
                    <Text style={styles.btnText}>Join voice</Text>
                  </Pressable>
                ) : (
                  <>
                    <Pressable style={[styles.btn, voice.micOn && styles.btnPrimary]} onPress={voice.toggleMic} disabled={voice.forceMuted}>
                      <Ionicons name={voice.micOn ? "mic" : "mic-off"} size={14} color="#fff" />
                      <Text style={styles.btnText}>{voice.micOn ? "Mute" : "Unmute"}</Text>
                    </Pressable>
                    <Pressable style={styles.btn} onPress={voice.stopMic}>
                      <Ionicons name="call-outline" size={14} color={colors.text} />
                      <Text style={styles.btnText}>Leave voice</Text>
                    </Pressable>
                  </>
                )}
                {voice.forceMuted ? <Text style={styles.muted}>The host muted you</Text> : null}
                {voice.error === "MIC_BLOCKED" ? <Text style={[styles.muted, { color: colors.danger }]}>Microphone permission denied</Text> : null}
              </View>
            ) : voice && !voice.supported ? (
              <Text style={[styles.muted, { paddingHorizontal: spacing.md, paddingBottom: spacing.sm }]}>
                Update the app to use voice chat.
              </Text>
            ) : null}

            <View style={styles.tabs}>
              {["chat", "people"].map((t) => (
                <Pressable key={t} style={[styles.tab, tab === t && styles.tabActive]} onPress={() => setTab(t)}>
                  <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
                    {t === "chat" ? "Chat" : `People (${members.length})`}
                  </Text>
                </Pressable>
              ))}
            </View>

            {tab === "chat" ? (
              <>
                <FlatList
                  ref={listRef}
                  style={{ flex: 1 }}
                  contentContainerStyle={{ padding: spacing.sm, gap: 6 }}
                  data={chat}
                  keyExtractor={(m) => m.id}
                  onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
                  ListEmptyComponent={<Text style={styles.muted}>Say hi 👋</Text>}
                  renderItem={({ item }) => (
                    <Text style={styles.msg}>
                      <Text style={styles.msgName}>{item.name} </Text>
                      {item.text}
                    </Text>
                  )}
                />
                <View style={styles.reactRow}>
                  {QUICK_REACTIONS.map((e) => (
                    <Pressable key={e} onPress={() => actions.react(e)} hitSlop={4} accessibilityLabel={`React ${e}`}>
                      <Text style={{ fontSize: 22 }}>{e}</Text>
                    </Pressable>
                  ))}
                </View>
                <View style={styles.inputRow}>
                  <TextInput
                    style={styles.input}
                    value={text}
                    onChangeText={setText}
                    placeholder="Message the party"
                    placeholderTextColor={colors.muted}
                    maxLength={500}
                    returnKeyType="send"
                    onSubmitEditing={send}
                  />
                  <Pressable style={[styles.btn, styles.btnPrimary]} onPress={send}>
                    <Ionicons name="send" size={14} color="#fff" />
                  </Pressable>
                </View>
              </>
            ) : (
              <FlatList
                style={{ flex: 1 }}
                data={[...members].sort((a, b) => rank(a) - rank(b))}
                keyExtractor={(m) => m.userId}
                renderItem={({ item: m }) => (
                  <Pressable style={styles.member} onPress={() => memberMenu(m)}>
                    <View style={[styles.avatar, speaking.has(m.userId) && styles.speaking]}>
                      <Text style={styles.avatarText}>{(m.name || "?").charAt(0).toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.memberName} numberOfLines={1}>
                        {m.name}
                        {m.userId === you?.userId ? " (you)" : ""}
                        {m.role !== "VIEWER" ? `  ·  ${m.role === "HOST" ? "Host" : "Co-host"}` : ""}
                      </Text>
                      <Text style={styles.muted}>{m.buffering ? "Buffering…" : m.detached ? "Watching on their own" : "In sync"}</Text>
                    </View>
                    {voice?.mics?.[m.userId] != null ? (
                      <Ionicons name={voice.mics[m.userId] ? "mic" : "mic-off"} size={14} color={colors.muted} />
                    ) : null}
                    {isHost && m.userId !== you?.userId ? <Ionicons name="ellipsis-horizontal" size={18} color={colors.muted} /> : null}
                  </Pressable>
                )}
              />
            )}
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const rank = (m) => ({ HOST: 0, COHOST: 1, VIEWER: 2 })[m.role] ?? 3;

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "flex-end" },
  sheet: {
    width: "100%",
    maxWidth: 380,
    height: "100%",
    backgroundColor: colors.panel,
    borderLeftWidth: 1,
    borderLeftColor: colors.line,
  },
  header: { flexDirection: "row", alignItems: "center", padding: spacing.md, paddingBottom: spacing.sm, gap: spacing.sm },
  title: { color: colors.text, fontSize: 16, fontWeight: "700" },
  muted: { color: colors.muted, fontSize: 12 },
  code: { color: colors.text, fontWeight: "700", letterSpacing: 1.5 },
  actionsRow: { flexDirection: "row", gap: 8, paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panelSoft,
  },
  btnPrimary: { backgroundColor: colors.accent, borderColor: colors.accentBorder },
  btnText: { color: colors.text, fontSize: 13 },
  tabs: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: colors.line },
  tab: { flex: 1, paddingVertical: 10, alignItems: "center", borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabActive: { borderBottomColor: colors.secondary },
  tabText: { color: colors.muted, fontSize: 13, fontWeight: "600" },
  tabTextActive: { color: colors.text },
  msg: { color: colors.text, fontSize: 14, lineHeight: 19 },
  msgName: { color: colors.secondary, fontWeight: "700" },
  reactRow: { flexDirection: "row", justifyContent: "space-around", paddingVertical: 6 },
  inputRow: { flexDirection: "row", gap: 8, padding: spacing.sm, borderTopWidth: 1, borderTopColor: colors.line },
  input: {
    flex: 1,
    color: colors.text,
    backgroundColor: colors.bg,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },
  member: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: spacing.md, paddingVertical: 10 },
  avatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.accentMuted, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.text, fontWeight: "700" },
  speaking: { borderWidth: 2, borderColor: "#22c55e" },
  voiceRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: spacing.md, paddingBottom: spacing.sm, flexWrap: "wrap" },
  memberName: { color: colors.text, fontSize: 14 },
});
