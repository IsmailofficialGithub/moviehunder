import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import ShortClip from "../../components/ShortClip";
import { getDetail, getEpisodes } from "../../lib/api";
import { getCachedTitle, setCachedTitle } from "../../lib/titleCache";
import { colors, spacing } from "../../lib/theme";

function flattenEpisodes(episodes) {
  const list = [];
  for (const season of episodes?.seasons || []) {
    for (const ep of season.episodes || []) {
      list.push({
        se: ep.se ?? season.season ?? 1,
        ep: ep.ep ?? ep.episode ?? list.length + 1,
        name: ep.name || `Part ${ep.ep ?? list.length + 1}`,
      });
    }
  }
  return list;
}

export default function ShortsScreen() {
  const { slug: raw, ep: rawEp } = useLocalSearchParams();
  const slug = decodeURIComponent(String(raw || ""));
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: windowH } = useWindowDimensions();
  const pageH = Math.round(windowH);

  const cached = slug ? getCachedTitle(slug) : null;
  const [detail, setDetail] = useState(() => cached?.detail || null);
  const [episodes, setEpisodes] = useState(() => cached?.episodes || null);
  const [loading, setLoading] = useState(() => !cached?.detail);
  const [error, setError] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const hit = getCachedTitle(slug);
    if (hit?.detail && hit?.episodes) {
      setDetail(hit.detail);
      setEpisodes(hit.episodes);
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    (async () => {
      setLoading(true);
      setError("");
      try {
        const [d, e] = await Promise.all([
          getDetail(slug),
          getEpisodes(slug),
        ]);
        if (cancelled) return;
        setCachedTitle(slug, { detail: d, episodes: e });
        setDetail(d);
        setEpisodes(e);
      } catch {
        if (!cancelled) setError("This short isn’t available.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  const parts = useMemo(() => flattenEpisodes(episodes), [episodes]);
  const meta = detail?.metadata || {};
  const subjectId = meta.id || episodes?.subject_id;
  const poster = meta.poster || null;
  const title = meta.title || slug;

  const startIndex = useMemo(() => {
    const want = parseInt(String(rawEp || "1"), 10);
    if (!parts.length) return 0;
    const idx = parts.findIndex((p) => Number(p.ep) === want);
    return idx >= 0 ? idx : 0;
  }, [parts, rawEp]);

  useEffect(() => {
    setActiveIndex(startIndex);
    if (parts.length && startIndex > 0) {
      requestAnimationFrame(() => {
        listRef.current?.scrollToIndex({ index: startIndex, animated: false });
      });
    }
  }, [startIndex, parts.length, slug]);

  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    const top = viewableItems?.[0];
    if (top?.index != null) setActiveIndex(top.index);
  }).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 85,
  }).current;

  const renderItem = useCallback(
    ({ item, index }) => (
      <ShortClip
        item={item}
        subjectId={subjectId}
        detailPath={slug}
        title={title}
        poster={poster}
        isActive={index === activeIndex}
        height={pageH}
        total={parts.length}
      />
    ),
    [activeIndex, pageH, parts.length, poster, slug, subjectId, title]
  );

  const getItemLayout = useCallback(
    (_, index) => ({
      length: pageH,
      offset: pageH * index,
      index,
    }),
    [pageH]
  );

  return (
    <View style={styles.page}>
      <View style={[styles.topBar, { paddingTop: Math.max(insets.top, 8) }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          style={styles.back}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-down" size={28} color={colors.text} />
        </Pressable>
        <Text style={styles.topTitle} numberOfLines={1}>
          {loading ? "Shorts" : title}
        </Text>
        <View style={styles.back} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.secondary} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
          <Pressable onPress={() => router.back()}>
            <Text style={styles.retry}>Go back</Text>
          </Pressable>
        </View>
      ) : !parts.length ? (
        <View style={styles.center}>
          <Text style={styles.error}>No parts found for this short.</Text>
          <Pressable onPress={() => router.push(`/title/${encodeURIComponent(slug)}`)}>
            <Text style={styles.retry}>Open full details</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={parts}
          keyExtractor={(item) => `${item.se}-${item.ep}`}
          renderItem={renderItem}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          snapToInterval={pageH}
          decelerationRate="fast"
          disableIntervalMomentum
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          getItemLayout={getItemLayout}
          initialScrollIndex={startIndex > 0 ? startIndex : undefined}
          onScrollToIndexFailed={(info) => {
            setTimeout(() => {
              listRef.current?.scrollToOffset({
                offset: info.averageItemLength * info.index,
                animated: false,
              });
            }, 100);
          }}
          windowSize={3}
          maxToRenderPerBatch={2}
          removeClippedSubviews
        />
      )}

      {!loading && parts.length ? (
        <View style={[styles.counter, { bottom: Math.max(insets.bottom, 12) }]}>
          <Text style={styles.counterText}>
            {activeIndex + 1} / {parts.length}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: "#000",
  },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.xs,
    paddingBottom: 8,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  back: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  topTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
    gap: spacing.sm,
  },
  error: {
    color: colors.danger,
    textAlign: "center",
    fontSize: 15,
  },
  retry: {
    color: colors.accentLight,
    fontWeight: "700",
    marginTop: spacing.sm,
  },
  counter: {
    position: "absolute",
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  counterText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
  },
});
