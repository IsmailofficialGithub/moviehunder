import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import { BrandLogoFull } from "./BrandLogo";
import { colors, spacing } from "../lib/theme";
import { hydrateCatalogCache } from "../lib/catalogCache";

const SHOW_MS = 1800;

// Keep native splash until our branded screen is ready
SplashScreen.preventAutoHideAsync().catch(() => {});

/** Launch splash — branded logo + credit; warms catalog cache. */
export default function AppSplash({ onDone }) {
  useEffect(() => {
    hydrateCatalogCache().catch(() => {});
    SplashScreen.hideAsync().catch(() => {});
    const t = setTimeout(() => onDone?.(), SHOW_MS);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <View style={styles.wrap} onLayout={() => SplashScreen.hideAsync().catch(() => {})}>
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
