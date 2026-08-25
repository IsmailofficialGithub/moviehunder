import { ScrollView, StyleSheet, Text, View } from "react-native";
import ShortCard from "./ShortCard";
import { colors, spacing } from "../lib/theme";

const MAX = 18;

export default function HotShortsSection({ section }) {
  const items = (section?.movies || []).slice(0, MAX);
  if (!items.length) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={styles.title}>{section.section || "Hot Short TV"}</Text>
        <Text style={styles.count}>{section.count || items.length} shorts</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {items.map((item, i) => (
          <ShortCard
            key={item.slug || item.subject_id || `${item.name}-${i}`}
            item={item}
          />
        ))}
      </ScrollView>
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
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  title: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "700",
  },
  count: {
    color: colors.muted,
    fontSize: 12,
  },
  row: {
    paddingHorizontal: spacing.md,
  },
});
