import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing } from "../lib/theme";

export default function Screen({
  children,
  title,
  subtitle,
  loading = false,
  error = "",
  onRetry,
  edges = ["top", "left", "right"],
}) {
  return (
    <SafeAreaView style={styles.safe} edges={edges}>
      {(title || subtitle) && (
        <View style={styles.head}>
          {title ? <Text style={styles.title}>{title}</Text> : null}
          {subtitle ? <Text style={styles.sub}>{subtitle}</Text> : null}
        </View>
      )}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
          {onRetry ? (
            <Text style={styles.retry} onPress={onRetry}>
              Tap to retry
            </Text>
          ) : null}
        </View>
      ) : (
        children
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  head: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    gap: 4,
  },
  title: {
    color: colors.text,
    fontSize: 26,
    fontWeight: "800",
  },
  sub: {
    color: colors.muted,
    fontSize: 13,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
    gap: spacing.sm,
  },
  error: {
    color: colors.danger,
    textAlign: "center",
    fontSize: 15,
  },
  retry: {
    color: colors.accent,
    fontWeight: "700",
    marginTop: spacing.sm,
  },
});
