import { ScrollView, StyleSheet, Text, View } from "react-native";
import PosterCard from "./PosterCard";
import { colors, spacing } from "../lib/theme";

const MAX = 18;

export default function CatalogSection({ section }) {
  const movies = (section?.movies || []).slice(0, MAX);
  if (!movies.length) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={styles.title}>{section.section || "Titles"}</Text>
        <Text style={styles.count}>
          {section.count || movies.length} titles
        </Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {movies.map((item, i) => (
          <PosterCard
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
