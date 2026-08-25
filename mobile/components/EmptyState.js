import { StyleSheet, Text, View } from "react-native";
import { colors, spacing } from "../lib/theme";

export default function EmptyState({
  title = "No items found",
  hint = "Try again in a moment.",
}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.icon}>
        <Text style={styles.iconText}>F</Text>
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.hint}>{hint}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    gap: spacing.sm,
  },
  icon: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: colors.gold,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  iconText: {
    color: colors.goldInk,
    fontWeight: "900",
    fontSize: 22,
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "800",
  },
  hint: {
    color: colors.muted,
    textAlign: "center",
    fontSize: 14,
    lineHeight: 20,
    maxWidth: 280,
  },
});
