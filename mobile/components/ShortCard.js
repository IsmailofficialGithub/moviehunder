import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import Ionicons from "@expo/vector-icons/Ionicons";
import { openShorts } from "../lib/shorts";
import { colors, spacing } from "../lib/theme";

const CARD_W = 108;
const CARD_H = Math.round(CARD_W * (16 / 9));

export default function ShortCard({ item, width = CARD_W, onPress }) {
  const slug = item?.slug;
  const height = Math.round(width * (16 / 9));

  const card = (
    <View style={[styles.card, { width }]}>
      <View style={[styles.posterWrap, { width, height }]}>
        {item?.poster_url ? (
          <Image
            source={{ uri: item.poster_url }}
            style={{ width, height, borderRadius: 12 }}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={200}
          />
        ) : (
          <View style={[styles.placeholder, { width, height }]}>
            <Ionicons name="film-outline" size={28} color={colors.muted} />
          </View>
        )}
        <View style={styles.playBadge}>
          <Ionicons name="play" size={14} color={colors.accentInk} />
        </View>
      </View>
      <Text style={styles.name} numberOfLines={2}>
        {item?.name || "Untitled"}
      </Text>
    </View>
  );

  if (!slug) return card;
  return (
    <Pressable
      onPress={() => {
        onPress?.();
        openShorts(slug);
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
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: colors.panel,
  },
  placeholder: {
    borderRadius: 12,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  playBadge: {
    position: "absolute",
    bottom: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  name: {
    color: colors.text,
    fontSize: 11,
    fontWeight: "600",
    marginTop: 6,
    lineHeight: 14,
  },
});
