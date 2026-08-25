import { useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { openCatalogTitle } from "../lib/catalogNav";
import { useDownloadSummary } from "../lib/useDownloadSummary";
import { colors, spacing } from "../lib/theme";

const WIDTH = Dimensions.get("window").width;
const HEIGHT = Math.round(WIDTH * 0.62);

function BannerSlide({ item }) {
  const [failed, setFailed] = useState(false);
  const uri = item?.poster_url;
  const summary = useDownloadSummary(item?.slug);

  return (
    <Pressable
      style={styles.slide}
      onPress={() => {
        if (item?.slug) openCatalogTitle(item.slug);
      }}
    >
      {uri && !failed ? (
        <Image
          source={{ uri }}
          style={styles.image}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={200}
          onError={() => setFailed(true)}
        />
      ) : (
        <View style={[styles.image, styles.fallback]} />
      )}
      <LinearGradient
        colors={["rgba(12,12,14,0.7)", "transparent"]}
        style={styles.fadeTop}
      />
      <LinearGradient
        colors={["transparent", "rgba(12,12,14,0.95)"]}
        style={styles.fadeBottom}
      />
      <View style={styles.copy}>
        <Text style={styles.title} numberOfLines={2}>
          {item.name}
        </Text>
        {summary ? (
          <Text style={styles.dlTag}>
            Downloaded {summary.progressPct > 0 ? `${summary.progressPct}%` : ""}
          </Text>
        ) : null}
        {item.badge ? (
          <Text style={styles.badge} numberOfLines={1}>
            {item.badge}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export default function BannerCarousel({ items = [] }) {
  const [index, setIndex] = useState(0);
  const listRef = useRef(null);
  const data = (items || []).filter((m) => m?.name).slice(0, 12);

  if (!data.length) return null;

  return (
    <View style={styles.wrap}>
      <FlatList
        ref={listRef}
        data={data}
        keyExtractor={(item, i) => item.slug || item.subject_id || `b-${i}`}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        getItemLayout={(_, i) => ({
          length: WIDTH,
          offset: WIDTH * i,
          index: i,
        })}
        onMomentumScrollEnd={(e) => {
          const next = Math.round(e.nativeEvent.contentOffset.x / WIDTH);
          setIndex(next);
        }}
        renderItem={({ item }) => <BannerSlide item={item} />}
      />
      <View style={styles.dots}>
        {data.map((_, i) => (
          <View
            key={`dot-${i}`}
            style={[styles.dot, i === index && styles.dotActive]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing.md,
  },
  slide: {
    width: WIDTH,
    height: HEIGHT,
    backgroundColor: colors.panel,
    overflow: "hidden",
  },
  image: {
    width: WIDTH,
    height: HEIGHT,
  },
  fallback: {
    backgroundColor: colors.panelSoft,
  },
  fadeTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 56,
  },
  fadeBottom: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: HEIGHT * 0.5,
  },
  copy: {
    position: "absolute",
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.md,
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "800",
  },
  dlTag: {
    color: colors.accent,
    marginTop: 4,
    fontSize: 11,
    fontWeight: "700",
  },
  badge: {
    color: colors.muted,
    marginTop: 4,
    fontSize: 12,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    marginTop: 10,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.28)",
  },
  dotActive: {
    backgroundColor: colors.accent,
    width: 16,
  },
});
