import { StyleSheet, Text, View } from "react-native";
import { colors, radii, spacing } from "../lib/theme";

const SECTIONS = [
  { key: "banner", kind: "banner" },
  { key: "trending", label: "Trending", kind: "wide", count: 2 },
  { key: "soon", label: "Coming Soon", kind: "poster", count: 4 },
  { key: "cinema", label: "Cinema", kind: "poster", count: 4 },
  { key: "hot", label: "Hot Short TV", kind: "short", count: 4 },
];

function Bone({ style }) {
  return <View style={[styles.bone, style]} />;
}

function PosterRow({ count = 4 }) {
  return (
    <View style={styles.posterRow}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={styles.posterBlock}>
          <Bone style={styles.poster} />
          <Bone style={styles.posterLabel} />
        </View>
      ))}
    </View>
  );
}

function WideRow({ count = 2 }) {
  return (
    <View style={styles.wideRow}>
      {Array.from({ length: count }).map((_, i) => (
        <Bone key={i} style={styles.wideCard} />
      ))}
    </View>
  );
}

function ShortRow({ count = 4 }) {
  const w = 108;
  const h = Math.round(w * (16 / 9));
  return (
    <View style={styles.posterRow}>
      {Array.from({ length: count }).map((_, i) => (
        <Bone key={i} style={{ width: w, height: h, borderRadius: 12 }} />
      ))}
    </View>
  );
}

export default function HomeSkeleton({ hideBanner = false }) {
  return (
    <View style={styles.wrap}>
      {SECTIONS.map((sec) => {
        if (sec.kind === "banner") {
          if (hideBanner) return null;
          return (
            <View key={sec.key}>
              <Bone style={styles.banner} />
              <View style={styles.dots}>
                <Bone style={styles.dot} />
                <Bone style={[styles.dot, styles.dotWide]} />
                <Bone style={styles.dot} />
              </View>
            </View>
          );
        }
        return (
          <View key={sec.key} style={styles.section}>
            <Text style={styles.sectionLabel}>{sec.label}</Text>
            {sec.kind === "wide" ? (
              <WideRow count={sec.count} />
            ) : sec.kind === "short" ? (
              <ShortRow count={sec.count} />
            ) : (
              <PosterRow count={sec.count} />
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingBottom: spacing.md,
  },
  bone: {
    backgroundColor: colors.panelSoft,
    borderRadius: radii.md,
    opacity: 0.85,
  },
  banner: {
    width: "100%",
    height: 220,
    borderRadius: 0,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    marginTop: 10,
    marginBottom: spacing.md,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotWide: {
    width: 16,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  wideRow: {
    flexDirection: "row",
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  wideCard: {
    width: 280,
    height: 88,
  },
  posterRow: {
    flexDirection: "row",
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  posterBlock: {
    width: 118,
    gap: 8,
  },
  poster: {
    width: 118,
    height: 177,
  },
  posterLabel: {
    width: 90,
    height: 12,
  },
});
