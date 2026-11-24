// Watch-party lobby: join by room ID, live public parties, your party history.
import { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, Image, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors, radii, spacing } from "../../lib/theme";
import { useAuth } from "../../lib/AuthProvider";
import { listPublicParties, normalizeRoomCode, partyHistory } from "../../lib/party/api";
import AuthModal from "../../components/AuthModal";

export default function PartyLobbyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isSignedIn, loading } = useAuth();
  const [code, setCode] = useState("");
  const [rooms, setRooms] = useState([]);
  const [total, setTotal] = useState(0);
  const seenRef = useRef([]);
  const [history, setHistory] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  // 10 random live public rooms; "Show others" skips rooms already shown.
  const applyRooms = (pub) => {
    const list = pub?.rooms || [];
    const unseen = list.filter((x) => !seenRef.current.includes(x.id)).map((x) => x.id);
    seenRef.current = unseen.length ? [...seenRef.current, ...unseen] : list.map((x) => x.id);
    setRooms(list);
    setTotal(pub?.total ?? list.length);
  };

  const load = useCallback(async () => {
    setRefreshing(true);
    seenRef.current = [];
    const [pub, hist] = await Promise.all([listPublicParties().catch(() => null), partyHistory().catch(() => null)]);
    applyRooms(pub);
    setHistory((hist?.parties || []).filter((p) => !p.endedAt));
    setRefreshing(false);
  }, []);

  const showOthers = useCallback(async () => {
    setRefreshing(true);
    const pub = await listPublicParties(seenRef.current).catch(() => null);
    if (pub) applyRooms(pub);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    if (isSignedIn) load();
  }, [isSignedIn, load]);

  const open = (c) => router.push({ pathname: "/party/[code]", params: { code: c } });
  const clean = normalizeRoomCode(code);

  const sections = [
    ...(history.length ? [{ header: "Your live parties" }, ...history.map((r) => ({ room: r, mine: true }))] : []),
    { header: total ? `Public parties · ${total} live` : "Public parties", others: total > rooms.length },
    ...rooms.map((r) => ({ room: r })),
  ];

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.h1}>Watch parties</Text>
      </View>

      <View style={styles.joinRow}>
        <TextInput
          style={styles.input}
          value={code}
          onChangeText={setCode}
          placeholder="Room ID"
          placeholderTextColor={colors.muted}
          autoCapitalize="characters"
          maxLength={8}
          onSubmitEditing={() => clean.length === 6 && open(clean)}
        />
        <Pressable style={[styles.btn, clean.length !== 6 && { opacity: 0.5 }]} disabled={clean.length !== 6} onPress={() => open(clean)}>
          <Text style={styles.btnText}>Join</Text>
        </Pressable>
      </View>

      <FlatList
        data={sections}
        keyExtractor={(item, i) => item.header || `${item.mine ? "m" : "p"}-${item.room.id}-${i}`}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={colors.accentLight} />}
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.lg }}
        ListFooterComponent={
          !rooms.length ? <Text style={[styles.muted, { paddingHorizontal: spacing.md }]}>No public parties right now.</Text> : null
        }
        renderItem={({ item }) =>
          item.header ? (
            <View style={styles.headRow}>
              <Text style={[styles.h2, { flex: 1 }]}>{item.header}</Text>
              {item.others ? (
                <Pressable style={styles.othersBtn} onPress={showOthers} disabled={refreshing}>
                  <Ionicons name="shuffle" size={14} color={colors.text} />
                  <Text style={styles.othersText}>Show others</Text>
                </Pressable>
              ) : null}
            </View>
          ) : (
            <Pressable style={styles.roomRow} onPress={() => open(item.room.code)}>
              {item.room.content?.poster ? (
                <Image source={{ uri: item.room.content.poster }} style={styles.poster} />
              ) : (
                <View style={styles.poster} />
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.roomTitle} numberOfLines={1}>
                  {item.room.name || item.room.content?.title || "Watch party"}
                </Text>
                <Text style={styles.muted} numberOfLines={1}>
                  {item.mine
                    ? `Room ${item.room.code}`
                    : `${item.room.online} watching · ${item.room.host?.name || "Host"}`}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </Pressable>
          )
        }
      />
      <AuthModal visible={!loading && !isSignedIn} onClose={() => router.back()} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  headerRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md },
  h1: { color: colors.text, fontSize: 22, fontWeight: "800" },
  h2: { color: colors.text, fontSize: 16, fontWeight: "700", marginTop: spacing.lg, marginBottom: spacing.xs, paddingHorizontal: spacing.md },
  muted: { color: colors.muted, fontSize: 12 },
  joinRow: { flexDirection: "row", gap: 8, padding: spacing.md },
  input: {
    flex: 1,
    color: colors.text,
    backgroundColor: colors.panel,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 12,
    paddingVertical: 10,
    letterSpacing: 2,
    fontWeight: "700",
  },
  btn: { backgroundColor: colors.accent, borderRadius: radii.sm, paddingHorizontal: 18, justifyContent: "center" },
  btnText: { color: "#fff", fontWeight: "700" },
  roomRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: 8 },
  poster: { width: 96, height: 54, borderRadius: radii.sm, backgroundColor: colors.panelSoft },
  roomTitle: { color: colors.text, fontSize: 14, fontWeight: "600" },
  headRow: { flexDirection: "row", alignItems: "center", paddingRight: spacing.md },
  othersBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: spacing.lg,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
  },
  othersText: { color: colors.text, fontSize: 12, fontWeight: "600" },
});
