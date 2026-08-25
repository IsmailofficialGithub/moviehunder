import { ScrollView, StyleSheet, Text, View } from "react-native";
import { colors, radii, spacing } from "../lib/theme";

function Bone({ style }) {
  return <View style={[styles.bone, style]} />;
}

export default function TitleSkeleton() {
  return (
    <ScrollView contentContainerStyle={styles.body}>
      <View style={styles.hero}>
        <Bone style={styles.poster} />
        <View style={styles.copy}>
          <Bone style={styles.titleLine} />
          <Bone style={[styles.titleLine, styles.titleShort]} />
          <Bone style={styles.metaLine} />
          <Bone style={styles.rating} />
          <Bone style={styles.playBtn} />
          <Bone style={styles.dlBtn} />
        </View>
      </View>

      <View style={styles.chips}>
        {Array.from({ length: 4 }).map((_, i) => (
          <Bone key={i} style={styles.chip} />
        ))}
      </View>

      <View style={styles.block}>
        <Text style={styles.blockTitle}>Overview</Text>
        <Bone style={styles.descLine} />
        <Bone style={styles.descLine} />
        <Bone style={[styles.descLine, styles.descShort]} />
      </View>

      <View style={styles.block}>
        <Text style={styles.blockTitle}>Cast</Text>
        <View style={styles.castRow}>
          {Array.from({ length: 5 }).map((_, i) => (
            <View key={i} style={styles.castCard}>
              <Bone style={styles.avatar} />
              <Bone style={styles.castName} />
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  bone: {
    backgroundColor: colors.panelSoft,
    borderRadius: radii.md,
    opacity: 0.85,
  },
  hero: {
    flexDirection: "row",
    gap: spacing.md,
  },
  poster: {
    width: 120,
    height: 180,
    borderRadius: 12,
  },
  copy: {
    flex: 1,
    gap: 8,
  },
  titleLine: {
    height: 22,
    width: "95%",
  },
  titleShort: {
    width: "65%",
  },
  metaLine: {
    height: 14,
    width: "80%",
    marginTop: 2,
  },
  rating: {
    height: 16,
    width: 72,
    marginTop: 2,
  },
  playBtn: {
    height: 44,
    width: "100%",
    marginTop: 4,
    borderRadius: 10,
  },
  dlBtn: {
    height: 40,
    width: "100%",
    borderRadius: radii.pill,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    width: 64,
    height: 28,
    borderRadius: radii.pill,
  },
  block: {
    gap: 8,
  },
  blockTitle: {
    color: colors.muted,
    fontWeight: "700",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  descLine: {
    height: 14,
    width: "100%",
  },
  descShort: {
    width: "72%",
  },
  castRow: {
    flexDirection: "row",
    gap: 12,
  },
  castCard: {
    width: 72,
    gap: 6,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
  },
  castName: {
    height: 12,
    width: 56,
  },
});
