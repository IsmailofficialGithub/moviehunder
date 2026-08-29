import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import ProgressBorder from "../components/ProgressBorder";
import Screen from "../components/Screen";
import { openCatalogTitle } from "../lib/catalogNav";
import {
  clearAllWatchProgress,
  clearWatchProgress,
  formatResumeTime,
  getWatchHistory,
  historyBucket,
  progressPercent,
  subscribeWatchProgress,
} from "../lib/watchProgress";
import { colors, radii, spacing } from "../lib/theme";

const GROUPS = ["Today", "Yesterday", "Last 3 days", "Last 7 days"];

export default function HistoryScreen() {
  const router = useRouter();
  const [entries, setEntries] = useState([]);

  useEffect(() => {
    const refresh = () =>
      getWatchHistory({ limit: 30 }).then(setEntries).catch(() => {});
    const unsubscribe = subscribeWatchProgress(refresh);
    refresh();
    return unsubscribe;
  }, []);

  const grouped = useMemo(() => {
    const groups = new Map(GROUPS.map((label) => [label, []]));
    for (const entry of entries) {
      const bucket = historyBucket(entry.updatedAt);
      if (groups.has(bucket)) groups.get(bucket).push(entry);
    }
    return GROUPS.map((label) => ({ label, entries: groups.get(label) })).filter(
      (group) => group.entries.length
    );
  }, [entries]);

  const confirmClearAll = () => {
    Alert.alert(
      "Clear watch history?",
      "This removes all saved watch progress from this device.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear all",
          style: "destructive",
          onPress: () => clearAllWatchProgress().catch(() => {}),
        },
      ]
    );
  };

  return (
    <Screen edges={["top", "left", "right", "bottom"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.back}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Watch history</Text>
          <Text style={styles.subtitle}>Your latest 30 videos and episodes</Text>
        </View>
        {entries.length ? (
          <Pressable onPress={confirmClearAll} hitSlop={8} style={styles.clear}>
            <Ionicons name="trash-outline" size={18} color={colors.danger} />
            <Text style={styles.clearText}>Clear</Text>
          </Pressable>
        ) : null}
      </View>

      {grouped.length ? (
        <ScrollView contentContainerStyle={styles.content}>
          {grouped.map((group) => (
            <View key={group.label} style={styles.group}>
              <Text style={styles.groupTitle}>{group.label}</Text>
              <View style={styles.grid}>
                {group.entries.map((entry) => {
                  const percent = progressPercent(entry);
                  const episode =
                    Number(entry.se) > 0 || Number(entry.ep) > 0
                      ? `S${entry.se}E${entry.ep}`
                      : "";
                  return (
                    <View key={entry.key} style={styles.card}>
                      <Pressable
                        onPress={() => openCatalogTitle(entry.detailPath)}
                        style={styles.cardPressable}
                      >
                        <ProgressBorder
                          percent={percent}
                          style={styles.posterBorder}
                        >
                          {entry.poster ? (
                            <Image
                              source={{ uri: entry.poster }}
                              style={styles.poster}
                            />
                          ) : (
                            <View style={[styles.poster, styles.posterEmpty]}>
                              <Ionicons
                                name="film-outline"
                                size={24}
                                color={colors.muted}
                              />
                            </View>
                          )}
                        </ProgressBorder>
                        <Text style={styles.name} numberOfLines={2}>
                          {entry.title}
                        </Text>
                        <Text style={styles.meta} numberOfLines={1}>
                          {[episode, `${percent}% watched`]
                            .filter(Boolean)
                            .join(" · ")}
                        </Text>
                        {entry.position ? (
                          <Text style={styles.resume} numberOfLines={1}>
                            Resume at {formatResumeTime(entry.position)}
                          </Text>
                        ) : null}
                      </Pressable>
                      <Pressable
                        onPress={() =>
                          clearWatchProgress(entry.key).catch(() => {})
                        }
                        hitSlop={8}
                        style={styles.delete}
                        accessibilityLabel={`Remove ${entry.title} from history`}
                      >
                        <Ionicons
                          name="close-circle"
                          size={19}
                          color={colors.muted}
                        />
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            </View>
          ))}
        </ScrollView>
      ) : (
        <View style={styles.empty}>
          <Ionicons name="time-outline" size={42} color={colors.muted} />
          <Text style={styles.emptyTitle}>No watch history yet</Text>
          <Text style={styles.emptyText}>
            Videos and episodes you watch will appear here.
          </Text>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  back: {
    padding: 3,
  },
  headerCopy: {
    flex: 1,
  },
  title: {
    color: colors.text,
    fontSize: 21,
    fontWeight: "800",
  },
  subtitle: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 2,
  },
  clear: {
    alignItems: "center",
    gap: 2,
    padding: 4,
  },
  clearText: {
    color: colors.danger,
    fontSize: 10,
    fontWeight: "700",
  },
  content: {
    padding: spacing.md,
    gap: spacing.lg,
  },
  group: {
    gap: spacing.sm,
  },
  groupTitle: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  card: {
    width: "47%",
    position: "relative",
  },
  cardPressable: {
    paddingBottom: 4,
  },
  posterBorder: {
    borderRadius: 9,
  },
  poster: {
    width: "100%",
    aspectRatio: 0.7,
    borderRadius: 8,
    backgroundColor: colors.panel,
  },
  posterEmpty: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.line,
  },
  name: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 17,
    marginTop: 7,
    paddingRight: 20,
  },
  meta: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: "700",
    marginTop: 3,
  },
  resume: {
    color: colors.muted,
    fontSize: 10,
    marginTop: 2,
  },
  delete: {
    position: "absolute",
    top: 5,
    right: 5,
    backgroundColor: colors.bg,
    borderRadius: 12,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
    gap: spacing.sm,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "800",
  },
  emptyText: {
    color: colors.muted,
    textAlign: "center",
    fontSize: 13,
  },
});
