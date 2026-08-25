import { useEffect, useRef, useState } from "react";
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
  const searchTimer = useRef(null);
  const suggestTimer = useRef(null);
  const skipSuggest = useRef(Boolean(initial));
  const lastSavedQuery = useRef("");

  useEffect(() => subscribeSearchHistory(setHistory), []);

  useEffect(() => {
    if (typeof params.q === "string" && params.q !== q) {
      skipSuggest.current = true;
      setShowSuggestions(false);
      setSuggestions([]);
      setQ(params.q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.q]);

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

  useEffect(() => {
    clearTimeout(searchTimer.current);
    const query = q.trim();
    if (query.length < 2) {
      setMovies([]);
      setSearched(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const data = await searchTitles(query);
        setMovies(data.movies || []);
        if (query !== lastSavedQuery.current) {
          lastSavedQuery.current = query;
          addSearchHistory(query).catch(() => {});
        }
      } catch {
        setMovies([]);
      } finally {
        setSearched(true);
        setLoading(false);
      }
    }, 350);
    return () => clearTimeout(searchTimer.current);
  }, [q]);

  const onChangeText = (text) => {
    skipSuggest.current = false;
    setQ(text);
  };

  const pickSuggestion = (word) => {
    skipSuggest.current = true;
    setShowSuggestions(false);
    setSuggestions([]);
    setQ(word);
    addSearchHistory(word).catch(() => {});
  };

  const pickHistory = (word) => {
    skipSuggest.current = true;
    setShowSuggestions(false);
    setSuggestions([]);
    setQ(word);
  };

  const clearQuery = () => {
    skipSuggest.current = false;
    setShowSuggestions(false);
    setSuggestions([]);
    setQ("");
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
                Type to search — suggestions appear as you type
              </Text>
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
    paddingVertical: 10,
  },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    paddingVertical: 0,
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
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  clearHist: {
    color: colors.accentLight,
    fontSize: 12,
    fontWeight: "700",
  },
  suggestLabel: {
    color: colors.muted,
    fontSize: 11,
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
    fontSize: 15,
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  hint: {
    color: colors.muted,
    textAlign: "center",
    marginTop: spacing.lg,
    paddingHorizontal: spacing.lg,
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
  },
});
