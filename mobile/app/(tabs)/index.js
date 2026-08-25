import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";
import BannerCarousel from "../../components/BannerCarousel";
import CatalogSection from "../../components/CatalogSection";
import CategoryBar from "../../components/CategoryBar";
import EmptyState from "../../components/EmptyState";
import HomeHeader from "../../components/HomeHeader";
import HomeSkeleton from "../../components/HomeSkeleton";
import HotShortsSection from "../../components/HotShortsSection";
import Screen from "../../components/Screen";
import WideTitleCard from "../../components/WideTitleCard";
import {
  getAnimation,
  getHome,
  getMovies,
  getRanking,
  getTvSeries,
} from "../../lib/api";
import {
  getCachedSections,
  hydrateCatalogCache,
  isCacheFresh,
  setCachedSections,
} from "../../lib/catalogCache";
import { getTabScroll, saveTabScroll } from "../../lib/tabScroll";
import { isHotShortsSection } from "../../lib/shorts";
import { colors, spacing } from "../../lib/theme";

const PREFETCH = ["trending", "movie", "tv", "animation", "ranking"];

async function fetchCategory(id) {
  if (id === "movie") return getMovies();
  if (id === "tv") return getTvSeries();
  if (id === "animation") return getAnimation();
  if (id === "ranking") return getRanking();
  return getHome();
}

function normalizeSections(data) {
  return (data?.sections || []).filter((s) => s.movies?.length);
}

function pickBanner(sections) {
  const banner = sections.find(
    (s) => String(s.section || "").toLowerCase() === "banner"
  );
  if (banner?.movies?.length) return banner.movies;
  return sections.find((s) => s.movies?.length)?.movies?.slice(0, 8) || [];
}

function cacheKey(id) {
  return id === "live" ? "trending" : id;
}

function sectionName(section) {
  return String(section?.section || "")
    .replace(/[^\w\s]/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function matchesSection(section, patterns) {
  const name = sectionName(section);
  return patterns.some((p) => p.test(name));
}

/** Home order: Trending → Coming Soon → Cinema → Hot Shorts → rest. */
function orderHomeRows(sections) {
  const rows = (sections || []).filter(
    (s) => sectionName(s) !== "banner" && s.movies?.length
  );

  const takeFirst = (patterns) => {
    const idx = rows.findIndex((s) => matchesSection(s, patterns));
    if (idx < 0) return null;
    return rows.splice(idx, 1)[0];
  };

  const trending = takeFirst([/^trending now$/, /trending/]);
  const comingSoon = takeFirst([/coming\s*soon/]);
  const cinema = takeFirst([/^cinema$/, /cinema/]);
  const shorts = takeFirst([/hot\s*short/, /short\s*tv/]);

  // Drop duplicate trending rows so they don't appear again below
  const rest = rows.filter((s) => !matchesSection(s, [/^trending now$/, /^trending$/]));

  return {
    trending,
    ordered: [comingSoon, cinema, shorts, ...rest].filter(Boolean),
  };
}

export default function HomeScreen() {
  const [cacheReady, setCacheReady] = useState(false);
  const [category, setCategory] = useState("trending");
  const [sections, setSections] = useState([]);
  const [bannerItems, setBannerItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef(null);
  const scrollYRef = useRef(0);
  const activeKeyRef = useRef("trending");
  const prefetched = useRef(false);

  const scrollKey = `home:${cacheKey(category)}`;

  useFocusEffect(
    useCallback(() => {
      const y = getTabScroll(scrollKey);
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ y, animated: false });
        scrollYRef.current = y;
      });
      return () => {
        saveTabScroll(scrollKey, scrollYRef.current);
      };
    }, [scrollKey])
  );

  const applySections = useCallback((key, next) => {
    setSections(next);
    if (key === "trending") {
      setBannerItems(pickBanner(next));
    }
  }, []);

  const saveCache = useCallback((key, next) => {
    setCachedSections(key, next);
    if (key === "trending") {
      const banners = pickBanner(next);
      if (banners.length) setBannerItems(banners);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      await hydrateCatalogCache();
      if (!alive) return;
      const key = cacheKey("trending");
      const cached = getCachedSections(key);
      if (cached?.length) {
        applySections(key, cached);
        setLoading(false);
      }
      setCacheReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [applySections]);

  const load = useCallback(
    async (cat, { isRefresh = false } = {}) => {
      const key = cacheKey(cat);
      activeKeyRef.current = key;
      const cached = getCachedSections(key);
      const hasCache = Boolean(cached?.length);

      if (hasCache && !isRefresh) {
        applySections(key, cached);
        setLoading(false);
        setError("");
        if (isCacheFresh(key)) return;
        setSyncing(true);
      } else if (!hasCache) {
        setLoading(true);
        setError("");
        if (!isRefresh) {
          setSections([]);
          if (key === "trending") setBannerItems([]);
        }
      }

      if (isRefresh) setRefreshing(true);

      try {
        const data = await fetchCategory(key);
        const next = normalizeSections(data);
        saveCache(key, next);
        if (activeKeyRef.current === key) {
          applySections(key, next);
          setError("");
          setLoading(false);
        }
      } catch (err) {
        if (activeKeyRef.current !== key) return;
        if (!getCachedSections(key)?.length) {
          setSections([]);
          if (key === "trending") setBannerItems([]);
          setError(err?.message || "Couldn’t load. Is the server running?");
        }
        setLoading(false);
      } finally {
        if (activeKeyRef.current === key) setSyncing(false);
        setRefreshing(false);
      }
    },
    [applySections, saveCache]
  );

  useEffect(() => {
    if (!cacheReady) return;
    load(category);
  }, [cacheReady, category, load]);

  useEffect(() => {
    if (!cacheReady || prefetched.current) return;
    prefetched.current = true;
    PREFETCH.forEach(async (id) => {
      if (isCacheFresh(id)) return;
      try {
        const data = await fetchCategory(id);
        saveCache(id, normalizeSections(data));
      } catch {
        /* ignore background prefetch */
      }
    });
  }, [cacheReady, saveCache]);

  const onCategoryChange = useCallback(
    (id) => {
      if (id === category) return;
      saveTabScroll(scrollKey, scrollYRef.current);
      scrollRef.current?.scrollTo({ y: 0, animated: false });
      scrollYRef.current = 0;
      const key = cacheKey(id);
      activeKeyRef.current = key;
      const cached = getCachedSections(key);
      setCategory(id);
      if (cached?.length) {
        applySections(key, cached);
        setLoading(false);
        setError("");
      } else {
        setSections([]);
        if (key === "trending") setBannerItems([]);
        setLoading(true);
        setError("");
      }
    },
    [applySections, category, scrollKey]
  );

  const { trending: featuredRow, ordered: otherRows } = useMemo(
    () => orderHomeRows(sections),
    [sections]
  );
  const showSkeleton = loading && !featuredRow && !otherRows.length && !error;
  const showContent =
    featuredRow || otherRows.length || bannerItems.length || showSkeleton;
  const empty =
    !loading &&
    !syncing &&
    !error &&
    !featuredRow &&
    !otherRows.length &&
    !bannerItems.length;

  return (
    <Screen>
      <HomeHeader />
      <CategoryBar activeId={category} onChange={onCategoryChange} />

      {syncing ? (
        <View style={styles.syncBar}>
          <ActivityIndicator size="small" color={colors.secondary} />
          <Text style={styles.syncText}>Updating catalog…</Text>
        </View>
      ) : null}

      {error && !featuredRow && !otherRows.length && !bannerItems.length && !showSkeleton ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
          <Text style={styles.retry} onPress={() => load(category)}>
            Tap to retry
          </Text>
          <Text style={styles.hint}>
            On your PC run: cd server && npm run dev
          </Text>
        </View>
      ) : empty ? (
        <EmptyState hint="Start the API with cd server && npm run dev" />
      ) : showContent ? (
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          scrollEventThrottle={16}
          onScroll={(e) => {
            scrollYRef.current = e.nativeEvent.contentOffset.y;
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(category, { isRefresh: true })}
              tintColor={colors.accent}
            />
          }
        >
          {showSkeleton ? (
            <HomeSkeleton hideBanner={false} />
          ) : (
            <>
              {bannerItems.length ? (
                <BannerCarousel items={bannerItems} />
              ) : null}

              {featuredRow ? (
                <View style={styles.wideBlock}>
                  <View style={styles.wideHead}>
                    <Text style={styles.wideTitle}>
                      {featuredRow.section || "Trending"}
                    </Text>
                  </View>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.wideRow}
                  >
                    {(featuredRow.movies || []).slice(0, 16).map((item, i) => (
                      <WideTitleCard
                        key={item.slug || item.subject_id || `${item.name}-${i}`}
                        item={item}
                      />
                    ))}
                  </ScrollView>
                </View>
              ) : null}

              {otherRows.map((section, index) =>
                isHotShortsSection(section) ? (
                  <HotShortsSection
                    key={`${section.section}-${index}`}
                    section={section}
                  />
                ) : (
                  <CatalogSection
                    key={`${section.section}-${index}`}
                    section={section}
                  />
                )
              )}
            </>
          )}
        </ScrollView>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingBottom: spacing.xl,
  },
  syncBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.panelSoft,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  syncText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
  },
  wideBlock: {
    marginBottom: spacing.lg,
  },
  wideHead: {
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  wideTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "700",
  },
  wideRow: {
    paddingHorizontal: spacing.md,
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
  hint: {
    color: colors.muted,
    textAlign: "center",
    fontSize: 12,
    marginTop: spacing.sm,
  },
});
