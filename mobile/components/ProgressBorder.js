import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { colors } from "../lib/theme";

/**
 * Draws a clockwise progress track around arbitrary content without adding
 * another native dependency. Four segments keep partial episode progress
 * visible while the neutral track remains behind them.
 */
export default function ProgressBorder({ percent = 0, children, style }) {
  const progress = Math.max(0, Math.min(100, Number(percent) || 0)) / 100;
  const [size, setSize] = useState({ width: 0, height: 0 });
  const hasSize = size.width > 0 && size.height > 0;
  const perimeter = 2 * (size.width + size.height);
  let remaining = hasSize ? progress * perimeter : 0;
  const top = hasSize
    ? Math.min(size.width, remaining)
    : Math.min(1, progress * 4);
  remaining = hasSize ? Math.max(0, remaining - size.width) : 0;
  const right = hasSize
    ? Math.min(size.height, remaining)
    : Math.min(1, Math.max(0, progress * 4 - 1));
  remaining = hasSize ? Math.max(0, remaining - size.height) : 0;
  const bottom = hasSize
    ? Math.min(size.width, remaining)
    : Math.min(1, Math.max(0, progress * 4 - 2));
  remaining = hasSize ? Math.max(0, remaining - size.width) : 0;
  const left = hasSize
    ? Math.min(size.height, remaining)
    : Math.min(1, Math.max(0, progress * 4 - 3));

  return (
    <View
      style={[styles.frame, style]}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        if (width !== size.width || height !== size.height) {
          setSize({ width, height });
        }
      }}
    >
      <View style={styles.track} pointerEvents="none">
        <View style={[styles.top, { width: hasSize ? top : `${top * 100}%` }]} />
        <View style={[styles.right, { height: hasSize ? right : `${right * 100}%` }]} />
        <View style={[styles.bottom, { width: hasSize ? bottom : `${bottom * 100}%` }]} />
        <View style={[styles.left, { height: hasSize ? left : `${left * 100}%` }]} />
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    position: "relative",
    borderRadius: 9,
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
  },
  left: {
    position: "absolute",
    bottom: -1,
    left: -1,
    width: 3,
    backgroundColor: colors.accent,
  },
});
