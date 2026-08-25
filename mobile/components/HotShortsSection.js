import { StyleSheet, Text, View } from "react-native";
import LazyHList from "./LazyHList";
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
      <LazyHList
        data={items}
        initialNumToRender={4}
        keyExtractor={(item, i) =>
          item.slug || item.subject_id || `${item.name}-${i}`
        }
        renderItem={({ item }) => <ShortCard item={item} />}
      />
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
});
