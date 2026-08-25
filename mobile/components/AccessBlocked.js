import { Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors, radii, spacing } from "../lib/theme";

export default function AccessBlocked({ reason, onRetry }) {
  const message =
    reason?.trim() ||
    "Your access to this app has been removed. Contact support if you think this is a mistake.";

  return (
    <View style={styles.wrap}>
      <Ionicons name="ban-outline" size={56} color={colors.danger} />
      <Text style={styles.title}>Access removed</Text>
      <View style={styles.reasonBox}>
        <Text style={styles.reasonLabel}>Reason</Text>
        <Text style={styles.reasonText}>{message}</Text>
      </View>
      {onRetry ? (
        <Pressable style={styles.btn} onPress={onRetry}>
          <Text style={styles.btnText}>Check again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
    gap: spacing.sm,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "800",
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  reasonBox: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: colors.panelSoft,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
    gap: 6,
  },
  reasonLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  reasonText: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
  },
  btn: {
    marginTop: spacing.lg,
    backgroundColor: colors.accent,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: radii.pill,
  },
  btnText: {
    color: colors.accentInk,
    fontWeight: "800",
  },
});
