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
  const [entries, setEntries] = useState([]);
  const [viewMode, setViewMode] = useState("grid");

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
      <View style={styles.toolbar}>
        <Text style={styles.subtitle}>Your latest 30 videos and episodes</Text>
        <View style={styles.toolbarActions}>
          <View style={styles.viewToggle}>
            <Pressable
              onPress={() => setViewMode("grid")}
              style={[
                styles.viewButton,
                viewMode === "grid" && styles.viewButtonActive,
              ]}
              accessibilityLabel="Box view"
            >
              <Ionicons
                name="grid-outline"
                size={17}
                color={viewMode === "grid" ? colors.accentLight : colors.muted}
              />
            </Pressable>
            <Pressable
              onPress={() => setViewMode("list")}
              style={[
                styles.viewButton,
                viewMode === "list" && styles.viewButtonActive,
              ]}
              accessibilityLabel="Inline view"
            >
              <Ionicons
                name="list-outline"
                size={18}
                color={viewMode === "list" ? colors.accentLight : colors.muted}
              />
            </Pressable>
          </View>
          {entries.length ? (
            <Pressable onPress={confirmClearAll} style={styles.clearButton}>
              <Ionicons name="trash-outline" size={15} color={colors.danger} />
              <Text style={styles.clearText}>Clear all</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {grouped.length ? (
        <ScrollView contentContainerStyle={styles.content}>
          {grouped.map((group) => (
            <View key={group.label} style={styles.group}>
              <Text style={styles.groupTitle}>{group.label}</Text>
              <View style={viewMode === "grid" ? styles.grid : styles.list}>
                {group.entries.map((entry) => {
                  const percent = progressPercent(entry);
                  const episode =
                    Number(entry.se) > 0 || Number(entry.ep) > 0
                      ? `S${entry.se}E${entry.ep}`
                      : "";
                  return (
                    <View
                      key={entry.key}
                      style={[
                        styles.card,
                        viewMode === "list" && styles.cardList,
                      ]}
                    >
                      <Pressable
                        onPress={() => openCatalogTitle(entry.detailPath)}
                        style={[
                          styles.cardPressable,
                          viewMode === "list" && styles.cardPressableList,
                        ]}
                      >
                        <ProgressBorder
                          percent={percent}
                          style={[
                            styles.posterBorder,
                            viewMode === "list" && styles.posterBorderList,
                          ]}
                        >
                          {entry.poster ? (
                            <Image
                              source={{ uri: entry.poster }}
                              style={[
                                styles.poster,
                                viewMode === "list" && styles.posterList,
                              ]}
                            />
                          ) : (
                            <View
                              style={[
                                styles.poster,
                                styles.posterEmpty,
                                viewMode === "list" && styles.posterList,
                              ]}
                            >
                              <Ionicons
                                name="film-outline"
                                size={24}
                                color={colors.muted}
                              />
                            </View>
                          )}
                        </ProgressBorder>
                        <View style={viewMode === "list" ? styles.cardInfo : null}>
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
                        </View>
                      </Pressable>
                      <Pressable
                        onPress={() =>
                          clearWatchProgress(entry.key).catch(() => {})
                        }
                        hitSlop={8}
                        style={styles.removeButton}
                        accessibilityLabel={`Remove ${entry.title} from history`}
                      >
                        <Text style={styles.removeText}>Remove</Text>
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
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  toolbarActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  viewToggle: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    overflow: "hidden",
  },
  viewButton: {
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  viewButtonActive: {
    backgroundColor: colors.accentMuted,
  },
  clearButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderColor: "rgba(248, 113, 113, 0.35)",
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 7,
    backgroundColor: "rgba(248, 113, 113, 0.08)",
  },
  clearText: {
    color: colors.danger,
    fontSize: 11,
    fontWeight: "700",
  },
  subtitle: {
    color: colors.muted,
    fontSize: 11,
    flex: 1,
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
  list: {
    gap: spacing.sm,
  },
  card: {
    width: "47%",
    position: "relative",
  },
  cardList: {
    width: "100%",
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    padding: 10,
  },
  cardPressable: {
    paddingBottom: 4,
  },
  cardPressableList: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingRight: 24,
  },
  cardInfo: {
    flex: 1,
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
  posterList: {
    width: 72,
    height: 100,
    aspectRatio: undefined,
  },
  posterBorderList: {
    flexShrink: 0,
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
  removeButton: {
    position: "absolute",
    top: 5,
    right: 5,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 4,
    backgroundColor: colors.panelSoft,
  },
  removeText: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "700",
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
