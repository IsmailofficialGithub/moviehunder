import { StyleSheet, Text, View } from "react-native";
import LazyHList from "./LazyHList";
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
      <LazyHList
        data={movies}
        initialNumToRender={4}
        keyExtractor={(item, i) =>
          item.slug || item.subject_id || `${item.name}-${i}`
        }
        renderItem={({ item }) => <PosterCard item={item} />}
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
