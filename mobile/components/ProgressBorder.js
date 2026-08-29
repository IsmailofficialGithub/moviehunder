import { StyleSheet, View } from "react-native";
import { colors } from "../lib/theme";

/**
 * Draws a clockwise progress track around arbitrary content without adding
 * another native dependency. Four segments keep partial episode progress
 * visible while the neutral track remains behind them.
 */
export default function ProgressBorder({ percent = 0, children, style }) {
  const progress = Math.max(0, Math.min(100, Number(percent) || 0)) / 100;
  const top = Math.min(1, progress * 4);
  const right = Math.min(1, Math.max(0, progress * 4 - 1));
  const bottom = Math.min(1, Math.max(0, progress * 4 - 2));
  const left = Math.min(1, Math.max(0, progress * 4 - 3));

  return (
    <View style={[styles.frame, style]}>
      <View style={styles.track} pointerEvents="none">
        <View style={[styles.top, { width: `${top * 100}%` }]} />
        <View style={[styles.right, { height: `${right * 100}%` }]} />
        <View style={[styles.bottom, { width: `${bottom * 100}%` }]} />
        <View style={[styles.left, { height: `${left * 100}%` }]} />
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    position: "relative",
  },
  track: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 9,
    overflow: "hidden",
    zIndex: 2,
  },
  top: {
    position: "absolute",
    top: -1,
    left: -1,
    height: 3,
    backgroundColor: colors.accent,
  },
  right: {
    position: "absolute",
    top: -1,
    right: -1,
    width: 3,
    backgroundColor: colors.accent,
  },
  bottom: {
    position: "absolute",
    bottom: -1,
    right: -1,
    height: 3,
    backgroundColor: colors.accent,
    transform: [{ scaleX: -1 }],
    transformOrigin: "center",
  },
  left: {
    position: "absolute",
    bottom: -1,
    left: -1,
    width: 3,
    backgroundColor: colors.accent,
    transform: [{ scaleY: -1 }],
    transformOrigin: "center",
  },
});
