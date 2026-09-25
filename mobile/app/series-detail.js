import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import DownloadSheet from "../components/DownloadSheet";
import { getDetail } from "../lib/api";
import { colors, radii, spacing } from "../lib/theme";
import {
  fetchSeasonCatalog,
  formatBytes,
  hydrateDownloads,
  removeDownload,
  subscribeDownloads,
} from "../lib/downloads";
import {
  progressPercent,
  subscribeWatchProgress,
  watchProgressKey,
} from "../lib/watchProgress";
import { toUserMessage } from "../lib/userFacingError";

function isSeriesItem(d) {
  return d.kind === "series" || Number(d.se) > 0 || Number(d.ep) > 0;
}

function formatDuration(sec) {
  if (!sec || Number.isNaN(Number(sec))) return "";
  const s = Math.round(Number(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function SeriesDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const packKey = params.packKey ? decodeURIComponent(String(params.packKey)) : "";
  const [subjectId, detailPath] = packKey.split("|");

  const scrollRef = useRef(null);
  const [allDownloads, setAllDownloads] = useState([]);
  const [watchEntries, setWatchEntries] = useState([]);
  const [richMeta, setRichMeta] = useState(null);
  const [selectedSeason, setSelectedSeason] = useState(null);
  const [seasonPickerVisible, setSeasonPickerVisible] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Server catalog for downloading more seasons/episodes
  const [catalog, setCatalog] = useState(null);
  const [catalogBusy, setCatalogBusy] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [dlSheet, setDlSheet] = useState(null);

  useEffect(() => subscribeWatchProgress(setWatchEntries), []);
  useEffect(() => {
    hydrateDownloads().catch(() => { });
    return subscribeDownloads(setAllDownloads);
  }, []);

  // Fetch online details and server catalog for richer metadata & quick downloading
  useEffect(() => {
    if (!detailPath) return;
    let cancelled = false;
    getDetail(detailPath)
      .then((data) => {
        if (!cancelled && data) {
          setRichMeta(data.meta || data.detail || null);
        }
      })
      .catch(() => { });
    fetchSeasonCatalog(detailPath)
      .then((data) => {
        if (!cancelled && data?.seasons?.length) {
          setCatalog({ seasons: data.seasons });
        }
      })
      .catch(() => { });
    return () => {
      cancelled = true;
    };
  }, [detailPath]);

  const episodes = useMemo(() => {
    return allDownloads
      .filter(
        (d) =>
          !d.inVault &&
          isSeriesItem(d) &&
          d.subjectId === subjectId &&
          d.detailPath === detailPath
      )
      .sort((a, b) => {
        const se = Number(a.se) - Number(b.se);
        if (se !== 0) return se;
        return Number(a.ep) - Number(b.ep);
      });
  }, [allDownloads, subjectId, detailPath]);

  const pack = useMemo(() => {
    if (!episodes.length) return null;
    const first = episodes[0];
    return {
      title: first.title,
      poster: first.poster,
      subjectId,
      detailPath,
      episodes,
    };
  }, [episodes, subjectId, detailPath]);

  const watchMap = useMemo(
    () => new Map(watchEntries.map((e) => [e.key, e])),
    [watchEntries]
  );

  // Group downloaded episodes by season
  const seasons = useMemo(() => {
    const map = new Map();
    for (const ep of episodes) {
      const s = Number(ep.se) || 1;
      if (!map.has(s)) map.set(s, []);
      map.get(s).push(ep);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a - b)
      .map(([season, eps]) => ({
        season,
        episodes: eps.sort((a, b) => (Number(a.ep) || 0) - (Number(b.ep) || 0)),
      }));
  }, [episodes]);

  // Set active season
  const activeSeasonNum = selectedSeason ?? seasons[0]?.season ?? 1;
  const currentSeason = seasons.find((s) => s.season === activeSeasonNum) || seasons[0];
  const visibleEpisodes = currentSeason?.episodes || episodes;

  const totalBytes = episodes.reduce(
    (n, e) => n + (e.bytesWritten || e.sizeHint || 0),
    0
  );

  const openPlay = (epItem) => {
    if (!epItem) return;
    router.push({
      pathname: "/play",
      params: {
        subjectId: epItem.subjectId || subjectId,
        detail_path: epItem.detailPath || detailPath,
        se: String(epItem.se || "0"),
        ep: String(epItem.ep || "0"),
        title: `${epItem.title || pack?.title || "Series"} · S${epItem.se}E${epItem.ep}`,
        poster: epItem.poster || pack?.poster || "",
        kind: "series",
        autoplay: "1",
        downloadId: encodeURIComponent(epItem.id),
      },
    });
  };

  const onDeleteEpisode = (item) => {
    Alert.alert(
      "Remove episode",
      `Delete S${item.se}E${item.ep}?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => removeDownload(item.id) },
      ]
    );
  };

  const onDeleteAll = () => {
    if (!episodes.length) return;
    Alert.alert(
      "Delete all",
      `Remove all ${episodes.length} downloaded episodes of "${pack?.title}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete all",
          style: "destructive",
          onPress: () => episodes.forEach((e) => removeDownload(e.id)),
        },
      ]
    );
  };

  // Download all for active season
  const onDownloadSeason = () => {
    const sNum = Number(currentSeason?.season ?? activeSeasonNum ?? 1);
    const first = currentSeason?.episodes?.[0];
    setDlSheet({
      mode: "season",
      subjectId,
      detailPath,
      title: pack?.title || richMeta?.title || "Series",
      poster: pack?.poster || richMeta?.poster || null,
      se: String(first?.se ?? sNum),
      ep: String(first?.ep ?? 1),
      season: sNum,
      kind: "series",
    });
  };

  // Download all for a specific season from server catalog
  const onDownloadSeasonDirect = (seasonNum) => {
    const sNum = Number(seasonNum) || 1;
    const row = (catalog?.seasons || []).find((s) => Number(s.season) === sNum);
    const first = row?.episodes?.[0];
    setDlSheet({
      mode: "season",
      subjectId,
      detailPath,
      title: pack?.title || richMeta?.title || "Series",
      poster: pack?.poster || richMeta?.poster || null,
      se: String(first?.se ?? sNum),
      ep: String(first?.ep ?? 1),
      season: sNum,
      kind: "series",
    });
  };

  // Download a single episode from server catalog
  const onDownloadEpisode = (se, ep) => {
    setDlSheet({
      mode: "single",
      subjectId,
      detailPath,
      title: pack?.title || richMeta?.title || "Series",
      poster: pack?.poster || richMeta?.poster || null,
      se: String(se),
      ep: String(ep),
      season: null,
      kind: "series",
    });
  };

  // Check if an episode is already downloaded
  const isEpDownloaded = (se, ep) => {
    return episodes.some(
      (d) =>
        Number(d.se) === Number(se) &&
        Number(d.ep) === Number(ep) &&
        (d.status === "completed" || d.status === "downloading" || d.status === "queued" || d.pending)
    );
  };

  // Fetch more seasons from server and toggle catalog display
  const onFetchMore = useCallback(async () => {
    if (catalogBusy || !detailPath) return;
    if (catalog?.seasons?.length && catalogOpen) {
      setCatalogOpen(false);
      return;
    }
    if (catalog?.seasons?.length && !catalogOpen) {
      setCatalogOpen(true);
      setTimeout(() => {
        scrollRef.current?.scrollTo({ y: 320, animated: true });
      }, 100);
      return;
    }
    setCatalogBusy(true);
    try {
      const data = await fetchSeasonCatalog(detailPath);
      setCatalog({ seasons: data.seasons || [] });
      setCatalogOpen(true);
      setTimeout(() => {
        scrollRef.current?.scrollTo({ y: 320, animated: true });
      }, 150);
      if (!(data.seasons || []).length) {
        Alert.alert("No more episodes", "Server returned no other seasons for this title.");
      }
    } catch (err) {
      const msg = toUserMessage(err, "Couldn't load episodes. Check your connection.");
      setCatalog((prev) => ({ seasons: prev?.seasons || [], error: msg }));
      Alert.alert("Couldn't load", msg);
    } finally {
      setCatalogBusy(false);
    }
  }, [catalogBusy, catalog, catalogOpen, detailPath]);

  const onRefresh = async () => {
    setRefreshing(true);
    await hydrateDownloads();
    setRefreshing(false);
  };

  // Auto-back when all episodes deleted
  useEffect(() => {
    if (allDownloads.length > 0 && episodes.length === 0) router.back();
  }, [episodes.length, allDownloads.length]);

  if (!pack && !episodes.length) return null;

  const title = richMeta?.title || pack?.title || "Series";
  const poster = richMeta?.poster || pack?.poster || "";
  const description = richMeta?.description || richMeta?.overview || "";
  const rating = richMeta?.imdb_rating || richMeta?.rating || null;
  const releaseYear = richMeta?.release_date ? String(richMeta.release_date).slice(0, 4) : "";
  const genres = richMeta?.genres || (richMeta?.genre ? [richMeta.genre] : []);

  const metaBits = [
    releaseYear,
    seasons.length ? `${seasons.length} Season${seasons.length > 1 ? "s" : ""}` : "",
    `${episodes.length} Episodes`,
    totalBytes ? formatBytes(totalBytes) : "",
  ].filter(Boolean);

  const firstPlayEp = visibleEpisodes[0] || episodes[0];

  return (
    <View style={styles.page}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 10) }]}>
        <Pressable
          style={styles.backBtn}
          onPress={() => {
            if (typeof router.canGoBack === "function" && router.canGoBack()) {
              router.back();
            } else {
              router.replace("/(tabs)/downloads");
            }
          }}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={24} color={colors.accentLight || colors.accent} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {title}
        </Text>
        <Pressable
          style={styles.headerDeleteBtn}
          onPress={onDeleteAll}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Delete all downloaded episodes"
        >
          <Ionicons name="trash" size={17} color={colors.danger} />
        </Pressable>
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.body}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accentLight}
          />
        }
      >
        <View style={styles.hero}>
          {poster ? (
            <Image
              source={{ uri: poster }}
              style={styles.poster}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
          ) : (
            <View style={[styles.poster, styles.posterEmpty]}>
              <Ionicons name="tv-outline" size={32} color={colors.muted} />
            </View>
          )}

          <View style={styles.copy}>
            <Text style={styles.title}>{title}</Text>
            {metaBits.length > 0 && (
              <Text style={styles.metaLine}>{metaBits.join(" · ")}</Text>
            )}

            {rating ? (
              <View style={styles.ratingRow}>
                <Ionicons name="star" size={14} color={colors.gold} />
                <Text style={styles.ratingText}>{rating}</Text>
                <Text style={styles.ratingLabel}>IMDb</Text>
              </View>
            ) : null}

            <Pressable
              style={styles.playBtn}
              onPress={() => openPlay(firstPlayEp)}
              accessibilityRole="button"
              accessibilityLabel={firstPlayEp ? `Play S${firstPlayEp.se}E${firstPlayEp.ep}` : "Play"}
            >
              <Ionicons name="play" size={16} color={colors.accentInk} />
              <Text style={styles.playText}>
                {firstPlayEp
                  ? `Play S${firstPlayEp.se}E${firstPlayEp.ep}`
                  : "Play"}
              </Text>
            </Pressable>

            <Pressable
              style={styles.dlAllBtn}
              onPress={onDownloadSeason}
              accessibilityRole="button"
              accessibilityLabel="Download All"
            >
              <Ionicons name="download-outline" size={16} color={colors.accentLight} />
              <Text style={styles.dlAllText}>Download All</Text>
            </Pressable>
          </View>
        </View>

        {genres.length > 0 && (
          <View style={styles.chips}>
            {genres.map((g) => (
              <View key={g} style={styles.genreChip}>
                <Text style={styles.genreText}>{g}</Text>
              </View>
            ))}
          </View>
        )}

        {description ? (
          <Pressable onPress={() => setDescExpanded((v) => !v)} style={{ marginTop: 2 }}>
            <Text style={styles.desc} numberOfLines={descExpanded ? undefined : 3}>
              {description}
            </Text>
            <View style={styles.descToggle}>
              <Text style={styles.descToggleText}>
                {descExpanded ? "Show less" : "Show more"}
              </Text>
              <Ionicons
                name={descExpanded ? "chevron-up" : "chevron-down"}
                size={14}
                color={colors.accentLight}
              />
            </View>
          </Pressable>
        ) : null}

        <View style={styles.tabBar}>
          <View style={styles.tabItemActive}>
            <Text style={styles.tabLabelActive}>Episodes</Text>
          </View>
        </View>

        <View style={styles.epsSection}>
          <View style={styles.seasonBar}>
            {seasons.length > 1 ? (
              <Pressable
                style={styles.seasonPickerBtn}
                onPress={() => setSeasonPickerVisible(true)}
                accessibilityRole="button"
                accessibilityLabel="Select Season"
              >
                <Text style={styles.seasonPickerText}>
                  {`Season ${currentSeason?.season ?? 1}`}
                </Text>
                <Ionicons name="caret-down" size={13} color="#ffffff" />
              </Pressable>
            ) : (
              <Text style={styles.seasonSingleText}>
                {`Season ${currentSeason?.season ?? 1}`}
              </Text>
            )}

            <Pressable
              style={[styles.moreBtn, catalogOpen && styles.moreBtnActive]}
              onPress={onFetchMore}
              disabled={catalogBusy}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Download More"
            >
              {catalogBusy ? (
                <ActivityIndicator size="small" color={colors.accentLight} />
              ) : (
                <>
                  <Ionicons
                    name={catalogOpen ? "chevron-up" : "cloud-download-outline"}
                    size={14}
                    color={colors.accentLight}
                  />
                  <Text style={styles.moreBtnText}>
                    {catalogOpen ? "Hide More" : "More"}
                  </Text>
                </>
              )}
            </Pressable>
          </View>

          {catalogOpen && catalog?.seasons?.length ? (
            <View style={styles.catalogCard}>
              <View style={styles.catalogHead}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={styles.catalogTitle}>Server Catalog</Text>
                  <Text style={styles.catalogHint}>
                    Tap "Download All" to save a season, or tap any episode chip to download.
                  </Text>
                </View>
                <Pressable onPress={() => setCatalogOpen(false)} hitSlop={10}>
                  <Text style={styles.hideMoreText}>Hide</Text>
                </Pressable>
              </View>
              {catalog.seasons.map((s) => {
                const missingCount = (s.episodes || []).filter(
                  (e) => !isEpDownloaded(s.season, e.ep)
                ).length;
                return (
                  <View key={s.season} style={styles.seasonBlock}>
                    <View style={styles.seasonRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.seasonLabel}>{`Season ${s.season}`}</Text>
                        <Text style={styles.seasonSub}>
                          {`${s.episodes?.length || s.episode_count || 0} episodes${missingCount > 0 ? ` · ${missingCount} missing` : " · all downloaded"
                            }`}
                        </Text>
                      </View>
                      <Pressable
                        style={[
                          styles.dlSeasonBtn,
                          missingCount === 0 && styles.dlSeasonBtnDisabled,
                        ]}
                        disabled={missingCount === 0}
                        onPress={() => onDownloadSeasonDirect(s.season)}
                      >
                        <Ionicons
                          name={missingCount === 0 ? "checkmark-circle" : "download-outline"}
                          size={14}
                          color={missingCount === 0 ? colors.muted : colors.accentInk}
                        />
                        <Text
                          style={[
                            styles.dlSeasonText,
                            missingCount === 0 && styles.dlSeasonTextDisabled,
                          ]}
                        >
                          {missingCount === 0 ? "Downloaded" : "Download All"}
                        </Text>
                      </Pressable>
                    </View>
                    <View style={styles.epChipRow}>
                      {(s.episodes || []).map((e) => {
                        const isDownloaded = isEpDownloaded(s.season, e.ep);
                        return (
                          <Pressable
                            key={e.ep}
                            style={[styles.epChip, isDownloaded && styles.epChipDone]}
                            disabled={isDownloaded}
                            onPress={() => onDownloadEpisode(s.season, e.ep)}
                          >
                            <Ionicons
                              name={isDownloaded ? "checkmark" : "arrow-down"}
                              size={11}
                              color={isDownloaded ? colors.muted : colors.accentLight}
                              style={{ marginRight: 3 }}
                            />
                            <Text
                              style={[
                                styles.epChipText,
                                isDownloaded && styles.epChipTextDone,
                              ]}
                            >
                              {`Ep ${e.ep}`}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                );
              })}
            </View>
          ) : null}

          <View style={styles.episodeList}>
            {visibleEpisodes.map((epItem, idx) => {
              const watchPct = progressPercent(
                watchMap.get(
                  watchProgressKey({
                    subjectId: epItem.subjectId,
                    se: epItem.se,
                    ep: epItem.ep,
                  })
                )
              );
              const epNum = epItem.ep || idx + 1;
              const rawName = String(epItem.name || epItem.title || "").trim();
              const cleanName = rawName
                .replace(/^episode\s*\d+\s*[-:]*\s*/i, "")
                .replace(/·\s*s\d+e\d+.*$/i, "")
                .trim();
              const epTitle = cleanName
                ? `${epNum}. ${cleanName}`
                : `${epNum}. Episode ${epNum}`;
              const epDuration = formatDuration(epItem.duration) || "48m";
              const epBytes = epItem.bytesWritten || epItem.sizeHint || 0;
              const epMetaText = [
                epDuration,
                epBytes ? formatBytes(epBytes) : null,
                watchPct > 0 ? `${watchPct}% watched` : null,
              ]
                .filter(Boolean)
                .join(" · ");

              const epSynopsis =
                epItem.description ||
                epItem.overview ||
                description ||
                `Episode ${epNum} of ${title}.`;
              const thumbUri = epItem.thumbnail || epItem.image || epItem.poster || poster;

              return (
                <View key={epItem.id || `${epItem.se}-${epItem.ep}-${idx}`} style={styles.episodeRow}>
                  <View style={styles.episodeTop}>
                    <Pressable
                      style={styles.episodeThumbWrap}
                      onPress={() => openPlay(epItem)}
                    >
                      {thumbUri ? (
                        <Image
                          source={{ uri: thumbUri }}
                          style={styles.episodeThumb}
                          contentFit="cover"
                          cachePolicy="memory-disk"
                        />
                      ) : (
                        <View style={[styles.episodeThumb, styles.posterEmpty]} />
                      )}
                      <View style={styles.thumbPlayCircle}>
                        <Ionicons
                          name="play"
                          size={15}
                          color="#ffffff"
                          style={{ marginLeft: 2 }}
                        />
                      </View>
                      {watchPct > 0 ? (
                        <View style={styles.thumbWatchTrack}>
                          <View
                            style={[styles.thumbWatchFill, { width: `${watchPct}%` }]}
                          />
                        </View>
                      ) : null}
                    </Pressable>

                    <Pressable
                      style={styles.episodeMeta}
                      onPress={() => openPlay(epItem)}
                    >
                      <Text style={styles.episodeTitle} numberOfLines={2}>
                        {epTitle}
                      </Text>
                      <Text style={styles.episodeDurationText}>
                        {epMetaText}
                      </Text>
                    </Pressable>

                    <Pressable
                      style={styles.episodeDeleteBtn}
                      onPress={() => onDeleteEpisode(epItem)}
                      hitSlop={10}
                      accessibilityLabel={`Delete ${epTitle}`}
                    >
                      <Ionicons name="remove-circle-outline" size={20} color="rgba(248, 113, 113, 0.9)" />
                    </Pressable>
                  </View>

                  {epSynopsis ? (
                    <Text style={styles.episodeSynopsis} numberOfLines={3}>
                      {epSynopsis}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        </View>
      </ScrollView>

      <Modal
        visible={seasonPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSeasonPickerVisible(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setSeasonPickerVisible(false)}
        >
          <View style={styles.pickerSheet}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>Select Season</Text>
              <Pressable
                onPress={() => setSeasonPickerVisible(false)}
                hitSlop={10}
              >
                <Ionicons name="close" size={22} color="#ffffff" />
              </Pressable>
            </View>
            <ScrollView style={{ maxHeight: 360 }}>
              {seasons.map((s) => {
                const isSelected = s.season === activeSeasonNum;
                return (
                  <Pressable
                    key={s.season}
                    style={[styles.pickerItem, isSelected && styles.pickerItemActive]}
                    onPress={() => {
                      setSelectedSeason(s.season);
                      setSeasonPickerVisible(false);
                    }}
                  >
                    <Text
                      style={[styles.pickerItemText, isSelected && styles.pickerItemTextActive]}
                    >
                      {`Season ${s.season}`}
                    </Text>
                    <Text style={styles.pickerItemSub}>
                      {`${s.episodes.length} downloaded episode${s.episodes.length > 1 ? "s" : ""}`}
                    </Text>
                    {isSelected && (
                      <Ionicons name="checkmark" size={18} color={colors.accentLight} />
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      <DownloadSheet
        visible={!!dlSheet}
        onClose={() => setDlSheet(null)}
        onStarted={() => {
          setDlSheet(null);
          hydrateDownloads().catch(() => { });
        }}
        subjectId={subjectId ? String(subjectId) : ""}
        detailPath={detailPath}
        title={pack?.title || richMeta?.title || "Series"}
        poster={pack?.poster || richMeta?.poster || null}
        se={dlSheet?.se || "0"}
        ep={dlSheet?.ep || "0"}
        kind="series"
        mode={dlSheet?.mode || "single"}
        season={dlSheet?.season}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingBottom: 10,
    backgroundColor: colors.bg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
    marginHorizontal: 8,
  },
  headerDeleteBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    padding: spacing.md,
    paddingBottom: spacing.xl + 20,
    gap: spacing.md,
  },
  hero: {
    flexDirection: "row",
    gap: spacing.md,
  },
  poster: {
    width: 120,
    height: 180,
    borderRadius: 12,
    backgroundColor: colors.panel,
  },
  posterEmpty: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.line,
  },
  copy: {
    flex: 1,
    gap: 8,
    justifyContent: "center",
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "800",
    lineHeight: 26,
  },
  metaLine: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  ratingText: {
    color: colors.text,
    fontWeight: "800",
    fontSize: 14,
  },
  ratingLabel: {
    color: colors.muted,
    fontSize: 12,
  },
  playBtn: {
    marginTop: 4,
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  playText: {
    color: colors.accentInk,
    fontWeight: "800",
  },
  dlAllBtn: {
    backgroundColor: colors.accentMuted,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  dlAllText: {
    color: colors.accentLight,
    fontWeight: "700",
    fontSize: 13,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  genreChip: {
    backgroundColor: colors.panelSoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
  },
  genreText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
  },
  desc: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
  },
  descToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  descToggleText: {
    color: colors.accentLight,
    fontSize: 12,
    fontWeight: "700",
  },
  tabBar: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    marginTop: 6,
    marginBottom: spacing.xs,
  },
  tabItemActive: {
    paddingVertical: 10,
    borderTopWidth: 3,
    borderTopColor: colors.accentLight,
  },
  tabLabelActive: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  epsSection: {
    gap: 8,
  },
  seasonBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
  },
  seasonPickerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#222228",
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  seasonPickerText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
  },
  seasonSingleText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  moreBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(189, 132, 219, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(189, 132, 219, 0.28)",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radii.sm,
  },
  moreBtnActive: {
    backgroundColor: "rgba(189, 132, 219, 0.24)",
    borderColor: colors.accentLight,
  },
  moreBtnText: {
    color: colors.accentLight,
    fontSize: 12,
    fontWeight: "700",
  },
  catalogCard: {
    marginBottom: spacing.md,
    backgroundColor: colors.panel,
    borderRadius: radii.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 12,
  },
  catalogHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    paddingBottom: 8,
  },
  catalogTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 2,
  },
  catalogHint: {
    fontSize: 12,
    color: colors.muted,
  },
  hideMoreText: {
    fontSize: 12,
    color: colors.accentLight,
    fontWeight: "700",
    paddingLeft: 8,
  },
  seasonBlock: {
    gap: 8,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255, 255, 255, 0.05)",
  },
  seasonRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  seasonLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
  },
  seasonSub: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 1,
  },
  dlSeasonBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.accent,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: radii.pill,
  },
  dlSeasonBtnDisabled: {
    backgroundColor: colors.panelSoft,
  },
  dlSeasonText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.accentInk,
  },
  dlSeasonTextDisabled: {
    color: colors.muted,
  },
  epChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 4,
  },
  epChip: {
    backgroundColor: colors.accentMuted,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderRadius: radii.pill,
  },
  epChipDone: {
    backgroundColor: colors.panelSoft,
    borderColor: colors.line,
    opacity: 0.6,
  },
  epChipText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.accentLight,
  },
  epChipTextDone: {
    color: colors.muted,
  },
  episodeList: {
    gap: 16,
  },
  episodeRow: {
    gap: 8,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
  },
  episodeTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  episodeThumbWrap: {
    width: 124,
    height: 70,
    borderRadius: 6,
    overflow: "hidden",
    backgroundColor: colors.panel,
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
  },
  episodeThumb: {
    width: "100%",
    height: "100%",
  },
  thumbPlayCircle: {
    position: "absolute",
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.85)",
    alignItems: "center",
    justifyContent: "center",
  },
  thumbWatchTrack: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: "rgba(255, 255, 255, 0.25)",
  },
  thumbWatchFill: {
    height: 3,
    backgroundColor: colors.accentLight,
  },
  episodeMeta: {
    flex: 1,
    justifyContent: "center",
    gap: 3,
  },
  episodeTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 18,
  },
  episodeDurationText: {
    color: "#8c8c96",
    fontSize: 12,
    fontWeight: "500",
  },
  episodeDeleteBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  episodeSynopsis: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    justifyContent: "flex-end",
  },
  pickerSheet: {
    backgroundColor: "#16161c",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: spacing.md,
    paddingTop: 16,
    paddingBottom: 32,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  pickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  pickerTitle: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
  pickerItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255, 255, 255, 0.05)",
  },
  pickerItemActive: {
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderRadius: 8,
  },
  pickerItemText: {
    color: "#8c8c96",
    fontSize: 15,
    fontWeight: "600",
  },
  pickerItemTextActive: {
    color: "#ffffff",
    fontWeight: "700",
  },
  pickerItemSub: {
    color: colors.muted,
    fontSize: 12,
    marginLeft: "auto",
    marginRight: 10,
  },
});
