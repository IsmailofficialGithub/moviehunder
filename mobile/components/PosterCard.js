import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import Ionicons from "@expo/vector-icons/Ionicons";
import { openCatalogTitle } from "../lib/catalogNav";
import { useDownloadSummary } from "../lib/useDownloadSummary";
import { colors, spacing } from "../lib/theme";

export default function PosterCard({ item, width = 118, onPress }) {
  const slug = item?.slug;
  const summary = useDownloadSummary(slug);
  const height = Math.round(width * 1.5);
  const hasDownload = Boolean(summary);

  const card = (
    <View style={[styles.card, { width }]}>
      <View style={styles.posterWrap}>
        {item?.poster_url ? (
          <Image
            source={{ uri: item.poster_url }}
            style={{ width, height, borderRadius: 10 }}
            contentFit="cover"
            cachePolicy="memory-disk"
            recyclingKey={item.poster_url}
            priority="normal"
            transition={180}
          />
        ) : (
          <View style={[styles.placeholder, { width, height }]}>
            <Text style={styles.phText}>No art</Text>
          </View>
        )}
        {hasDownload ? (
          <View style={styles.dlBadge}>
            <Ionicons name="download" size={10} color={colors.accentInk} />
            <Text style={styles.dlBadgeText}>
              {summary.progressPct > 0 ? `${summary.progressPct}%` : "…"}
            </Text>
          </View>
        ) : null}
        {item?.dub_lang === "hi" ||
        /hindi/i.test(String(item?.badge || "")) ||
        /\[\s*hindi\s*\]|\(\s*hindi\s*\)/i.test(String(item?.name || "")) ? (
          <View style={styles.langBadge}>
            <Text style={styles.langBadgeText}>Hindi</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.name} numberOfLines={2}>
        {item?.name || "Untitled"}
      </Text>
      {item?.rating ? (
        <Text style={styles.meta}>★ {item.rating}</Text>
      ) : null}
    </View>
  );

  if (!slug) return card;
  return (
    <Pressable
      onPress={() => {
        onPress?.();
        openCatalogTitle(slug);
      }}
    >
      {card}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginRight: spacing.sm,
  },
  posterWrap: {
    position: "relative",
  },
  placeholder: {
    borderRadius: 10,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  phText: {
    color: colors.muted,
    fontSize: 12,
  },
  dlBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  dlBadgeText: {
    color: colors.accentInk,
    fontSize: 9,
    fontWeight: "800",
  },
  langBadge: {
    position: "absolute",
    left: 6,
    bottom: 6,
    backgroundColor: "rgba(90, 0, 162, 0.92)",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  langBadgeText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "800",
  },
  name: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "600",
    marginTop: 8,
    lineHeight: 16,
  },
  meta: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 2,
  },
});
