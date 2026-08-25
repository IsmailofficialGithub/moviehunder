import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { BrandLogoFull } from "./BrandLogo";
import { colors, spacing } from "../lib/theme";
import { hydrateCatalogCache } from "../lib/catalogCache";

const SHOW_MS = 2200;

/** Launch splash — branded logo + credit; warms catalog cache. */
export default function AppSplash({ onDone }) {
  useEffect(() => {
    hydrateCatalogCache().catch(() => {});
    const t = setTimeout(() => onDone?.(), SHOW_MS);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <View style={styles.wrap}>
      <BrandLogoFull height={220} style={styles.logo} />
      <Text style={styles.tag}>Stream · Music · Downloads</Text>
      <Text style={styles.credit}>MovieHunter</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
  },
  logo: {
    paddingHorizontal: spacing.lg,
  },
  tag: {
    marginTop: spacing.md,
    color: colors.secondary,
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.6,
  },
  credit: {
    position: "absolute",
    bottom: 48,
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
});
