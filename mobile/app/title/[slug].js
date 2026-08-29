import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import Ionicons from "@expo/vector-icons/Ionicons";
import DetailHeader from "../../components/DetailHeader";
import DownloadSheet from "../../components/DownloadSheet";
import EmptyState from "../../components/EmptyState";
import ProgressBorder from "../../components/ProgressBorder";
import PosterCard from "../../components/PosterCard";
import TitleSkeleton from "../../components/TitleSkeleton";
import { getDetail, getEpisodes } from "../../lib/api";
import {
  hydrateDownloads,
  progressOf as downloadProgressOf,
  subscribeDownloads,
} from "../../lib/downloads";
import { prefetchStreams } from "../../lib/streamCache";
import { getCachedTitle, setCachedTitle } from "../../lib/titleCache";
import { colors, radii, spacing } from "../../lib/theme";
import {
  progressPercent,
  getAllWatchProgress,
  subscribeWatchProgress,
  watchProgressKey,
} from "../../lib/watchProgress";

function formatDuration(sec) {
  const n = Number(sec);
  if (!Number.isFinite(n) || n <= 0) return null;
  const mins = Math.round(n / 60);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function castName(person) {
  const raw =
    person?.name || person?.staffName || person?.title || person?.nickname;
  return typeof raw === "string" ? raw.trim() : "";
}

function usableSeasons(episodes) {
  return (episodes?.seasons || []).filter(
    (s) => (s.episodes || []).length > 0 || Number(s.episode_count) > 0
  );
}

const EPISODE_PREVIEW_COUNT = 12;

export default function TitleScreen() {
  const { slug: raw } = useLocalSearchParams();
  const slug = decodeURIComponent(String(raw || ""));
  const router = useRouter();
  const cached = slug ? getCachedTitle(slug) : null;

  const [detail, setDetail] = useState(() => cached?.detail || null);
  const [episodes, setEpisodes] = useState(() => cached?.episodes || null);
  const [loading, setLoading] = useState(() => !cached?.detail);
  const [error, setError] = useState("");
  const [season, setSeason] = useState(
    () => usableSeasons(cached?.episodes)[0]?.season ?? null
  );
  const [dlSheet, setDlSheet] = useState(null);
  const [watchEntries, setWatchEntries] = useState([]);
  const [episodesExpanded, setEpisodesExpanded] = useState(false);
  const [relatedExpanded, setRelatedExpanded] = useState(false);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [downloadNotice, setDownloadNotice] = useState(null);
  const [downloadItems, setDownloadItems] = useState([]);

  useEffect(() => subscribeWatchProgress(setWatchEntries), []);
  useEffect(() => {
    hydrateDownloads().catch(() => {});
    return subscribeDownloads(setDownloadItems);
  }, []);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      getAllWatchProgress()
        .then((entries) => {
          if (active) setWatchEntries(entries);
        })
        .catch(() => {});
      return () => {
        active = false;
      };
    }, [])
  );

  useEffect(() => {
    let cancelled = false;
    const hit = getCachedTitle(slug);
    if (hit?.detail) {
      setDetail(hit.detail);
      setEpisodes(hit.episodes);
      setSeason(usableSeasons(hit.episodes)[0]?.season ?? null);
      setLoading(false);
      setError("");
      return () => {
        cancelled = true;
      };
    }

    (async () => {
      setLoading(true);
      setError("");
      setDetail(null);
      setEpisodes(null);
      try {
        const [d, e] = await Promise.all([
          getDetail(slug),
          getEpisodes(slug).catch(() => null),
        ]);
        if (cancelled) return;
        setCachedTitle(slug, { detail: d, episodes: e });
        setDetail(d);
        setEpisodes(e);
        setSeason(usableSeasons(e)[0]?.season ?? null);
      } catch {
        if (!cancelled) setError("This title isn’t available.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const meta = detail?.metadata || {};
  const headerTitle = meta.title || "Details";
  const seasons = useMemo(
    () =>
      (episodes?.seasons || []).filter(
        (s) => (s.episodes || []).length > 0 || Number(s.episode_count) > 0
      ),
    [episodes]
  );
  const isSeries = seasons.length > 0;
  const activeSeason = useMemo(
    () =>
      seasons.find((s) => String(s.season) === String(season)) || seasons[0],
    [seasons, season]
  );
  const episodeList = activeSeason?.episodes || [];
  const visibleEpisodes = episodesExpanded
    ? episodeList
    : episodeList.slice(0, EPISODE_PREVIEW_COUNT);
  const hasMoreEpisodes = episodeList.length > EPISODE_PREVIEW_COUNT;
  const related = Array.isArray(meta.related) ? meta.related.slice(0, 18) : [];
  const visibleRelated = relatedExpanded ? related : related.slice(0, 6);
  const subjectId = meta.id || episodes?.subject_id;
  const watchMap = useMemo(
    () => new Map(watchEntries.map((entry) => [entry.key, entry])),
    [watchEntries]
  );
  const watchEntryFor = (se = "0", ep = "0") => {
    const key = watchProgressKey({
      subjectId,
      se,
      ep,
    });
    return (
      watchMap.get(key) ||
      watchEntries.find(
        (entry) =>
          entry.detailPath === slug &&
          String(entry.se ?? "0") === String(se ?? "0") &&
          String(entry.ep ?? "0") === String(ep ?? "0")
      ) ||
      null
    );
  };
  const downloadFor = (se = "0", ep = "0") =>
    downloadItems.find(
      (item) =>
        String(item.subjectId || "") === String(subjectId || "") &&
        String(item.detailPath || "") === String(slug) &&
        String(item.se ?? "0") === String(se ?? "0") &&
        String(item.ep ?? "0") === String(ep ?? "0")
    ) || null;
  const movieWatch = watchEntryFor("0", "0");
  const movieWatchDisplay = movieWatch
    ? { ...movieWatch, duration: movieWatch.duration || meta.duration }
    : null;
  const movieWatchPct = progressPercent(movieWatchDisplay);
  const movieDownload = downloadFor("0", "0");
  const movieDownloadPct = Math.round(downloadProgressOf(movieDownload) * 100);
  const castPeople = useMemo(() => {
    const list = Array.isArray(meta.top_cast) ? meta.top_cast : [];
    return list
      .map((person, i) => {
        const name = castName(person);
        if (!name) return null;
        const avatar =
          typeof person?.avatarUrl === "string" &&
          /^https?:\/\//i.test(person.avatarUrl)
            ? person.avatarUrl
            : null;
        const role =
          typeof person?.character === "string" ? person.character : "";
        return {
          key: `cast-${i}-${String(person?.staffId || name)}`,
          name,
          avatar,
          role,
        };
      })
      .filter(Boolean)
      .slice(0, 16);
  }, [meta.top_cast]);
  const genres = String(meta.genre || "")
    .split(/[,/|]/)
    .map((g) => g.trim())
    .filter(Boolean);
  const durationLabel = formatDuration(meta.duration);
  const description = meta.description || "No description available.";
  const descriptionNeedsToggle =
    description.length > 220 || description.split(/\s+/).length > 36;
  const metaBits = [
    meta.release_date,
    durationLabel,
    meta.country,
    meta.imdb_rating ? `IMDb ${meta.imdb_rating}` : "",
    meta.badge,
  ].filter(Boolean);

  const openDownload = (se = "0", ep = "0") => {
    if (!subjectId) {
      Alert.alert("Unavailable", "Download isn’t available for this title.");
      return;
    }
    setDlSheet({
      mode: "single",
      se: String(se ?? 0),
      ep: String(ep ?? 0),
      season: null,
    });
  };

  /** Series hero: pick quality, then queue the whole active season. */
  const openSeasonDownload = () => {
    if (!subjectId) {
      Alert.alert("Unavailable", "Download isn’t available for this title.");
      return;
    }
    const se = activeSeason?.season ?? season ?? 1;
    const first = activeSeason?.episodes?.[0];
    setDlSheet({
      mode: "season",
      se: String(first?.se ?? se),
      ep: String(first?.ep ?? 1),
      season: se,
    });
  };

  const closeDlSheet = () => setDlSheet(null);

  const onDownloadStarted = () => {
    closeDlSheet();
    setDownloadNotice({ tab: isSeries ? "series" : "movies" });
  };

  const openPlay = (se = "0", ep = "0") => {
    if (!subjectId) {
      Alert.alert("Unavailable", "Playback isn’t available for this title.");
      return;
    }
    prefetchStreams({
      subjectId: String(subjectId),
      detailPath: slug,
      se: String(se ?? 0),
      ep: String(ep ?? 0),
    }).catch(() => {});
    router.push({
      pathname: "/play",
      params: {
        subjectId: String(subjectId),
        detail_path: slug,
        se: String(se ?? 0),
        ep: String(ep ?? 0),
        title: meta.title || slug,
        poster: meta.poster || "",
        kind: isSeries ? "series" : "movie",
        duration: String(meta.duration || ""),
        autoplay: "1",
      },
    });
  };

  // Warm stream list + first media bytes while user reads the detail page.
  useEffect(() => {
    if (!subjectId || !slug) return;

    let se = "0";
    let ep = "0";
    if (isSeries && activeSeason?.episodes?.length) {
      const first = activeSeason.episodes[0];
      se = String(activeSeason.season ?? 1);
      ep = String(first?.episode ?? first?.ep ?? 1);
    }

    prefetchStreams({
      subjectId: String(subjectId),
      detailPath: slug,
      se,
      ep,
    }).catch(() => {});
  }, [subjectId, slug, isSeries, activeSeason]);

  return (
    <View style={styles.page}>
      <DetailHeader title={loading ? "Details" : headerTitle} />
      {downloadNotice ? (
        <View style={styles.downloadNotice}>
          <Ionicons
            name="checkmark-circle-outline"
            size={17}
            color={colors.accentLight}
          />
          <Text style={styles.downloadNoticeText}>Download started</Text>
          <Pressable
            onPress={() => {
              const tab = downloadNotice.tab;
              setDownloadNotice(null);
              router.navigate({
                pathname: "/(tabs)/downloads",
                params: { tab },
              });
            }}
          >
            <Text style={styles.downloadNoticeLink}>Open Downloads</Text>
          </Pressable>
          <Pressable
            onPress={() => setDownloadNotice(null)}
            hitSlop={8}
            accessibilityLabel="Dismiss download message"
          >
            <Ionicons name="close" size={16} color={colors.muted} />
          </Pressable>
        </View>
      ) : null}
      {loading ? (
        <TitleSkeleton />
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : !detail ? (
        <EmptyState title="No items found" />
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          <View style={styles.hero}>
            {meta.poster ? (
              <Image
                source={{ uri: meta.poster }}
                style={styles.poster}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
            ) : (
              <View style={[styles.poster, styles.posterEmpty]} />
            )}
            <View style={styles.copy}>
              <Text style={styles.title}>{meta.title || slug}</Text>
              {metaBits.length ? (
                <Text style={styles.metaLine}>{metaBits.join(" · ")}</Text>
              ) : null}
              {meta.imdb_rating ? (
                <View style={styles.ratingRow}>
                  <Ionicons name="star" size={14} color={colors.gold} />
                  <Text style={styles.ratingText}>{meta.imdb_rating}</Text>
                  <Text style={styles.ratingLabel}>IMDb</Text>
                </View>
              ) : null}
              <Pressable
                style={[styles.playBtn, !subjectId && styles.playDisabled]}
                disabled={!subjectId}
                onPress={() => {
                  if (!isSeries) {
                    openPlay(0, 0);
                    return;
                  }
                  const first = activeSeason?.episodes?.[0];
                  openPlay(
                    first?.se ?? season ?? 1,
                    first?.ep ?? 1
                  );
                }}
              >
                <Ionicons name="play" size={16} color={colors.accentInk} />
                <Text style={styles.playText}>
                  {isSeries
                    ? `Play S${activeSeason?.season ?? ""}E${
                        activeSeason?.episodes?.[0]?.ep ?? 1
                      }`
                    : "Play"}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.dlBtn, !subjectId && styles.playDisabled]}
                disabled={!subjectId}
                onPress={() => {
                  if (!isSeries) {
                    openDownload(0, 0);
                    return;
                  }
                  openSeasonDownload();
                }}
              >
                <Ionicons name="download-outline" size={16} color={colors.accent} />
                <Text style={styles.dlText}>
                  {isSeries ? "Download season" : "Download"}
                </Text>
              </Pressable>
            </View>
          </View>

          {!isSeries && movieWatchPct > 0 ? (
            <View style={styles.watchSummary}>
              <View style={styles.watchSummaryHead}>
                <Text style={styles.watchSummaryTitle}>Continue watching</Text>
                <Text style={styles.watchSummaryPct}>{movieWatchPct}%</Text>
              </View>
              <View style={styles.watchTrack}>
                <View
                  style={[styles.watchFill, { width: `${movieWatchPct}%` }]}
                />
              </View>
              <Text style={styles.watchSummaryText}>
                Watched {formatDuration(movieWatchDisplay?.position) || "a little"}
                {movieWatchDisplay?.duration
                  ? ` of ${formatDuration(movieWatchDisplay.duration)}`
                  : ""}
              </Text>
            </View>
          ) : null}
          {!isSeries && movieDownload ? (
            <Text style={styles.downloadProgressText}>
              Download {movieDownloadPct}% ·{" "}
              {movieDownload.status === "completed"
                ? "ready"
                : movieDownload.status || "in progress"}
            </Text>
          ) : null}

          {genres.length ? (
            <View style={styles.chips}>
              {genres.map((g) => (
                <View key={g} style={styles.genreChip}>
                  <Text style={styles.genreText}>{g}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {isSeries ? (
            <View style={styles.epsBlock}>
              <Text style={styles.blockTitle}>
                Episodes · {visibleEpisodes.length}/{episodeList.length}
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {seasons.map((s) => (
                  <Pressable
                    key={`season-${s.season}`}
                    onPress={() => {
                      setSeason(s.season);
                      setEpisodesExpanded(false);
                    }}
                    style={[
                      styles.chip,
                      String(s.season) === String(activeSeason?.season) &&
                        styles.chipOn,
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        String(s.season) === String(activeSeason?.season) &&
                          styles.chipTextOn,
                      ]}
                    >
                      Season {s.season}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
              <View style={styles.epGrid}>
                {visibleEpisodes.map((ep) => {
                  const watchPct = progressPercent(
                    watchEntryFor(ep.se, ep.ep)
                  );
                  const download = downloadFor(ep.se, ep.ep);
                  const downloadPct = Math.round(downloadProgressOf(download) * 100);
                  return (
                    <ProgressBorder
                      key={`${ep.se}-${ep.ep}`}
                      percent={watchPct}
                      style={styles.epProgressBorder}
                    >
                      <View style={styles.epCell}>
                        <Pressable
                          style={styles.epBtn}
                          onPress={() => openPlay(ep.se, ep.ep)}
                        >
                          <Text style={styles.epText}>Ep {ep.ep}</Text>
                          {watchPct > 0 || download ? (
                            <Text style={styles.epProgressLabel} numberOfLines={1}>
                              {watchPct > 0 ? `${watchPct}%` : "—"}
                              {download ? ` / DL ${downloadPct}%` : ""}
                            </Text>
                          ) : null}
                        </Pressable>
                        <Pressable
                          style={styles.epDl}
                          onPress={() => openDownload(ep.se, ep.ep)}
                          hitSlop={4}
                        >
                          <Ionicons
                            name="download-outline"
                            size={14}
                            color={colors.accent}
                          />
                        </Pressable>
                      </View>
                    </ProgressBorder>
                  );
                })}
              </View>
              {hasMoreEpisodes ? (
                <Pressable
                  style={styles.episodesToggle}
                  onPress={() => setEpisodesExpanded((value) => !value)}
                >
                  <Text style={styles.episodesToggleText}>
                    {episodesExpanded
                      ? "Show fewer episodes"
                      : `Show all ${episodeList.length} episodes`}
                  </Text>
                  <Ionicons
                    name={episodesExpanded ? "chevron-up" : "chevron-down"}
                    size={16}
                    color={colors.accent}
                  />
                </Pressable>
              ) : null}
            </View>
          ) : null}

          <View style={styles.block}>
            <Text style={styles.blockTitle}>Overview</Text>
            <Text style={styles.desc} numberOfLines={descriptionExpanded ? undefined : 3}>
              {description}
            </Text>
            {descriptionNeedsToggle ? (
              <Pressable
                style={styles.descriptionToggle}
                onPress={() => setDescriptionExpanded((value) => !value)}
              >
                <Text style={styles.descriptionToggleText}>
                  {descriptionExpanded ? "Show less" : "Show more"}
                </Text>
                <Ionicons
                  name={descriptionExpanded ? "chevron-up" : "chevron-down"}
                  size={15}
                  color={colors.accent}
                />
              </Pressable>
            ) : null}
          </View>

          {castPeople.length ? (
            <View style={styles.block}>
              <Text style={styles.blockTitle}>Cast</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.castRow}
              >
                {castPeople.map((person) => (
                  <View key={person.key} style={styles.castCard}>
                    {person.avatar ? (
                      <Image
                        source={{ uri: person.avatar }}
                        style={styles.avatar}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                      />
                    ) : (
                      <View style={[styles.avatar, styles.avatarEmpty]}>
                        <Ionicons
                          name="person"
                          size={22}
                          color={colors.muted}
                        />
                      </View>
                    )}
                    <Text style={styles.castName} numberOfLines={2}>
                      {person.name}
                    </Text>
                    {person.role ? (
                      <Text style={styles.castRole} numberOfLines={1}>
                        {person.role}
                      </Text>
                    ) : null}
                  </View>
                ))}
              </ScrollView>
            </View>
          ) : null}

          {related.length ? (
            <View style={styles.block}>
              <View style={styles.relatedHead}>
                <Text style={styles.blockTitle}>Related</Text>
                {related.length > 6 ? (
                  <Pressable
                    onPress={() => setRelatedExpanded((value) => !value)}
                    hitSlop={8}
                  >
                    <Text style={styles.relatedToggle}>
                      {relatedExpanded ? "Show less" : "Show more"}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.relatedRow}
              >
                {visibleRelated.map((item) => (
                  <PosterCard
                    key={item.slug}
                    item={{
                      ...item,
                      poster_url: item.poster_url || item.poster,
                    }}
                    width={104}
                  />
                ))}
              </ScrollView>
            </View>
          ) : null}
        </ScrollView>
      )}
      <DownloadSheet
        visible={!!dlSheet}
        onClose={closeDlSheet}
        onStarted={onDownloadStarted}
        subjectId={subjectId ? String(subjectId) : ""}
        detailPath={slug}
        title={meta.title || slug}
        poster={meta.poster || null}
        se={dlSheet?.se || "0"}
        ep={dlSheet?.ep || "0"}
        kind={isSeries ? "series" : "movie"}
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
  downloadNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginHorizontal: spacing.md,
    marginTop: spacing.xs,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radii.sm,
    backgroundColor: colors.accentMuted,
    borderWidth: 1,
    borderColor: colors.accentBorder,
  },
  downloadNoticeText: {
    flex: 1,
    color: colors.text,
    fontSize: 12,
    fontWeight: "700",
  },
  downloadNoticeLink: {
    color: colors.accentLight,
    fontSize: 12,
    fontWeight: "800",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  errorText: {
    color: colors.danger,
    textAlign: "center",
    fontSize: 15,
  },
  body: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
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
    borderWidth: 1,
    borderColor: colors.line,
  },
  copy: {
    flex: 1,
    gap: 8,
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
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  playDisabled: {
    opacity: 0.45,
  },
  playText: {
    color: colors.accentInk,
    fontWeight: "800",
  },
  dlBtn: {
    marginTop: 4,
    backgroundColor: colors.accentMuted,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    borderRadius: radii.pill,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  dlText: {
    color: colors.accent,
    fontWeight: "800",
  },
  watchSummary: {
    backgroundColor: colors.panel,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    gap: 6,
  },
  watchSummaryHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  watchSummaryTitle: {
    color: colors.text,
    fontWeight: "800",
    fontSize: 13,
  },
  watchSummaryPct: {
    color: colors.accent,
    fontWeight: "800",
    fontSize: 12,
  },
  watchTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.panelSoft,
    overflow: "hidden",
  },
  watchFill: {
    height: "100%",
    backgroundColor: colors.accent,
  },
  watchSummaryText: {
    color: colors.muted,
    fontSize: 11,
  },
  downloadProgressText: {
    color: colors.accentLight,
    fontSize: 11,
    fontWeight: "700",
    marginTop: -spacing.xs,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  genreChip: {
    backgroundColor: colors.panelSoft,
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  genreText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "600",
  },
  block: {
    gap: 8,
  },
  blockTitle: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 16,
  },
  desc: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
  },
  descriptionToggle: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 5,
    marginTop: 8,
  },
  descriptionToggleText: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: "800",
  },
  castRow: {
    gap: 12,
    paddingRight: spacing.md,
  },
  castCard: {
    width: 88,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.panel,
    marginBottom: 6,
  },
  avatarEmpty: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.line,
  },
  castName: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 15,
  },
  castRole: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 2,
  },
  relatedHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  relatedRow: {
    gap: 10,
    paddingRight: spacing.md,
  },
  relatedToggle: {
    color: colors.accent,
    fontWeight: "800",
    fontSize: 12,
  },
  epsBlock: {
    gap: spacing.sm,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: 8,
  },
  chipOn: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  chipText: {
    color: colors.text,
    fontWeight: "600",
  },
  chipTextOn: {
    color: colors.accentInk,
  },
  epGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  epCell: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.panel,
    borderRadius: 8,
    overflow: "hidden",
    height: 50,
  },
  epProgressBorder: {
    borderRadius: 9,
  },
  epBtn: {
    paddingHorizontal: 12,
    paddingVertical: 0,
    minWidth: 52,
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  epDl: {
    paddingHorizontal: 8,
    paddingVertical: 0,
    minHeight: 50,
    justifyContent: "center",
    borderLeftWidth: 1,
    borderLeftColor: colors.line,
  },
  epText: {
    color: colors.text,
    fontWeight: "600",
    fontSize: 13,
  },
  epProgressLabel: {
    color: colors.muted,
    fontSize: 8,
    fontWeight: "600",
    marginTop: 1,
    maxWidth: 78,
  },
  episodesToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: radii.md,
    backgroundColor: colors.panelSoft,
  },
  episodesToggleText: {
    color: colors.accent,
    fontWeight: "800",
    fontSize: 12,
  },
});
