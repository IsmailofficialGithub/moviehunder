import { Image } from "expo-image";
import { StyleSheet, View } from "react-native";
import { spacing } from "../lib/theme";

const logoFull = require("../assets/logo-full.png");
const logoSymbol = require("../assets/logo-symbol.png");

/** Full lockup: symbol + MOVIEHUNTER + SINCE 2006 */
export function BrandLogoFull({ height = 128, style }) {
  return (
    <View style={[styles.fullWrap, style]}>
      <Image
        source={logoFull}
        style={{ width: "100%", height, maxWidth: 320 }}
        contentFit="contain"
        cachePolicy="memory-disk"
        accessibilityLabel="MovieHunter logo"
      />
    </View>
  );
}

/** Compact M symbol only — header, favicon-style spots */
export function BrandLogoSymbol({ size = 34, style }) {
  return (
    <View style={[styles.symbolWrap, { width: size, height: size }, style]}>
      <Image
        source={logoSymbol}
        style={{ width: size, height: size }}
        contentFit="contain"
        cachePolicy="memory-disk"
        accessibilityLabel="MovieHunter"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fullWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  symbolWrap: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
});
