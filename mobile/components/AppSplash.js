import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { BrandLogoFull } from "./BrandLogo";

const SHOW_MS = 2000;

/** Launch splash only — Home is not mounted until this finishes. */
export default function AppSplash({ onDone }) {
  useEffect(() => {
    const t = setTimeout(() => onDone?.(), SHOW_MS);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <View style={styles.wrap}>
      <BrandLogoFull height={240} style={styles.logo} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: "#000000",
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    paddingHorizontal: 32,
  },
});
