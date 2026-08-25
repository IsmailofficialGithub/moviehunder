import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors, spacing } from "../lib/theme";

export default function DetailHeader({ title = "Details" }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const label =
    String(title).length > 28 ? `${String(title).slice(0, 26)}…` : String(title);

  return (
    <View style={[styles.bar, { paddingTop: Math.max(insets.top, 4) }]}>
      <Pressable
        onPress={() => {
          if (typeof router.canGoBack === "function" && router.canGoBack()) {
            router.back();
          } else {
            router.replace("/");
          }
        }}
        hitSlop={10}
        style={styles.back}
        accessibilityRole="button"
        accessibilityLabel="Go back"
      >
        <Ionicons name="chevron-back" size={26} color={colors.accent} />
      </Pressable>
      <Text style={styles.title} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.spacer} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: 6,
    paddingHorizontal: spacing.xs,
    backgroundColor: colors.bg,
    minHeight: 44,
  },
  back: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
    paddingHorizontal: 4,
  },
  spacer: {
    width: 40,
  },
});
