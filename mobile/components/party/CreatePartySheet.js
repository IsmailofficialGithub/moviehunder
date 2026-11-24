import { useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors, radii, spacing } from "../../lib/theme";
import { useAuth } from "../../lib/AuthProvider";
import { createParty } from "../../lib/party/api";
import AuthModal from "../AuthModal";

// Tickets handed from "create" to the room screen without a second join round-trip.
export const pendingTickets = new Map();

/** "Watch together" button + bottom sheet to create a room for `content`. */
export default function CreatePartySheet({ content, style }) {
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const [open, setOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [visibility, setVisibility] = useState("PRIVATE");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
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
        ...content,
      });
      pendingTickets.set(res.room.code, { ticket: res.ticket, inviteToken: res.room.inviteToken || null });
      setOpen(false);
      router.push({ pathname: "/party/[code]", params: { code: res.room.code } });
    } catch (err) {
      setError(err.message || "Could not create the party");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Pressable
        style={[styles.trigger, style]}
        onPress={() => (isSignedIn ? setOpen(true) : setAuthOpen(true))}
        disabled={!content?.subjectId}
        accessibilityRole="button"
      >
        <Ionicons name="people-outline" size={16} color={colors.accentLight} />
        <Text style={styles.triggerText}>Watch together</Text>
      </Pressable>

      <AuthModal visible={authOpen} onClose={() => setAuthOpen(false)} />

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => !busy && setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => !busy && setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.title}>Start a watch party</Text>
            <Text style={styles.muted}>Everyone watches {content?.title || "this title"} in sync. You control playback.</Text>

            <View style={styles.segmented}>
              {[
                ["PRIVATE", "Private", "Room ID + password or invite link"],
                ["PUBLIC", "Public", "Listed in the party lobby"],
              ].map(([v, label, sub]) => (
                <Pressable key={v} style={[styles.segment, visibility === v && styles.segmentActive]} onPress={() => setVisibility(v)}>
                  <Text style={styles.segmentLabel}>{label}</Text>
                  <Text style={styles.muted}>{sub}</Text>
                </Pressable>
              ))}
            </View>

            {visibility === "PRIVATE" ? (
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="Room password"
                placeholderTextColor={colors.muted}
                secureTextEntry
                maxLength={64}
              />
            ) : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable style={[styles.primary, busy && { opacity: 0.6 }]} onPress={submit} disabled={busy}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Create party</Text>}
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    backgroundColor: colors.accentMuted,
  },
  triggerText: { color: colors.accentLight, fontWeight: "700", fontSize: 14 },
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.6)" },
  sheet: {
    backgroundColor: colors.panel,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  title: { color: colors.text, fontSize: 18, fontWeight: "700" },
  muted: { color: colors.muted, fontSize: 12 },
  segmented: { flexDirection: "row", gap: 8, marginTop: spacing.xs },
  segment: {
    flex: 1,
    padding: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bg,
    gap: 2,
  },
  segmentActive: { borderColor: colors.secondary, backgroundColor: colors.accentMuted },
  segmentLabel: { color: colors.text, fontWeight: "700" },
  input: {
    color: colors.text,
    backgroundColor: colors.bg,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  error: { color: colors.danger, fontSize: 13 },
  primary: {
    marginTop: spacing.xs,
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
