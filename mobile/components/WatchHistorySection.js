import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import Ionicons from "@expo/vector-icons/Ionicons";
import ProgressBorder from "./ProgressBorder";
import { openCatalogTitle } from "../lib/catalogNav";
import {
  getWatchHistory,
  historyBucket,
  progressPercent,
  subscribeWatchProgress,
} from "../lib/watchProgress";
import { colors, radii, spacing } from "../lib/theme";

const GROUPS = ["Today", "Yesterday", "Last 3 days", "Last 7 days"];

export default function WatchHistorySection() {
  const [entries, setEntries] = useState([]);

  useEffect(() => {
    const refresh = () => getWatchHistory({ limit: 30 }).then(setEntries).catch(() => {});
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

  if (!grouped.length) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <View style={styles.titleRow}>
          <Ionicons name="time-outline" size={18} color={colors.accent} />
          <Text style={styles.title}>Watch history</Text>
        </View>
        <Text style={styles.count}>Last 30</Text>
      </View>
      {grouped.map((group) => (
        <View key={group.label} style={styles.group}>
          <Text style={styles.groupTitle}>{group.label}</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.row}
          >
            {group.entries.map((entry) => {
              const percent = progressPercent(entry);
              const episode =
                Number(entry.se) > 0 || Number(entry.ep) > 0
                  ? `S${entry.se}E${entry.ep}`
                  : "";
              return (
                <Pressable
                  key={entry.key}
                  style={styles.card}
                  onPress={() => openCatalogTitle(entry.detailPath)}
                >
                  <ProgressBorder percent={percent} style={styles.posterBorder}>
                    {entry.poster ? (
                      <Image
                        source={{ uri: entry.poster }}
                        style={styles.poster}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                      />
                    ) : (
                      <View style={[styles.poster, styles.posterEmpty]}>
                        <Ionicons name="film-outline" size={20} color={colors.muted} />
                      </View>
                    )}
                  </ProgressBorder>
                  <Text style={styles.name} numberOfLines={2}>
                    {entry.title}
                  </Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    {[episode, `${percent}% watched`].filter(Boolean).join(" · ")}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing.lg,
  },
  head: {
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  title: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "800",
  },
  count: {
    color: colors.muted,
    fontSize: 11,
  },
  group: {
    marginBottom: spacing.sm,
  },
  groupTitle: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    paddingHorizontal: spacing.md,
    marginBottom: 6,
  },
  row: {
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  card: {
    width: 104,
  },
  posterBorder: {
    borderRadius: 9,
  },
  poster: {
    width: 104,
    height: 146,
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
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 16,
    marginTop: 7,
  },
  meta: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: "700",
    marginTop: 3,
  },
});
