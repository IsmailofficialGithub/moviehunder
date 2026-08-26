import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import EmptyState from "../../components/EmptyState";
import PosterCard from "../../components/PosterCard";
import Screen from "../../components/Screen";
import { searchSuggest, searchTitles } from "../../lib/api";
import {
  addSearchHistory,
  clearSearchHistory,
  removeSearchHistory,
  subscribeSearchHistory,
} from "../../lib/searchHistory";
import { colors, radii, spacing } from "../../lib/theme";

export default function SearchScreen() {
  const params = useLocalSearchParams();
  const initial = typeof params.q === "string" ? params.q : "";
  const [q, setQ] = useState(initial);
  const [movies, setMovies] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestTimer = useRef(null);
  const skipSuggest = useRef(Boolean(initial));
  const lastSavedQuery = useRef("");
  const searchReq = useRef(0);

  useEffect(() => subscribeSearchHistory(setHistory), []);

  /** Run title search API + save word history (only on submit / pick / deep-link). */
  const runSearch = useCallback(async (raw, { saveHistory = true } = {}) => {
    const query = String(raw || "").trim();
    skipSuggest.current = true;
    setShowSuggestions(false);
    setSuggestions([]);
    setQ(query);

    if (query.length < 2) {
      setMovies([]);
      setSearched(false);
      setLoading(false);
      return;
    }

    const reqId = ++searchReq.current;
    setLoading(true);
    try {
      const data = await searchTitles(query);
      if (reqId !== searchReq.current) return;
      setMovies(data.movies || []);
      setSearched(true);
      if (
        saveHistory &&
        query.toLowerCase() !== lastSavedQuery.current.toLowerCase()
      ) {
        lastSavedQuery.current = query;
        addSearchHistory(query).catch(() => {});
      }
    } catch {
      if (reqId !== searchReq.current) return;
      setMovies([]);
      setSearched(true);
    } finally {
      if (reqId === searchReq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (typeof params.q === "string" && params.q.trim()) {
      runSearch(params.q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.q]);

  // Typing → suggest API only (never stores history)
  useEffect(() => {
    clearTimeout(suggestTimer.current);
    const query = q.trim();

    if (skipSuggest.current) {
      skipSuggest.current = false;
      setSuggestions([]);
      setShowSuggestions(false);
      setSuggestLoading(false);
      return;
    }

    if (query.length < 1) {
      setSuggestions([]);
      setShowSuggestions(false);
      setSuggestLoading(false);
      return;
    }

    setSuggestLoading(true);
    suggestTimer.current = setTimeout(async () => {
      try {
        const data = await searchSuggest(query);
        const list = (data.suggestions || []).slice(0, 8);
        setSuggestions(list);
        setShowSuggestions(list.length > 0);
      } catch {
        setSuggestions([]);
        setShowSuggestions(false);
      } finally {
        setSuggestLoading(false);
      }
    }, 200);
    return () => clearTimeout(suggestTimer.current);
  }, [q]);

  const onChangeText = (text) => {
    skipSuggest.current = false;
    setQ(text);
    setSearched(false);
    setMovies([]);
  };

  const submitSearch = () => runSearch(q);

  const pickSuggestion = (word) => runSearch(word);

  const pickHistory = (word) => runSearch(word);

  const clearQuery = () => {
    skipSuggest.current = false;
    setShowSuggestions(false);
    setSuggestions([]);
    setQ("");
    setMovies([]);
    setSearched(false);
  };

  const showHistory = !q.trim() && !loading && !searched && history.length > 0;

  return (
    <Screen title="Search">
      <View style={styles.searchBox}>
        <View style={styles.inputWrap}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            value={q}
            onChangeText={onChangeText}
            placeholder="Search titles..."
            placeholderTextColor={colors.muted}
            style={styles.input}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            onSubmitEditing={submitSearch}
            onFocus={() => {
              if (suggestions.length && !skipSuggest.current) {
                setShowSuggestions(true);
              }
            }}
          />
          {q ? (
            <Pressable onPress={clearQuery} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.muted} />
            </Pressable>
          ) : null}
          <Pressable
            onPress={submitSearch}
            hitSlop={8}
            style={styles.searchBtn}
            accessibilityRole="button"
            accessibilityLabel="Search"
          >
            <Text style={styles.searchBtnText}>Search</Text>
          </Pressable>
        </View>
      </View>

      {showSuggestions && (suggestions.length > 0 || suggestLoading) ? (
        <View style={styles.suggestBox}>
          <Text style={styles.suggestLabel}>Suggestions</Text>
          {suggestLoading && !suggestions.length ? (
            <ActivityIndicator
              color={colors.accent}
              style={{ marginVertical: 8 }}
            />
          ) : (
            suggestions.map((word) => (
              <Pressable
                key={word}
                style={styles.suggestRow}
                onPress={() => pickSuggestion(word)}
              >
                <Ionicons
                  name="search-outline"
                  size={16}
                  color={colors.muted}
                />
                <Text style={styles.suggestText} numberOfLines={1}>
                  {word}
                </Text>
              </Pressable>
            ))
          )}
        </View>
      ) : null}

      {showHistory ? (
        <View style={styles.historyBox}>
          <View style={styles.historyHead}>
            <Text style={styles.historyLabel}>Recent searches</Text>
            <Pressable onPress={() => clearSearchHistory()} hitSlop={8}>
              <Text style={styles.clearHist}>Clear</Text>
            </Pressable>
          </View>
          {history.map((word) => (
            <Pressable
              key={word}
              style={styles.suggestRow}
              onPress={() => pickHistory(word)}
            >
              <Ionicons name="time-outline" size={16} color={colors.muted} />
              <Text style={styles.suggestText} numberOfLines={1}>
                {word}
              </Text>
              <Pressable
                onPress={() => removeSearchHistory(word)}
                hitSlop={10}
              >
                <Ionicons name="close" size={16} color={colors.muted} />
              </Pressable>
            </Pressable>
          ))}
        </View>
      ) : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : searched && !movies.length ? (
        <EmptyState
          title="No items found"
          hint={`Nothing matched “${q.trim()}”`}
        />
      ) : (
        <FlatList
          data={movies}
          keyExtractor={(item, i) => item.slug || `${item.name}-${i}`}
          numColumns={3}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={styles.row}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            !q.trim() && !history.length ? (
              <Text style={styles.hint}>
                Type for suggestions, then tap Search
              </Text>
            ) : q.trim() && !searched ? (
              <Text style={styles.hint}>Tap Search to find titles</Text>
            ) : null
          }
          renderItem={({ item }) => (
            <View style={styles.cell}>
              <PosterCard item={item} width={104} onPress={clearQuery} />
            </View>
          )}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  searchBox: {
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    paddingVertical: 0,
  },
  searchBtn: {
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  searchBtnText: {
    color: colors.secondary,
    fontWeight: "800",
    fontSize: 13,
  },
  suggestBox: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.panelSoft,
    borderRadius: radii.md,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  historyBox: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.panelSoft,
    borderRadius: radii.md,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  historyHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    marginBottom: 4,
  },
  historyLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  clearHist: {
    color: colors.secondary,
    fontSize: 12,
    fontWeight: "700",
  },
  suggestLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    paddingHorizontal: 10,
    marginBottom: 4,
  },
  suggestRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  suggestText: {
    color: colors.text,
    fontSize: 14,
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 40,
  },
  grid: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  row: {
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  cell: {
    flex: 1,
    maxWidth: "33.33%",
  },
  hint: {
    color: colors.muted,
    textAlign: "center",
    marginTop: 28,
    paddingHorizontal: spacing.lg,
    fontSize: 14,
  },
});
