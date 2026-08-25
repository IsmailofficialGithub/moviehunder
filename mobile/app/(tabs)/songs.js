import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Image } from "expo-image";
import { useFocusEffect } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import Screen from "../../components/Screen";
import {
  addTrackToPlaylist,
  createPlaylist,
  deletePlaylist,
  ensureLikedPlaylist,
  getPlaylist,
  listPlaylists,
  removeTrackFromPlaylist,
  searchLocalPlaylists,
  subscribePlaylists,
} from "../../lib/localPlaylists";
import {
  fetchMusicPlaylistTracks,
  searchMusic,
  suggestMusic,
} from "../../lib/musicApi";
import {
  playNext,
  playPrev,
  playTrack,
  subscribeMusicPlayer,
  togglePlayPause,
} from "../../lib/musicPlayer";
import {
  enqueueMusicDownload,
  hydrateMusicDownloads,
  musicDownloadProgress,
  pauseMusicDownload,
  removeMusicDownload,
  resumeMusicDownload,
  subscribeMusicDownloads,
} from "../../lib/musicDownloads";
import { openMusicPlayer } from "../../lib/musicUi";
import { colors, radii, spacing } from "../../lib/theme";

const MODES = [
  { id: "search", label: "Search" },
  { id: "playlists", label: "My Playlists" },
];

function formatMs(ms) {
  const n = Math.round(Number(ms) / 1000);
  if (!Number.isFinite(n) || n <= 0) return "";
  const m = Math.floor(n / 60);
  const s = String(n % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function downloadIconFor(dl) {
  if (!dl) return "download-outline";
  if (dl.status === "completed") return "checkmark-circle";
  if (dl.status === "downloading" || dl.status === "queued") return "cloud-download";
  if (dl.status === "paused") return "pause-circle-outline";
  if (dl.status === "failed") return "alert-circle-outline";
  return "download-outline";
}

function LoadingChunks({ count = 6 }) {
  return (
    <View style={styles.skelWrap}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={styles.skelRow}>
          <View style={styles.skelThumb} />
          <View style={styles.skelCopy}>
            <View style={[styles.skelLine, { width: `${58 + (i % 3) * 10}%` }]} />
            <View style={[styles.skelLineSm, { width: `${36 + (i % 2) * 12}%` }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

function TrackRow({
  item,
  onPlay,
  onAdd,
  onRemove,
  onDownload,
  download,
  playingId,
  isPlaying,
  disabled,
}) {
  const active = playingId === item.id;
  const dlColor =
    download?.status === "completed"
      ? colors.secondary
      : download?.status === "failed"
        ? colors.danger
        : colors.muted;
  const pct =
    download &&
    download.status !== "completed" &&
    musicDownloadProgress(download) > 0
      ? Math.round(musicDownloadProgress(download) * 100)
      : null;

  return (
    <Pressable
      style={[styles.trackRow, disabled && styles.rowDisabled]}
      onPress={() => !disabled && onPlay?.(item)}
      disabled={disabled}
    >
      {item.image ? (
        <Image
          source={{ uri: item.image }}
          style={styles.thumb}
          contentFit="cover"
          cachePolicy="memory-disk"
        />
      ) : (
        <View style={[styles.thumb, styles.thumbEmpty]}>
          <Ionicons name="musical-notes" size={14} color={colors.muted} />
        </View>
      )}
      <View style={styles.trackCopy}>
        <Text style={[styles.trackName, active && styles.trackActive]} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.trackMeta} numberOfLines={1}>
          {[item.artist, formatMs(item.duration_ms), pct != null ? `${pct}%` : null]
            .filter(Boolean)
            .join(" · ")}
        </Text>
      </View>
      {active && isPlaying ? (
        <Ionicons name="bar-chart" size={13} color={colors.secondary} />
      ) : null}
      {onDownload ? (
        <Pressable
          onPress={(e) => {
            e?.stopPropagation?.();
            if (!disabled) onDownload(item, download);
          }}
          hitSlop={6}
          style={styles.iconBtn}
          disabled={disabled}
        >
          <Ionicons
            name={downloadIconFor(download)}
            size={17}
            color={dlColor}
          />
        </Pressable>
      ) : null}
      {onAdd ? (
        <Pressable
          onPress={() => !disabled && onAdd(item)}
          hitSlop={6}
          style={styles.iconBtn}
          disabled={disabled}
        >
          <Ionicons name="add-circle-outline" size={17} color={colors.accentLight} />
        </Pressable>
      ) : null}
      {onRemove ? (
        <Pressable
          onPress={() => !disabled && onRemove(item)}
          hitSlop={6}
          style={styles.iconBtn}
          disabled={disabled}
        >
          <Ionicons name="trash-outline" size={15} color={colors.danger} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

function MiniPlayer({ state, onPrev, onToggle, onNext, onExpand }) {
  if (!state?.track) return null;
  const t = state.track;
  return (
    <Pressable style={styles.player} onPress={onExpand}>
      {t.image ? (
        <Image source={{ uri: t.image }} style={styles.playerArt} contentFit="cover" />
      ) : (
        <View style={[styles.playerArt, styles.thumbEmpty]} />
      )}
      <View style={styles.playerCopy}>
        <Text style={styles.playerTitle} numberOfLines={1}>
          {t.name}
        </Text>
        <Text style={styles.playerSub} numberOfLines={1}>
          {t.artist || "Audius"}
        </Text>
      </View>
      <Pressable
        onPress={(e) => {
          e?.stopPropagation?.();
          onPrev?.();
        }}
        style={styles.ctrlBtn}
        hitSlop={6}
      >
        <Ionicons name="play-skip-back" size={18} color={colors.text} />
      </Pressable>
      <Pressable
        onPress={(e) => {
          e?.stopPropagation?.();
          onToggle?.();
        }}
        style={styles.ctrlPlay}
        hitSlop={6}
      >
        <Ionicons
          name={state.playing ? "pause" : "play"}
          size={18}
          color={colors.accentInk}
        />
      </Pressable>
      <Pressable
        onPress={(e) => {
          e?.stopPropagation?.();
          onNext?.();
        }}
        style={styles.ctrlBtn}
        hitSlop={6}
      >
        <Ionicons name="play-skip-forward" size={18} color={colors.text} />
      </Pressable>
    </Pressable>
  );
}

export default function SongsScreen() {
  const [mode, setMode] = useState("search");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tracks, setTracks] = useState([]);
  const [spotifyPlaylists, setSpotifyPlaylists] = useState([]);
  const [localPlaylists, setLocalPlaylists] = useState([]);
  const [activePlaylistId, setActivePlaylistId] = useState(null);
  const [activePlaylist, setActivePlaylist] = useState(null);
  const [player, setPlayer] = useState({ track: null, playing: false });
  const [pickTrack, setPickTrack] = useState(null);
  const [newName, setNewName] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [downloads, setDownloads] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const suggestTimer = useRef(null);
  const skipSuggest = useRef(false);
  const loadingRef = useRef(false);
  const activePlaylistIdRef = useRef(null);

  const setBusy = useCallback((v) => {
    loadingRef.current = v;
    setLoading(v);
  }, []);

  const downloadMap = useMemo(() => {
    const map = new Map();
    for (const d of downloads) map.set(String(d.id), d);
    return map;
  }, [downloads]);

  const refreshLocal = useCallback(async (q = "") => {
    await ensureLikedPlaylist().catch(() => {});
    const list = q.trim()
      ? await searchLocalPlaylists(q)
      : await listPlaylists();
    setLocalPlaylists(list);
    return list;
  }, []);

  const openPlaylist = useCallback(async (id) => {
    activePlaylistIdRef.current = id;
    setActivePlaylistId(id);
    const pl = await getPlaylist(id);
    if (activePlaylistIdRef.current === id) {
      setActivePlaylist(pl);
    }
  }, []);

  const syncActivePlaylist = useCallback(async (playlistId) => {
    if (!playlistId) return;
    const pl = await getPlaylist(playlistId);
    if (activePlaylistIdRef.current === playlistId) {
      setActivePlaylist(pl);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshLocal("");
      if (activePlaylistIdRef.current) {
        syncActivePlaylist(activePlaylistIdRef.current);
      }
    }, [refreshLocal, syncActivePlaylist])
  );

  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () =>
      setKeyboardOpen(true)
    );
    const hide = Keyboard.addListener("keyboardDidHide", () =>
      setKeyboardOpen(false)
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  useEffect(() => {
    return subscribePlaylists((list) => {
      setLocalPlaylists(list);
      const id = activePlaylistIdRef.current;
      if (id) {
        const found = list.find((p) => p.id === id);
        if (found) setActivePlaylist(found);
        else syncActivePlaylist(id);
      }
    });
  }, [syncActivePlaylist]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setBusy(true);
        const data = await searchMusic("", { limit: 20 });
        if (!alive) return;
        setTracks(data.tracks || []);
      } catch {
        /* ignore */
      } finally {
        if (alive) setBusy(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [setBusy]);

  useEffect(() => {
    return subscribeMusicPlayer(setPlayer);
  }, []);

  useEffect(() => {
    hydrateMusicDownloads().catch(() => {});
    return subscribeMusicDownloads(setDownloads);
  }, []);

  const onDownloadPress = useCallback(async (track, dl) => {
    try {
      if (!dl) {
        await enqueueMusicDownload(track);
        return;
      }
      if (dl.status === "completed") {
        Alert.alert("Remove download?", track.name || "This song", [
          { text: "Cancel", style: "cancel" },
          {
            text: "Remove",
            style: "destructive",
            onPress: () => removeMusicDownload(track.id),
          },
        ]);
        return;
      }
      if (dl.status === "downloading" || dl.status === "queued") {
        await pauseMusicDownload(track.id);
        return;
      }
      if (dl.status === "paused" || dl.status === "failed") {
        await resumeMusicDownload(track.id);
      }
    } catch (err) {
      Alert.alert("Download", err?.message || "Couldn’t download");
    }
  }, []);

  useEffect(() => {
    if (!activePlaylistId) {
      activePlaylistIdRef.current = null;
      setActivePlaylist(null);
      return;
    }
    activePlaylistIdRef.current = activePlaylistId;
    syncActivePlaylist(activePlaylistId);
  }, [activePlaylistId, syncActivePlaylist]);

  const runSearch = useCallback(async (overrideQ) => {
    const q = String(overrideQ != null ? overrideQ : query).trim();
    if (!q || loadingRef.current) return;
    setBusy(true);
    setError("");
    setShowSuggestions(false);
    setSuggestions([]);
    try {
      if (mode === "playlists") {
        await refreshLocal(q);
      } else {
        const data = await searchMusic(q, { limit: 20 });
        setTracks(data.tracks || []);
        setSpotifyPlaylists(data.playlists || []);
      }
    } catch (err) {
      setError(err?.message || "Search failed");
      setTracks([]);
      setSpotifyPlaylists([]);
    } finally {
      setBusy(false);
    }
  }, [mode, query, refreshLocal, setBusy]);

  useEffect(() => {
    clearTimeout(suggestTimer.current);
    if (mode !== "search") {
      setSuggestions([]);
      setShowSuggestions(false);
      setSuggestLoading(false);
      return;
    }

    const q = query.trim();
    if (skipSuggest.current) {
      skipSuggest.current = false;
      setSuggestions([]);
      setShowSuggestions(false);
      setSuggestLoading(false);
      return;
    }
    if (q.length < 1) {
      setSuggestions([]);
      setShowSuggestions(false);
      setSuggestLoading(false);
      return;
    }

    setSuggestLoading(true);
    suggestTimer.current = setTimeout(async () => {
      try {
        const data = await suggestMusic(q, { limit: 8 });
        const list = data.suggestions || [];
        setSuggestions(list);
        setShowSuggestions(list.length > 0);
      } catch {
        setSuggestions([]);
        setShowSuggestions(false);
      } finally {
        setSuggestLoading(false);
      }
    }, 220);
    return () => clearTimeout(suggestTimer.current);
  }, [query, mode]);

  const onChangeQuery = useCallback((text) => {
    skipSuggest.current = false;
    setQuery(text);
  }, []);

  const pickSuggestion = useCallback(
    (item) => {
      const next = item?.query || item?.label || "";
      skipSuggest.current = true;
      setShowSuggestions(false);
      setSuggestions([]);
      setQuery(next);
      runSearch(next);
    },
    [runSearch]
  );

  const onPlay = useCallback(async (track, list) => {
    openMusicPlayer();
    const result = await playTrack(track, list);
    if (!result.ok && result.error) {
      Alert.alert("Can't play", result.error);
    }
  }, []);

  const onCreate = useCallback(async () => {
    const pl = await createPlaylist(newName);
    setNewName("");
    setShowCreate(false);
    await refreshLocal("");
    setMode("playlists");
    setActivePlaylistId(pl.id);
  }, [newName, refreshLocal]);

  const onAddToPlaylist = useCallback(
    async (playlistId) => {
      if (!pickTrack) return;
      const updated = await addTrackToPlaylist(playlistId, pickTrack);
      setPickTrack(null);
      if (updated) {
        setLocalPlaylists((prev) => {
          const has = prev.some((p) => p.id === updated.id);
          if (!has) return [updated, ...prev];
          return prev.map((p) => (p.id === updated.id ? updated : p));
        });
        if (activePlaylistIdRef.current === updated.id) {
          setActivePlaylist(updated);
        }
      }
      await refreshLocal("");
      Alert.alert("Added", "Saved to playlist");
    },
    [pickTrack, refreshLocal]
  );

  const importMusicPlaylist = useCallback(
    async (sp) => {
      if (loadingRef.current) return;
      try {
        setBusy(true);
        const remoteTracks = await fetchMusicPlaylistTracks(sp.id);
        const pl = await createPlaylist(sp.name || "Imported");
        for (const t of remoteTracks) {
          await addTrackToPlaylist(pl.id, t);
        }
        await refreshLocal("");
        setMode("playlists");
        setActivePlaylistId(pl.id);
        Alert.alert("Imported", `${remoteTracks.length} tracks saved locally`);
      } catch (err) {
        Alert.alert("Import failed", err?.message || "Couldn’t import playlist");
      } finally {
        setBusy(false);
      }
    },
    [refreshLocal, setBusy]
  );

  const header = useMemo(
    () => (
      <View style={styles.top}>
        <Text style={styles.heading}>Songs</Text>
        <Text style={styles.sub}>Free full tracks · local playlists</Text>

        <View style={styles.modeRow}>
          {MODES.map((m) => (
            <Pressable
              key={m.id}
              disabled={loading}
              onPress={() => {
                if (loading) return;
                setMode(m.id);
                activePlaylistIdRef.current = null;
                setActivePlaylistId(null);
                setError("");
                setShowSuggestions(false);
              }}
              style={[
                styles.modeChip,
                mode === m.id && styles.modeChipOn,
                loading && styles.btnDisabled,
              ]}
            >
              <Text
                style={[styles.modeText, mode === m.id && styles.modeTextOn]}
              >
                {m.label}
              </Text>
            </Pressable>
          ))}
          <Pressable
            style={[styles.createBtn, loading && styles.btnDisabled]}
            disabled={loading}
            onPress={() => !loading && setShowCreate(true)}
          >
            <Ionicons name="add" size={14} color={colors.accentInk} />
            <Text style={styles.createText}>Playlist</Text>
          </Pressable>
        </View>

        <View style={[styles.searchBar, loading && styles.searchBarBusy]}>
          <Ionicons name="search" size={15} color={colors.muted} />
          <TextInput
            style={styles.input}
            placeholder={
              mode === "playlists"
                ? "Search your playlists…"
                : "Search songs or artists…"
            }
            placeholderTextColor={colors.muted}
            value={query}
            editable={!loading}
            onChangeText={onChangeQuery}
            onSubmitEditing={() => {
              if (loading) return;
              skipSuggest.current = true;
              setShowSuggestions(false);
              runSearch();
            }}
            onFocus={() => {
              if (
                !loading &&
                mode === "search" &&
                suggestions.length &&
                !skipSuggest.current
              ) {
                setShowSuggestions(true);
              }
            }}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
          />
          {query && !loading ? (
            <Pressable
              onPress={() => {
                skipSuggest.current = false;
                setQuery("");
                setSuggestions([]);
                setShowSuggestions(false);
              }}
              hitSlop={8}
            >
              <Ionicons name="close-circle" size={15} color={colors.muted} />
            </Pressable>
          ) : null}
          <Pressable
            disabled={loading || !query.trim()}
            onPress={() => {
              if (loading) return;
              skipSuggest.current = true;
              setShowSuggestions(false);
              runSearch();
            }}
            style={[
              styles.goBtn,
              (loading || !query.trim()) && styles.goBtnDisabled,
            ]}
          >
            {loading ? (
              <ActivityIndicator size="small" color={colors.accentLight} />
            ) : (
              <Text style={styles.goText}>Go</Text>
            )}
          </Pressable>
        </View>

        {mode === "search" &&
        !loading &&
        showSuggestions &&
        (suggestions.length > 0 || suggestLoading) ? (
          <View style={styles.suggestBox}>
            <Text style={styles.suggestLabel}>Suggestions</Text>
            {suggestLoading && !suggestions.length ? (
              <ActivityIndicator
                color={colors.secondary}
                style={{ marginVertical: 8 }}
              />
            ) : (
              suggestions.map((s) => (
                <Pressable
                  key={s.id || `${s.type}-${s.label}`}
                  style={styles.suggestRow}
                  onPress={() => pickSuggestion(s)}
                >
                  <Ionicons
                    name={
                      s.type === "artist"
                        ? "person-outline"
                        : "musical-notes-outline"
                    }
                    size={14}
                    color={colors.muted}
                  />
                  <View style={styles.suggestCopy}>
                    <Text style={styles.suggestText} numberOfLines={1}>
                      {s.label}
                    </Text>
                    {s.subtitle ? (
                      <Text style={styles.suggestSub} numberOfLines={1}>
                        {s.type === "artist" ? "Artist" : s.subtitle}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={styles.suggestType}>
                    {s.type === "artist" ? "Artist" : "Song"}
                  </Text>
                </Pressable>
              ))
            )}
          </View>
        ) : null}
      </View>
    ),
    [
      mode,
      query,
      runSearch,
      onChangeQuery,
      pickSuggestion,
      suggestions,
      showSuggestions,
      suggestLoading,
      loading,
    ]
  );

  const renderSearch = () => (
    <FlatList
      data={loading ? [] : tracks}
      keyExtractor={(item) => item.id}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <>
          {header}
          {loading ? <LoadingChunks count={7} /> : null}
          {!loading && error ? <Text style={styles.error}>{error}</Text> : null}
          {!loading && spotifyPlaylists.length ? (
            <View style={styles.block}>
              <Text style={styles.blockTitle}>Playlists</Text>
              {spotifyPlaylists.map((p) => (
                <Pressable
                  key={p.id}
                  style={[styles.plRow, loading && styles.rowDisabled]}
                  disabled={loading}
                  onPress={() => importMusicPlaylist(p)}
                >
                  {p.image ? (
                    <Image source={{ uri: p.image }} style={styles.plArt} />
                  ) : (
                    <View style={[styles.plArt, styles.thumbEmpty]}>
                      <Ionicons name="list" size={16} color={colors.muted} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.trackName} numberOfLines={1}>
                      {p.name}
                    </Text>
                    <Text style={styles.trackMeta} numberOfLines={1}>
                      {p.owner}
                      {p.tracks_total ? ` · ${p.tracks_total} tracks` : ""}
                    </Text>
                  </View>
                  <Ionicons
                    name="download-outline"
                    size={15}
                    color={colors.accentLight}
                  />
                </Pressable>
              ))}
            </View>
          ) : null}
          {!loading && tracks.length ? (
            <Text style={[styles.blockTitle, { marginHorizontal: spacing.md }]}>
              Songs
            </Text>
          ) : null}
        </>
      }
      renderItem={({ item }) => (
        <TrackRow
          item={item}
          onPlay={(t) => onPlay(t, tracks)}
          onAdd={setPickTrack}
          onDownload={onDownloadPress}
          download={downloadMap.get(String(item.id))}
          playingId={player.track?.id}
          isPlaying={player.playing}
          disabled={loading}
        />
      )}
      ListEmptyComponent={
        !loading ? (
          <Text style={styles.empty}>
            Search songs or artists — suggestions appear as you type
          </Text>
        ) : null
      }
      contentContainerStyle={styles.listPad}
    />
  );

  const renderPlaylists = () => {
    if (activePlaylist) {
      const list = activePlaylist.tracks || [];
      return (
        <FlatList
          data={list}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <>
              {header}
              <View style={styles.plHead}>
                <Pressable
                  onPress={() => {
                    activePlaylistIdRef.current = null;
                    setActivePlaylistId(null);
                    setActivePlaylist(null);
                  }}
                  hitSlop={6}
                  style={styles.backRow}
                >
                  <Ionicons
                    name="chevron-back"
                    size={16}
                    color={colors.accentLight}
                  />
                  <Text style={styles.backLink}>Playlists</Text>
                </Pressable>
                <View style={styles.plTitleRow}>
                  <View
                    style={[
                      styles.plArtLarge,
                      activePlaylist.system === "liked" && styles.likedArt,
                    ]}
                  >
                    <Ionicons
                      name={
                        activePlaylist.system === "liked" ? "heart" : "list"
                      }
                      size={20}
                      color={
                        activePlaylist.system === "liked"
                          ? colors.danger
                          : colors.secondary
                      }
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.plTitle} numberOfLines={1}>
                      {activePlaylist.name}
                    </Text>
                    <Text style={styles.trackMeta}>
                      {list.length} song{list.length === 1 ? "" : "s"}
                    </Text>
                  </View>
                </View>
                <View style={styles.plActions}>
                  {list.length ? (
                    <Pressable
                      style={styles.playAll}
                      onPress={() => onPlay(list[0], list)}
                    >
                      <Ionicons name="play" size={13} color={colors.accentInk} />
                      <Text style={styles.playAllText}>Play all</Text>
                    </Pressable>
                  ) : null}
                  {activePlaylist.system !== "liked" ? (
                    <Pressable
                      onPress={() => {
                        Alert.alert("Delete playlist?", activePlaylist.name, [
                          { text: "Cancel", style: "cancel" },
                          {
                            text: "Delete",
                            style: "destructive",
                            onPress: async () => {
                              await deletePlaylist(activePlaylist.id);
                              activePlaylistIdRef.current = null;
                              setActivePlaylistId(null);
                              setActivePlaylist(null);
                              refreshLocal("");
                            },
                          },
                        ]);
                      }}
                    >
                      <Text style={styles.deleteLink}>Delete</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            </>
          }
          renderItem={({ item }) => (
            <TrackRow
              item={item}
              onPlay={(t) => onPlay(t, list)}
              onDownload={onDownloadPress}
              download={downloadMap.get(String(item.id))}
              onRemove={async (t) => {
                const updated = await removeTrackFromPlaylist(
                  activePlaylist.id,
                  t.id
                );
                if (updated) setActivePlaylist(updated);
                await refreshLocal("");
              }}
              playingId={player.track?.id}
              isPlaying={player.playing}
            />
          )}
          ListEmptyComponent={
            <Text style={styles.empty}>No songs yet — add from Search</Text>
          }
          contentContainerStyle={styles.listPad}
        />
      );
    }

    return (
      <FlatList
        data={loading ? [] : localPlaylists}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <>
            {header}
            {loading ? <LoadingChunks count={4} /> : null}
            {!loading && localPlaylists.length ? (
              <Text style={[styles.blockTitle, { marginHorizontal: spacing.md }]}>
                Your playlists
              </Text>
            ) : null}
          </>
        }
        renderItem={({ item }) => {
          const count = (item.tracks || []).length;
          const liked = item.system === "liked" || item.id === "pl_liked_songs";
          return (
            <Pressable style={styles.plRow} onPress={() => openPlaylist(item.id)}>
              <View style={[styles.plArt, styles.localArt, liked && styles.likedArt]}>
                <Ionicons
                  name={liked ? "heart" : "list"}
                  size={16}
                  color={liked ? colors.danger : colors.secondary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.trackName} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.trackMeta}>
                  {count} song{count === 1 ? "" : "s"}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={14} color={colors.muted} />
            </Pressable>
          );
        }}
        ListEmptyComponent={
          !loading ? (
            <Text style={styles.empty}>
              No playlists yet — tap + Playlist to create one
            </Text>
          ) : null
        }
        contentContainerStyle={styles.listPad}
      />
    );
  };

  return (
    <Screen>
      <View style={styles.flex}>
        {mode === "search" ? renderSearch() : renderPlaylists()}
        {!keyboardOpen ? (
          <MiniPlayer
            state={player}
            onPrev={() => playPrev()}
            onToggle={() => togglePlayPause()}
            onNext={() => playNext()}
            onExpand={() => openMusicPlayer()}
          />
        ) : null}
      </View>

      {/* Create playlist */}
      <Modal visible={showCreate} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>New playlist</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Playlist name"
              placeholderTextColor={colors.muted}
              value={newName}
              onChangeText={setNewName}
              autoFocus
            />
            <View style={styles.modalRow}>
              <Pressable onPress={() => setShowCreate(false)}>
                <Text style={styles.cancel}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.saveBtn} onPress={onCreate}>
                <Text style={styles.saveText}>Create</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add to playlist picker */}
      <Modal visible={!!pickTrack} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={[styles.modalCard, { maxHeight: "70%" }]}>
            <Text style={styles.modalTitle}>Add to playlist</Text>
            <Text style={styles.trackMeta} numberOfLines={1}>
              {pickTrack?.name}
            </Text>
            <FlatList
              data={localPlaylists}
              keyExtractor={(item) => item.id}
              style={{ marginTop: 12 }}
              ListEmptyComponent={
                <Text style={styles.empty}>Create a playlist first</Text>
              }
              renderItem={({ item }) => (
                <Pressable
                  style={styles.plRow}
                  onPress={() => onAddToPlaylist(item.id)}
                >
                  <Text style={styles.trackName}>{item.name}</Text>
                </Pressable>
              )}
            />
            <Pressable onPress={() => setPickTrack(null)} style={{ marginTop: 8 }}>
              <Text style={styles.cancel}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  top: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    gap: 8,
  },
  heading: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  sub: {
    color: colors.muted,
    fontSize: 11,
    marginTop: -2,
  },
  modeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
    marginTop: 2,
  },
  modeChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
  },
  modeChipOn: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  modeText: { color: colors.text, fontWeight: "600", fontSize: 12 },
  modeTextOn: { color: colors.accentInk },
  createBtn: {
    marginLeft: "auto",
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: colors.accent,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.pill,
  },
  createText: { color: colors.accentInk, fontWeight: "800", fontSize: 11 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.panel,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minHeight: 40,
  },
  searchBarBusy: {
    opacity: 0.85,
    borderColor: colors.accentBorder,
  },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    paddingVertical: 2,
  },
  goBtn: {
    backgroundColor: colors.accentMuted,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.sm,
    minWidth: 44,
    minHeight: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  goBtnDisabled: { opacity: 0.45 },
  goText: { color: colors.accentLight, fontWeight: "800", fontSize: 12 },
  btnDisabled: { opacity: 0.45 },
  rowDisabled: { opacity: 0.5 },
  suggestBox: {
    marginTop: 4,
    backgroundColor: colors.panel,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: "hidden",
  },
  suggestLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 2,
  },
  suggestRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  suggestCopy: { flex: 1, gap: 1 },
  suggestText: { color: colors.text, fontSize: 13, fontWeight: "600" },
  suggestSub: { color: colors.muted, fontSize: 11 },
  suggestType: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  skelWrap: {
    paddingHorizontal: spacing.md,
    paddingTop: 4,
    gap: 2,
  },
  skelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
  },
  skelThumb: {
    width: 40,
    height: 40,
    borderRadius: 7,
    backgroundColor: colors.panelSoft,
  },
  skelCopy: { flex: 1, gap: 7 },
  skelLine: {
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.panelSoft,
  },
  skelLineSm: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.panel,
  },
  listPad: { paddingBottom: 100 },
  block: { marginTop: spacing.sm, marginBottom: spacing.sm },
  blockTitle: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
    marginHorizontal: spacing.md,
  },
  trackRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  thumb: {
    width: 40,
    height: 40,
    borderRadius: 7,
    backgroundColor: colors.panel,
  },
  thumbEmpty: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.line,
  },
  trackCopy: { flex: 1, gap: 1 },
  trackName: { color: colors.text, fontWeight: "700", fontSize: 13 },
  trackActive: { color: colors.secondary },
  trackMeta: { color: colors.muted, fontSize: 11 },
  iconBtn: { padding: 3 },
  plRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  plArt: {
    width: 44,
    height: 44,
    borderRadius: 7,
    backgroundColor: colors.panel,
  },
  localArt: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentMuted,
  },
  likedArt: {
    backgroundColor: "rgba(248, 113, 113, 0.15)",
  },
  plArtLarge: {
    width: 48,
    height: 48,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentMuted,
  },
  plTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 4,
  },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    marginBottom: 6,
  },
  plHead: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    gap: 2,
  },
  backLink: {
    color: colors.accentLight,
    fontWeight: "700",
    fontSize: 12,
  },
  plTitle: { color: colors.text, fontSize: 18, fontWeight: "800" },
  plActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginTop: 8,
  },
  playAll: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.accent,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.pill,
  },
  playAllText: { color: colors.accentInk, fontWeight: "800", fontSize: 12 },
  deleteLink: { color: colors.danger, fontWeight: "700", fontSize: 12 },
  empty: {
    color: colors.muted,
    textAlign: "center",
    marginTop: 28,
    paddingHorizontal: spacing.lg,
    fontSize: 13,
  },
  error: {
    color: colors.danger,
    textAlign: "center",
    margin: spacing.md,
    fontSize: 13,
  },
  player: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: colors.panel,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  playerArt: { width: 38, height: 38, borderRadius: 6 },
  playerCopy: { flex: 1, gap: 1 },
  playerTitle: { color: colors.text, fontWeight: "700", fontSize: 13 },
  playerSub: { color: colors.muted, fontSize: 11 },
  ctrlBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  ctrlPlay: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  modalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    padding: spacing.lg,
  },
  modalCard: {
    backgroundColor: colors.panel,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.line,
  },
  modalTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "800",
    marginBottom: 10,
  },
  modalInput: {
    backgroundColor: colors.panelSoft,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  modalRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 16,
    marginTop: 14,
  },
  cancel: { color: colors.muted, fontWeight: "700", fontSize: 13 },
  saveBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.pill,
  },
  saveText: { color: colors.accentInk, fontWeight: "800", fontSize: 13 },
});
