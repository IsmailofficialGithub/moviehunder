import React, { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet } from "react-native";
import { spacing } from "../lib/theme";

/**
 * Horizontal row that only mounts the first few cards, then grows as the
 * user scrolls sideways. Safe inside a vertical ScrollView (no nested FlatList).
 */
export default function LazyHList({
  data = [],
  keyExtractor,
  renderItem,
  contentContainerStyle,
  initialNumToRender = 4,
}) {
  const [count, setCount] = useState(() =>
    Math.min(initialNumToRender, data.length)
  );

  useEffect(() => {
    setCount(Math.min(initialNumToRender, data.length));
  }, [data, initialNumToRender]);

  const onScroll = useCallback(
    (e) => {
      if (count >= data.length) return;
      const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
      if (contentOffset.x + layoutMeasurement.width > contentSize.width - 280) {
        setCount((n) => Math.min(data.length, n + initialNumToRender));
      }
    },
    [count, data.length, initialNumToRender]
  );

  const visible = data.slice(0, count);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.row, contentContainerStyle]}
      scrollEventThrottle={16}
      onScroll={onScroll}
    >
      {visible.map((item, index) => {
        const key = keyExtractor
          ? keyExtractor(item, index)
          : String(index);
        return (
          <React.Fragment key={key}>
            {renderItem({ item, index })}
          </React.Fragment>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: spacing.md,
  },
});
