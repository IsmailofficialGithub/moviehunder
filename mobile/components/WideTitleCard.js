import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import Ionicons from "@expo/vector-icons/Ionicons";
import { openCatalogTitle } from "../lib/catalogNav";
import { useDownloadSummary } from "../lib/useDownloadSummary";
import { colors, radii, spacing } from "../lib/theme";

function metaLine(item) {
  const bits = [];
  if (item?.year) bits.push(String(item.year).slice(0, 4));
  if (item?.badge) bits.push(String(item.badge));
  else if (item?.subject_type) bits.push(String(item.subject_type));
  else if (item?.rating) bits.push(`★ ${item.rating}`);
  return bits.join("  |  ");
}

export default function WideTitleCard({ item, width = 280 }) {
  const slug = item?.slug;
  const summary = useDownloadSummary(slug);
  const meta = metaLine(item);
  const hasDownload = Boolean(summary);

  const card = (
    <View style={[styles.card, { width }]}>
      <View style={styles.posterWrap}>
        {item?.poster_url ? (
          <Image
            source={{ uri: item.poster_url }}
            style={styles.poster}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={200}
          />
        ) : (
          <View style={[styles.poster, styles.ph]}>
            <Ionicons name="image-outline" size={18} color={colors.muted} />
          </View>
        )}
        {hasDownload ? (
          <View style={styles.dlBadge}>
            <Ionicons name="download" size={9} color={colors.accentInk} />
            <Text style={styles.dlBadgeText}>
              {summary.progressPct > 0 ? `${summary.progressPct}%` : "…"}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>
          {item?.name || "Untitled"}
        </Text>
        {meta ? (
          <Text style={styles.meta} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
      </View>
      <View style={styles.play}>
        <Ionicons
          name={hasDownload ? "download-outline" : "play"}
          size={16}
          color={colors.accentInk}
        />
      </View>
    </View>
  );

  if (!slug) return <View style={{ marginRight: spacing.sm }}>{card}</View>;
  return (
    <Pressable
      style={{ marginRight: spacing.sm }}
      onPress={() => openCatalogTitle(slug)}
    >
      {card}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.panelSoft,
    borderRadius: radii.md,
    padding: 8,
    gap: 10,
  },
  posterWrap: {
    position: "relative",
  },
  poster: {
    width: 52,
    height: 72,
    borderRadius: 8,
    backgroundColor: colors.panel,
  },
  ph: {
    alignItems: "center",
    justifyContent: "center",
  },
  dlBadge: {
    position: "absolute",
    top: 2,
    right: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: colors.accent,
    borderRadius: 6,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  dlBadgeText: {
    color: colors.accentInk,
    fontSize: 8,
    fontWeight: "800",
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 18,
  },
  meta: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 6,
  },
  play: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingLeft: 2,
  },
});
