// Watch-party room. Deep links: moviehunter://party/CODE and https://<site>/party/CODE?invite=TOKEN
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { colors, radii, spacing } from "../../lib/theme";
import { useAuth } from "../../lib/AuthProvider";
import { joinParty, normalizeRoomCode } from "../../lib/party/api";
import { usePartyRoom } from "../../lib/party/usePartyRoom";
import { usePartyVoice } from "../../lib/party/usePartyVoice";
import { pendingTickets } from "../../components/party/CreatePartySheet";
import PartyOverlay from "../../components/party/PartyOverlay";
import AuthModal from "../../components/AuthModal";
import PlayScreen from "../play";

const FATAL_TEXT = {
  ROOM_NOT_FOUND: "This party has ended or doesn't exist.",
  BANNED: "You were removed from this party.",
  KICKED: "You were removed from this party.",
  NOT_A_MEMBER: "You're not a member of this party.",
  ROOM_FULL: "This party is full.",
  JOIN_FAILED: "Couldn't join the party. Check your connection and try again.",
};

export default function PartyRoomScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const code = normalizeRoomCode(params.code);
  const invite = String(params.invite || "");
  const { isSignedIn, loading } = useAuth();

  const [phase, setPhase] = useState("joining"); // joining | password | ready | error
  const [joined, setJoined] = useState(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const join = useCallback(
    async (pw) => {
      setBusy(true);
      setError("");
      try {
        const res = await joinParty({ code, invite: invite || undefined, password: pw });
        setJoined({ ticket: res.ticket, inviteToken: res.room?.inviteToken || null });
        setPhase("ready");
      } catch (err) {
        if (err.status === 401 && !invite && /password/i.test(err.message || "")) {
          setPhase("password");
          if (pw !== undefined) setError(err.message);
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
    if (loading || !isSignedIn || !code) return;
    const pending = pendingTickets.get(code);
    if (pending) {
      pendingTickets.delete(code);
      setJoined(pending);
      setPhase("ready");
      return;
    }
    join();
  }, [loading, isSignedIn, code, join]);

  const party = usePartyRoom({ code, initialTicket: joined?.ticket || null, enabled: phase === "ready" });
  const voice = usePartyVoice(party);
  const leave = useCallback(() => (router.canGoBack() ? router.back() : router.replace("/")), [router]);

  const partyProp = useMemo(() => {
    const content = party.room?.content;
    if (!content) return null;
    return {
      content,
      role: party.role,
      canControl: party.canControl,
      onNavigate: party.actions.navigate,
      onPlayer: party.onPlayer,
      onLocalSeek: party.onLocalSeek,
      overlay: <PartyOverlay party={party} voice={voice} inviteToken={joined?.inviteToken || null} onLeave={leave} />,
    };
  }, [party, voice, joined, leave]);

  if (!loading && !isSignedIn) {
    return (
      <Centered>
        <Text style={styles.title}>Sign in to join party {code}</Text>
        <Text style={styles.muted}>Watch parties need an account so the host knows who's watching.</Text>
        <AuthModal visible onClose={leave} />
      </Centered>
    );
  }

  if (phase === "password") {
    return (
      <Centered>
        <Text style={styles.title}>Join party {code}</Text>
        <Text style={styles.muted}>Private room — ask the host for the password or an invite link.</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder="Room password"
          placeholderTextColor={colors.muted}
          secureTextEntry
          autoFocus
          onSubmitEditing={() => password && join(password)}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable style={[styles.primary, (!password || busy) && { opacity: 0.6 }]} disabled={!password || busy} onPress={() => join(password)}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Join</Text>}
        </Pressable>
        <Pressable onPress={leave} style={styles.secondary}>
          <Text style={styles.muted}>Back</Text>
        </Pressable>
      </Centered>
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
      <Centered>
        <Text style={styles.title}>Party unavailable</Text>
        <Text style={styles.muted}>{fatalText}</Text>
        <Pressable style={styles.primary} onPress={() => router.replace("/party")}>
          <Text style={styles.primaryText}>Find a party</Text>
        </Pressable>
      </Centered>
    );
  }

  if (!partyProp) {
    return (
      <Centered>
        <ActivityIndicator color={colors.accentLight} />
        <Text style={styles.muted}>{party.status === "reconnecting" ? "Reconnecting…" : "Joining the party…"}</Text>
      </Centered>
    );
  }

  return <PlayScreen party={partyProp} />;
}

function Centered({ children }) {
  return (
    <View style={styles.center}>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center", padding: spacing.lg },
  card: { width: "100%", maxWidth: 420, gap: spacing.sm },
  title: { color: colors.text, fontSize: 18, fontWeight: "700" },
  muted: { color: colors.muted, fontSize: 13 },
  error: { color: colors.danger, fontSize: 13 },
  input: {
    color: colors.text,
    backgroundColor: colors.panel,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  primary: { backgroundColor: colors.accent, borderRadius: radii.md, paddingVertical: 12, alignItems: "center" },
  primaryText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  secondary: { alignItems: "center", paddingVertical: 8 },
});
