import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { searchSuggest } from "../lib/api";
import {
  filterSafeSuggestions,
  isSafeSearchBlocked,
} from "../lib/contentFilter";
import { colors, radii, spacing } from "../lib/theme";
import { BrandLogoSymbol } from "./BrandLogo";

const GITHUB_URL = "https://github.com/ismailofficialGithub/"

export default function HomeHeader() {
  const [q, setQ] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const timer = useRef(null);
  const skipSuggest = useRef(false);

  useEffect(() => {
    clearTimeout(timer.current);
    const query = q.trim();
    if (skipSuggest.current) {
      skipSuggest.current = false;
      setSuggestions([]);
      setOpen(false);
      setLoading(false);
      return;
    }
    if (query.length < 1) {
      setSuggestions([]);
      setOpen(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    timer.current = setTimeout(async () => {
      try {
        if (isSafeSearchBlocked(query)) {
          setSuggestions([]);
          setOpen(false);
          return;
        }
        const data = await searchSuggest(query);
        if (data?.blocked) {
          setSuggestions([]);
          setOpen(false);
          return;
        }
        const list = filterSafeSuggestions(data.suggestions || []).slice(0, 8);
        setSuggestions(list);
        setOpen(list.length > 0);
      } catch {
        setSuggestions([]);
        setOpen(false);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(timer.current);
  }, [q]);

  const goSearch = (query = q) => {
    const next = String(query || "").trim();
    skipSuggest.current = true;
    setOpen(false);
    setSuggestions([]);
    setQ("");
    router.push({
      pathname: "/(tabs)/search",
      params: next ? { q: next } : {},
    });
  };

  const onChangeText = (text) => {
    skipSuggest.current = false;
    setQ(text);
  };

  const clearQuery = () => {
    skipSuggest.current = true;
    setQ("");
    setSuggestions([]);
    setOpen(false);
  };

  const pickSuggestion = (word) => {
    goSearch(word);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <BrandLogoSymbol size={48} />

        <View style={styles.search}>
          <Ionicons name="search" size={18} color="#fff" />
          <TextInput
            value={q}
            onChangeText={onChangeText}
            placeholder="Search movies, shows…"
            placeholderTextColor="rgba(255,255,255,0.55)"
            style={styles.input}
            returnKeyType="search"
            onSubmitEditing={() => goSearch()}
            onFocus={() => {
              if (suggestions.length && !skipSuggest.current) setOpen(true);
            }}
            autoCorrect={false}
            autoCapitalize="none"
          />
          {q ? (
            <Pressable onPress={clearQuery} hitSlop={8} accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={18} color="rgba(255,255,255,0.55)" />
            </Pressable>
          ) : null}
          {loading ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : (
            <Pressable onPress={() => goSearch()} hitSlop={8} style={styles.searchBtn}>
              <Text style={styles.searchBtnText}>Search</Text>
            </Pressable>
          )}
        </View>

        <Pressable
          onPress={() => Linking.openURL(GITHUB_URL)}
          style={styles.github}
          hitSlop={8}
          accessibilityRole="link"
          accessibilityLabel="Open IsmailOfficial on GitHub"
        >
          <Ionicons name="logo-github" size={22} color={colors.text} />
        </Pressable>
      </View>

      {open && suggestions.length > 0 ? (
        <View style={styles.dropdown}>
          {suggestions.map((word) => (
            <Pressable
              key={word}
              style={styles.suggestRow}
              onPress={() => pickSuggestion(word)}
            >
              <Ionicons name="search-outline" size={16} color={colors.muted} />
              <Text style={styles.suggestText} numberOfLines={1}>
                {word}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    zIndex: 20,
    elevation: 20,
    paddingBottom: spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
  },
  search: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#2a2a30",
    borderRadius: radii.md,
    paddingLeft: 10,
    paddingRight: 8,
    height: 40,
    gap: 6,
  },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    paddingVertical: 0,
  },
  searchBtn: {
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  searchBtnText: {
    color: colors.secondary,
    fontWeight: "800",
    fontSize: 13,
  },
  github: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  dropdown: {
    marginTop: 6,
    marginHorizontal: spacing.md,
    backgroundColor: colors.panelSoft,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: "hidden",
  },
  suggestRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  suggestText: {
    color: colors.text,
    fontSize: 14,
    flex: 1,
  },
});
