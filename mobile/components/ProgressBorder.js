import { StyleSheet, View } from "react-native";
import { colors } from "../lib/theme";

/**
 * Draws a clockwise progress track around arbitrary content without adding
 * another native dependency. Four segments keep partial episode progress
 * visible while the neutral track remains behind them.
 */
export default function ProgressBorder({ percent = 0, children, style }) {
  const progress = Math.max(0, Math.min(100, Number(percent) || 0)) / 100;
  const borderColor =
    progress > 0
      ? `rgba(189, 132, 219, ${0.3 + progress * 0.7})`
      : colors.line;

  return (
    <View
      style={[
        styles.frame,
        {
          borderColor,
          borderWidth: progress > 0 ? 2 : 1,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    position: "relative",
    borderRadius: 9,
  },
});
