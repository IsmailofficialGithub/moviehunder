import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
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
  isBypass,
  isSafeSearchBlocked,
} from "../lib/contentFilter";
import {
  filterSearchHistory,
  removeSearchHistory,
  subscribeSearchHistory,
} from "../lib/searchHistory";
import { useAuth } from "../lib/AuthProvider";
import { colors, radii, spacing } from "../lib/theme";
import { BrandLogoSymbol } from "./BrandLogo";

const GITHUB_URL = "https://github.com/ismailofficialGithub/";

export default function HomeHeader() {
  const { user } = useAuth();
  const avatarUrl = user?.avatar_url || user?.picture || user?.avatar;
  const displayName = user?.display_name || user?.name || "";
  const initialLetter = displayName ? displayName.charAt(0).toUpperCase() : "";

  const [q, setQ] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const timer = useRef(null);
  const skipSuggest = useRef(false);
  const inputRef = useRef(null);

  useEffect(() => subscribeSearchHistory(setHistory), []);

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
      setLoading(false);
      return;
    }
    setLoading(true);
    timer.current = setTimeout(async () => {
      try {
        const bypass = isBypass(query);
        if (!bypass && isSafeSearchBlocked(query)) {
          setSuggestions([]);
          setOpen(false);
          return;
        }
        const data = await searchSuggest(query);
        if (data?.blocked && !bypass) {
          setSuggestions([]);
          setOpen(false);
          return;
        }
        const list = (bypass ? (data.suggestions || []) : filterSafeSuggestions(data.suggestions || [])).slice(0, 8);
        setSuggestions(list);
        setOpen(list.length > 0 || history.length > 0);
      } catch {
        setSuggestions([]);
        setOpen(false);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(timer.current);
  }, [q, history.length]);

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
    if (!open) setOpen(true);
  };

  const clearQuery = () => {
    skipSuggest.current = true;
    setQ("");
    setSuggestions([]);
    setOpen(false);
  };

  const fillSuggestion = (word) => {
    const bypass = isBypass(q);
    const tag = q.match(/^@open788269/i)?.[0] || "";
    const next = tag ? `${tag} ${word}` : word;
    skipSuggest.current = false;
    setQ(next);
    setOpen(true);
    inputRef.current?.focus();
  };

  const pickSuggestion = (word) => {
    const bypass = isBypass(q);
    const tag = q.match(/^@open788269/i)?.[0] || "@open788269";
    goSearch(bypass && !isBypass(word) ? `${tag} ${word}` : word);
  };

  const pickHistory = (word) => {
    goSearch(word);
  };

  const filteredHistory = filterSearchHistory(history, q);

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <BrandLogoSymbol size={44} />

        <View style={styles.search}>
          <Ionicons name="search" size={17} color="rgba(255,255,255,0.6)" />
          <TextInput
            ref={inputRef}
            value={q}
            onChangeText={onChangeText}
            placeholder="Search movies, shows…"
            placeholderTextColor="rgba(255,255,255,0.45)"
            style={styles.input}
            returnKeyType="search"
            onSubmitEditing={() => goSearch()}
            onFocus={() => {
              setOpen(filteredHistory.length > 0 || suggestions.length > 0);
            }}
            autoCorrect={false}
            autoCapitalize="none"
          />
          {q ? (
            <Pressable onPress={clearQuery} hitSlop={8} accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={18} color="rgba(255,255,255,0.6)" />
            </Pressable>
          ) : null}
          {loading ? (
            <ActivityIndicator size="small" color={colors.accentLight || colors.secondary} />
          ) : (
            <Pressable onPress={() => goSearch()} hitSlop={8} style={styles.searchBtn} accessibilityLabel="Search">
              <Ionicons name="search" size={15} color="#fff" />
            </Pressable>
          )}
        </View>

        <Pressable
          onPress={() => router.push("/account")}
          style={styles.avatarBtn}
          hitSlop={8}
          accessibilityLabel="Account profile"
        >
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatarImg} />
          ) : initialLetter ? (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarInitial}>{initialLetter}</Text>
            </View>
          ) : (
            <Ionicons name="person-circle-outline" size={28} color={colors.accentLight || colors.secondary} />
          )}
        </Pressable>

        <Pressable
          onPress={() => Linking.openURL(GITHUB_URL)}
          style={styles.github}
          hitSlop={8}
          accessibilityRole="link"
          accessibilityLabel="Open IsmailOfficial on GitHub"
        >
          <Ionicons name="logo-github" size={19} color={colors.muted} />
        </Pressable>
      </View>

      {open && (filteredHistory.length > 0 || suggestions.length > 0) ? (
        <View style={styles.dropdown}>
          {filteredHistory.map((item) => (
            <Pressable
              key={`h-${item}`}
              style={styles.suggestRow}
              onPress={() => pickHistory(item)}
            >
              <Ionicons name="time-outline" size={16} color={colors.muted} />
              <Text style={styles.suggestText} numberOfLines={1}>
                {item}
              </Text>
              <Pressable
                onPress={(e) => {
                  e.stopPropagation();
                  removeSearchHistory(item);
                }}
                hitSlop={10}
                style={styles.removeBtn}
                accessibilityLabel={`Remove ${item} from history`}
              >
                <Ionicons name="close" size={16} color={colors.muted} />
              </Pressable>
            </Pressable>
          ))}

          {suggestions.map((word) => (
            <Pressable
              key={`s-${word}`}
              style={styles.suggestRow}
              onPress={() => pickSuggestion(word)}
            >
              <Ionicons name="search-outline" size={16} color={colors.muted} />
              <Text style={styles.suggestText} numberOfLines={1}>
                {word}
              </Text>
              <Pressable
                style={styles.insertBtn}
                onPress={(e) => {
                  e.stopPropagation();
                  fillSuggestion(word);
                }}
                hitSlop={10}
                accessibilityLabel={`Insert "${word}" into search`}
              >
                <Ionicons
                  name="arrow-up-outline"
                  size={16}
                  color={colors.muted}
                  style={styles.insertIcon}
                />
              </Pressable>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    zIndex: 50,
    elevation: 20,
    paddingBottom: spacing.xs,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
  },
  search: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    borderRadius: radii.pill,
    paddingLeft: 12,
    paddingRight: 6,
    height: 38,
    gap: 6,
  },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: 13,
    paddingVertical: 0,
  },
  searchBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.18)",
    backgroundColor: "#181820",
  },
  avatarImg: {
    width: "100%",
    height: "100%",
    borderRadius: 17,
  },
  avatarPlaceholder: {
    width: "100%",
    height: "100%",
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },
  github: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  dropdown: {
    marginTop: 6,
    marginHorizontal: spacing.md,
    backgroundColor: "#14141a",
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.14)",
    overflow: "hidden",
    elevation: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
  },
  suggestRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
  },
  suggestText: {
    color: colors.text,
    fontSize: 13.5,
    flex: 1,
  },
  insertBtn: {
    padding: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  insertIcon: {
    transform: [{ rotate: "-45deg" }],
  },
  removeBtn: {
    padding: 6,
    alignItems: "center",
    justifyContent: "center",
  },
});

