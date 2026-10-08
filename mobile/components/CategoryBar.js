import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors, radii, spacing } from "../lib/theme";

export const HOME_CATEGORIES = [
  { id: "live", label: "LIVE", kind: "live" },
  { id: "trending", label: "All" },
  { id: "movie", label: "Movies" },
  { id: "tv", label: "TV Series" },
  { id: "animation", label: "Anime" },
  { id: "ranking", label: "Top" },
  { id: "songs", label: "Songs" },
  { id: "history", label: "History" },
];

export default function CategoryBar({ activeId, onChange }) {
  return (
    <View style={styles.wrap}>
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
                style={({ pressed }) => [
                  styles.live,
                  active && styles.liveActive,
                  pressed && { opacity: 0.8 },
                ]}
              >
                <Text style={styles.liveText}>LIVE</Text>
                <Ionicons name="radio-outline" size={13} color="#fff" />
              </Pressable>
            );
          }
          return (
            <Pressable
              key={cat.id}
              onPress={() => onChange?.(cat.id)}
              style={({ pressed }) => [
                styles.pill,
                active && styles.pillActive,
                pressed && { opacity: 0.8 },
              ]}
            >
              <Text style={[styles.label, active && styles.labelActive]}>
                {cat.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingVertical: 6,
  },
  row: {
    paddingHorizontal: spacing.md,
    alignItems: "center",
    gap: 8,
  },
  live: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    backgroundColor: colors.live,
    paddingHorizontal: 12,
    height: 34,
    borderRadius: radii.pill,
    elevation: 2,
    shadowColor: colors.live,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
  },
  liveActive: {
    borderWidth: 1.5,
    borderColor: "#fff",
  },
  liveText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.5,
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  pill: {
    paddingHorizontal: 14,
    height: 34,
    borderRadius: radii.pill,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  pillActive: {
    backgroundColor: "#ffffff",
    borderColor: "#ffffff",
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  label: {
    color: "rgba(255, 255, 255, 0.75)",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
    letterSpacing: 0.1,
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  labelActive: {
    color: "#0c0c0e",
    fontWeight: "700",
  },
});

