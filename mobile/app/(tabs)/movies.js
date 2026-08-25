import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshControl, ScrollView } from "react-native";
import { useFocusEffect } from "expo-router";
import CatalogSection from "../../components/CatalogSection";
import EmptyState from "../../components/EmptyState";
import Screen from "../../components/Screen";
import { getMovies } from "../../lib/api";
import { getTabScroll, saveTabScroll } from "../../lib/tabScroll";
import { colors, spacing } from "../../lib/theme";

const SCROLL_KEY = "movies";

export default function MoviesScreen() {
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef(null);
  const scrollYRef = useRef(0);

  useFocusEffect(
    useCallback(() => {
      const y = getTabScroll(SCROLL_KEY);
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ y, animated: false });
        scrollYRef.current = y;
      });
      return () => {
        saveTabScroll(SCROLL_KEY, scrollYRef.current);
      };
    }, [])
  );

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const data = await getMovies();
      setSections((data.sections || []).filter((s) => s.movies?.length));
    } catch {
      setSections([]);
      setError("Couldn’t load movies.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Screen
      title="Movies"
      loading={loading}
      error={error}
      onRetry={() => load()}
    >
      {!sections.length ? (
        <EmptyState title="No movies found" />
      ) : (
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{ paddingBottom: spacing.xl }}
          scrollEventThrottle={16}
          onScroll={(e) => {
            scrollYRef.current = e.nativeEvent.contentOffset.y;
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              tintColor={colors.gold}
            />
          }
        >
          {sections.map((section, index) => (
            <CatalogSection
              key={`${section.section}-${index}`}
              section={section}
            />
          ))}
        </ScrollView>
      )}
    </Screen>
  );
}
