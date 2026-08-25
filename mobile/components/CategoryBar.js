import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors, radii, spacing } from "../lib/theme";

export const HOME_CATEGORIES = [
  { id: "live", label: "LIVE", kind: "live" },
  { id: "trending", label: "Trending" },
  { id: "movie", label: "Movie" },
  { id: "tv", label: "TV" },
  { id: "animation", label: "Anime" },
  { id: "ranking", label: "Top" },
];

export default function CategoryBar({ activeId, onChange }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {HOME_CATEGORIES.map((cat) => {
        const active = cat.id === activeId;
        if (cat.kind === "live") {
          return (
            <Pressable
              key={cat.id}
              onPress={() => onChange?.(cat.id)}
              style={[styles.live, active && styles.liveActive]}
            >
              <Text style={styles.liveText}>LIVE</Text>
              <Ionicons name="radio-outline" size={12} color="#fff" />
            </Pressable>
          );
        }
        return (
          <Pressable
            key={cat.id}
            onPress={() => onChange?.(cat.id)}
            style={styles.item}
          >
            <Text style={[styles.label, active && styles.labelActive]}>
              {cat.label}
            </Text>
            {active ? <View style={styles.underline} /> : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    alignItems: "center",
    gap: 18,
  },
  live: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.live,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.pill,
  },
  liveActive: {
    opacity: 0.95,
  },
  liveText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 11,
    letterSpacing: 0.4,
  },
  item: {
    paddingVertical: 6,
    alignItems: "center",
  },
  label: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: "600",
  },
  labelActive: {
    color: colors.secondary,
    fontWeight: "800",
  },
  underline: {
    marginTop: 5,
    height: 3,
    width: "100%",
    minWidth: 28,
    borderRadius: 2,
    backgroundColor: colors.secondary,
  },
});
