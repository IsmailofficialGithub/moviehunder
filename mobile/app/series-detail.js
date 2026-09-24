import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import ProgressBorder from "../components/ProgressBorder";
import DownloadSheet from "../components/DownloadSheet";
import {
  canPlayPartial,
  enqueueBestEffort,
  etaSecondsOf,
  fetchSeasonCatalog,
  formatBytes,
  formatEta,
  hydrateDownloads,
  isEpisodeCovered,
  isPartialOnly,
  packEtaSeconds,
  pauseDownload,
  progressOf,
  removeDownload,
  resumeDownload,
  subscribeDownloads,
} from "../lib/downloads";
import { toUserMessage } from "../lib/userFacingError";
import { colors, radii, spacing } from "../lib/theme";
import {
  progressPercent,
  subscribeWatchProgress,
  watchProgressKey,
} from "../lib/watchProgress";

function isSeriesItem(d) {
  return d.kind === "series" || Number(d.se) > 0 || Number(d.ep) > 0;
}

function qualityLabel(item) {
  if (item.height) return `${item.height}p`;
  if (item.resolution && !/preparing|failed/i.test(item.resolution)) return item.resolution;
  return null;
}

// Small inline status pill
function StatusPill({ status, pending }) {
  const isActive = !pending && (status === "downloading" || status === "queued");
  const isFailed = !pending && status === "failed";
  const isDone = !pending && status === "completed";
  const bg = pending
    ? colors.panelSoft
    : isActive
      ? colors.accentMuted
      : isFailed
        ? "rgba(248,113,113,0.15)"
        : isDone
          ? colors.accentMuted
          : colors.panelSoft;
  const fg = pending
    ? colors.muted
    : isActive
      ? colors.accentLight
      : isFailed
        ? colors.danger
        : isDone
          ? colors.accentLight
          : colors.muted;
  const label = pending
    ? "Preparing"
    : status === "downloading"
      ? "Downloading"
      : status === "queued"
        ? "Queued"
        : status === "paused"
          ? "Paused"
          : status === "failed"
            ? "Failed"
            : "Ready";
  return (
    <View style={[sp.pill, { backgroundColor: bg }]}>
      {isActive && <View style={[sp.activeDot, { backgroundColor: fg }]} />}
      <Text style={[sp.pillText, { color: fg }]}>{label}</Text>
    </View>
  );
}

const sp = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: radii.pill,
  },
  activeDot: { width: 5, height: 5, borderRadius: 3 },
  pillText: { fontSize: 11, fontWeight: "600" },
});

// Small icon button
function IconBtn({ name, color, onPress, danger }) {
  return (
    <Pressable
      style={[ib.btn, danger && ib.btnDanger]}
      onPress={onPress}
      hitSlop={8}
      accessibilityLabel={name}
    >
      <Ionicons name={name} size={14} color={color || colors.accentLight} />
    </Pressable>
  );
}

const ib = StyleSheet.create({
  btn: {
    backgroundColor: colors.panelSoft,
    borderRadius: radii.sm,
    padding: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  btnDanger: { backgroundColor: "rgba(248,113,113,0.12)" },
});

function EpCard({ item, watchMap, onPlay, onPause, onResume, onDelete }) {
  const watchPct = progressPercent(
    watchMap?.get(watchProgressKey({ subjectId: item.subjectId, se: item.se, ep: item.ep }))
  );
  const dlPct = Math.round(progressOf(item) * 100);
  const written = formatBytes(item.bytesWritten || 0);
  const total = formatBytes(item.totalBytes || item.sizeHint || 0);
  const playable = canPlayPartial(item);
  const partial = isPartialOnly(item);
  const active = !item.pending && (item.status === "downloading" || item.status === "queued");
  const canResume = !item.pending && (item.status === "paused" || item.status === "failed");
  const showPlay = playable && !item.pending && !active;
  const etaLabel = formatEta(etaSecondsOf(item));
  const q = qualityLabel(item);

  const sizeStr = item.error
    ? item.error
    : [
        total
          ? `${written}${item.totalBytes || item.sizeHint ? ` / ${total}` : ""}`
          : written !== "0 B"
            ? written
            : dlPct > 0
              ? `${dlPct}%`
              : null,
        etaLabel,
      ]
      .filter(Boolean)
      .join("  ");

  return (
    <View style={ec.card}>
      <ProgressBorder percent={watchPct} style={ec.labelWrap}>
        <Text style={ec.epLabel}>
          S{item.se}
          {"\n"}E{item.ep}
        </Text>
      </ProgressBorder>

      <View style={ec.meta}>
        <View style={ec.badgeRow}>
          {q ? (
            <View style={ec.qBadge}>
              <Text style={ec.qText}>{q}</Text>
            </View>
          ) : null}
          <StatusPill status={item.status} pending={item.pending} />
        </View>

        {(active || item.status === "paused" || item.pending) ? (
          <View style={ec.track}>
            <View style={[ec.fill, { width: `${dlPct}%` }]} />
          </View>
        ) : null}

        {sizeStr ? (
          <Text style={ec.sizeText} numberOfLines={1}>{sizeStr}</Text>
        ) : null}

        {watchPct > 0 ? (
          <Text style={ec.watchText}>{watchPct}% watched</Text>
        ) : null}

        {partial && !active ? (
          <Text style={ec.partialText}>Partial · may stop early</Text>
        ) : null}
      </View>

      <View style={ec.actions}>
        {showPlay ? (
          <IconBtn name="play" color={colors.accentLight} onPress={() => onPlay(item)} />
        ) : null}
        {active ? (
          <IconBtn name="pause" color={colors.muted} onPress={() => onPause(item)} />
        ) : null}
        {canResume ? (
          <IconBtn name="refresh" color={colors.accentLight} onPress={() => onResume(item)} />
        ) : null}
        <IconBtn name="trash-outline" color={colors.danger} onPress={() => onDelete(item)} danger />
      </View>
    </View>
  );
}

const ec = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    gap: 12,
  },
  labelWrap: { width: 42 },
  epLabel: { fontSize: 12, fontWeight: "700", color: colors.text, textAlign: "center", lineHeight: 16 },
  meta: { flex: 1, gap: 5 },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  qBadge: {
    backgroundColor: colors.accentMuted,
    borderRadius: radii.pill,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  qText: { fontSize: 11, fontWeight: "700", color: colors.accentLight },
  track: {
    height: 2,
    backgroundColor: colors.line,
    borderRadius: 1,
    overflow: "hidden",
  },
  fill: { height: "100%", backgroundColor: colors.accentLight, borderRadius: 1 },
  sizeText: { fontSize: 11, color: colors.muted },
  watchText: { fontSize: 11, color: colors.accentLight },
  partialText: { fontSize: 11, color: colors.muted, fontStyle: "italic" },
  actions: { flexDirection: "row", gap: 6, alignItems: "center" },
});

export default function SeriesDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const packKey = params.packKey ? decodeURIComponent(String(params.packKey)) : "";
  const [subjectId, detailPath] = packKey.split("|");

  const [allDownloads, setAllDownloads] = useState([]);
  const [watchEntries, setWatchEntries] = useState([]);
  const [catalog, setCatalog] = useState(null);
  const [catalogBusy, setCatalogBusy] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [dlSheet, setDlSheet] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => subscribeWatchProgress(setWatchEntries), []);
  useEffect(() => {
    hydrateDownloads().catch(() => {});
    return subscribeDownloads(setAllDownloads);
  }, []);

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
        return se !== 0 ? se : Number(a.ep) - Number(b.ep);
      });
  }, [allDownloads, subjectId, detailPath]);

  const pack = useMemo(() => {
    if (!episodes.length) return null;
    return {
      title: episodes[0].title,
      poster: episodes.find((e) => e.poster)?.poster || null,
      subjectId,
      detailPath,
    };
  }, [episodes, subjectId, detailPath]);

  const watchMap = useMemo(
    () => new Map(watchEntries.map((e) => [e.key, e])),
    [watchEntries]
  );

  const ready = episodes.filter((e) => e.status === "completed" && !e.pending).length;
  const activeCount = episodes.filter(
    (e) => e.pending || e.status === "downloading" || e.status === "queued"
  ).length;
  const totalBytes = episodes.reduce((n, e) => n + (e.bytesWritten || e.sizeHint || 0), 0);
  const packEta = formatEta(packEtaSeconds(episodes));

  const onPlay = (item) =>
    router.push({
      pathname: "/play",
      params: {
        subjectId: item.subjectId,
        detail_path: item.detailPath,
        se: item.se,
        ep: item.ep,
        title: `${item.title} - S${item.se}E${item.ep}`,
        poster: item.poster || "",
        kind: "series",
        autoplay: "1",
        downloadId: encodeURIComponent(item.id),
      },
    });

  const onPause = (item) => pauseDownload(item.id);

  const onResume = async (item) => {
    if (item.pending || !item.sourceUrl) {
      try {
        await removeDownload(item.id);
        await enqueueBestEffort({
          subjectId: item.subjectId,
          detailPath: item.detailPath,
          title: item.title,
          poster: item.poster,
          se: item.se,
          ep: item.ep,
          kind: item.kind,
          preferredHeight: item.height || 720,
        });
      } catch (err) {
        Alert.alert("Retry failed", toUserMessage(err, "Couldn't restart download."));
      }
      return;
    }
    resumeDownload(item.id);
  };

  const onDelete = (item) =>
    Alert.alert(
      "Remove episode",
      `Delete S${item.se}E${item.ep}?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => removeDownload(item.id) },
      ]
    );

  const onDeleteAll = () => {
    if (!episodes.length) return;
    Alert.alert(
      "Delete all",
      `Remove all ${episodes.length} episodes of "${pack?.title}"?`,
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

  const onDownloadAll = () =>
    setDlSheet({
      mode: "season",
      subjectId,
      detailPath,
      title: pack?.title || "",
      poster: pack?.poster || null,
      se: "1",
      ep: "1",
      season: 1,
      kind: "series",
    });

  const onFetchMore = useCallback(async () => {
    if (catalogBusy || !detailPath) return;
    setCatalogBusy(true);
    try {
      const data = await fetchSeasonCatalog(detailPath);
      setCatalog({ seasons: data.seasons || [] });
      setCatalogOpen(true);
      if (!(data.seasons || []).length)
        Alert.alert("No episodes", "Server returned no seasons for this title.");
    } catch (err) {
      const msg = toUserMessage(err, "Couldn't load episodes. Check your connection.");
      setCatalog((prev) => ({ seasons: prev?.seasons || [], error: msg }));
      Alert.alert("Couldn't load", msg);
    } finally {
      setCatalogBusy(false);
    }
  }, [catalogBusy, detailPath]);

  const onDownloadSeason = (season) => {
    const row = (catalog?.seasons || []).find((s) => String(s.season) === String(season));
    const first = row?.episodes?.[0];
    setDlSheet({
      mode: "season",
      subjectId,
      detailPath,
      title: pack?.title || "",
      poster: pack?.poster || null,
      se: String(first?.se ?? season),
      ep: String(first?.ep ?? 1),
      season,
      kind: "series",
    });
  };

  const onDownloadEpisode = (se, ep) =>
    setDlSheet({
      mode: "single",
      subjectId,
      detailPath,
      title: pack?.title || "",
      poster: pack?.poster || null,
      se: String(se),
      ep: String(ep),
      season: null,
      kind: "series",
    });

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

  const title = pack?.title || "Series";

  return (
    <View style={s.root}>
      <View style={s.header}>
        <Pressable style={s.backBtn} onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>
        <Text style={s.headerTitle} numberOfLines={1}>{title}</Text>
        <Pressable
          style={s.headerTrash}
          onPress={onDeleteAll}
          hitSlop={12}
          accessibilityLabel="Delete all episodes"
        >
          <Ionicons name="trash-outline" size={16} color={colors.danger} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accentLight} />
        }
      >
        <View style={s.hero}>
          {pack?.poster ? (
            <Image
              source={{ uri: pack.poster }}
              style={s.poster}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
          ) : (
            <View style={[s.poster, s.posterFallback]}>
              <Ionicons name="tv-outline" size={28} color={colors.muted} />
            </View>
          )}
          <View style={s.heroText}>
            <Text style={s.heroTitle} numberOfLines={3}>{title}</Text>
            <View style={s.statRow}>
              <View style={s.statChip}>
                <Ionicons name="film-outline" size={11} color={colors.muted} />
                <Text style={s.statChipText}>{episodes.length} ep</Text>
              </View>
              {ready > 0 && (
                <View style={[s.statChip, s.statChipAccent]}>
                  <Ionicons name="checkmark-circle" size={11} color={colors.accentLight} />
                  <Text style={[s.statChipText, { color: colors.accentLight }]}>{ready} ready</Text>
                </View>
              )}
              {activeCount > 0 && (
                <View style={[s.statChip, s.statChipAccent]}>
                  <View style={s.activeDot} />
                  <Text style={[s.statChipText, { color: colors.accentLight }]}>{activeCount} active</Text>
                </View>
              )}
              {totalBytes > 0 && (
                <View style={s.statChip}>
                  <Text style={s.statChipText}>{formatBytes(totalBytes)}</Text>
                </View>
              )}
              {packEta ? (
                <View style={s.statChip}>
                  <Ionicons name="time-outline" size={11} color={colors.muted} />
                  <Text style={s.statChipText}>{packEta}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        <View style={s.actions}>
          <Pressable style={s.btnPrimary} onPress={onDownloadAll}>
            <Ionicons name="cloud-download-outline" size={15} color={colors.accentInk} />
            <Text style={s.btnPrimaryText}>Download All</Text>
          </Pressable>
          <Pressable
            style={[s.btnSecondary, catalogBusy && s.btnDisabled]}
            disabled={catalogBusy}
            onPress={
              catalog && catalogOpen
                ? () => setCatalogOpen(false)
                : catalog && !catalogOpen
                  ? () => setCatalogOpen(true)
                  : onFetchMore
            }
          >
            <Ionicons
              name={
                catalogBusy
                  ? "ellipsis-horizontal"
                  : catalog && catalogOpen
                    ? "chevron-up"
                    : "add-circle-outline"
              }
              size={15}
              color={colors.accentLight}
            />
            <Text style={s.btnSecondaryText}>
              {catalogBusy
                ? "Fetching…"
                : catalog && catalogOpen
                  ? "Hide catalog"
                  : catalog
                    ? "Show catalog"
                    : "More episodes"}
            </Text>
          </Pressable>
        </View>

        {catalog && catalogOpen ? (
          <View style={s.catalogCard}>
            <Text style={s.catalogHint}>
              Tap a season to download all missing episodes · tap an episode chip to download individually
            </Text>
            {catalog.error ? <Text style={s.catalogError}>{catalog.error}</Text> : null}
            {(catalog.seasons || []).map((season) => {
              const se = season.season;
              const count = season.episode_count || (season.episodes || []).length || 0;
              const missing = (season.episodes || []).filter(
                (ep) => !isEpisodeCovered({ subjectId, detailPath, se: ep.se ?? se, ep: ep.ep })
              ).length;
              return (
                <View key={`se-${se}`} style={s.seasonBlock}>
                  <View style={s.seasonRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.seasonLabel}>Season {se}</Text>
                      <Text style={s.seasonSub}>
                        {count} ep
                        {missing > 0 ? `  ·  ${missing} missing` : "  ·  all queued"}
                      </Text>
                    </View>
                    <Pressable
                      style={[s.dlSeasonBtn, missing === 0 && s.dlSeasonBtnOff]}
                      disabled={missing === 0}
                      onPress={() => onDownloadSeason(se)}
                    >
                      <Ionicons name="download-outline" size={13} color={missing === 0 ? colors.muted : colors.accentInk} />
                      <Text style={[s.dlSeasonText, missing === 0 && { color: colors.muted }]}>Download</Text>
                    </Pressable>
                  </View>
                  <View style={s.epChipRow}>
                    {(season.episodes || []).map((ep) => {
                      const covered = isEpisodeCovered({
                        subjectId,
                        detailPath,
                        se: ep.se ?? se,
                        ep: ep.ep,
                      });
                      return (
                        <Pressable
                          key={`ec-${se}-${ep.ep}`}
                          style={[s.epChip, covered && s.epChipDone]}
                          disabled={covered}
                          onPress={() => onDownloadEpisode(ep.se ?? se, ep.ep)}
                        >
                          <Text style={[s.epChipText, covered && s.epChipTextDone]}>
                            {ep.ep}
                          </Text>
                          {covered ? (
                            <Ionicons name="checkmark" size={10} color={colors.accentLight} />
                          ) : (
                            <Ionicons name="download-outline" size={10} color={colors.accentLight} />
                          )}
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}

        <View style={s.epHeader}>
          <Text style={s.epHeaderText}>DOWNLOADED</Text>
          <Text style={s.epHeaderCount}>{episodes.length}</Text>
        </View>

        {episodes.map((item) => (
          <EpCard
            key={item.id}
            item={item}
            watchMap={watchMap}
            onPlay={onPlay}
            onPause={onPause}
            onResume={onResume}
            onDelete={onDelete}
          />
        ))}
      </ScrollView>

      <DownloadSheet
        visible={!!dlSheet}
        onClose={() => setDlSheet(null)}
        onStarted={() => setDlSheet(null)}
        subjectId={dlSheet?.subjectId || ""}
        detailPath={dlSheet?.detailPath || ""}
        title={dlSheet?.title || ""}
        poster={dlSheet?.poster || null}
        se={dlSheet?.se || "1"}
        ep={dlSheet?.ep || "1"}
        kind="series"
        season={dlSheet?.season ?? null}
        mode={dlSheet?.mode || "single"}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xl,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    gap: 8,
  },
  backBtn: {
    backgroundColor: colors.panelSoft,
    borderRadius: radii.sm,
    padding: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
    letterSpacing: -0.2,
  },
  headerTrash: {
    backgroundColor: "rgba(248,113,113,0.12)",
    borderRadius: radii.sm,
    padding: 6,
    alignItems: "center",
    justifyContent: "center",
  },

  scroll: { paddingBottom: 48 },

  // Hero
  hero: {
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md,
    paddingBottom: 12,
  },
  poster: {
    width: 80,
    height: 116,
    borderRadius: radii.md,
    backgroundColor: colors.panel,
  },
  posterFallback: { alignItems: "center", justifyContent: "center" },
  heroText: { flex: 1, justifyContent: "center", gap: 8 },
  heroTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
    lineHeight: 24,
    letterSpacing: -0.3,
  },
  statRow: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  statChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: colors.panelSoft,
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statChipAccent: { backgroundColor: colors.accentMuted },
  statChipText: { fontSize: 11, fontWeight: "500", color: colors.muted },
  activeDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.accentLight,
  },

  // Action buttons
  actions: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  btnPrimary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.accent,
    paddingVertical: 10,
    borderRadius: radii.md,
  },
  btnPrimaryText: { fontSize: 13, fontWeight: "700", color: colors.accentInk },
  btnSecondary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.accentMuted,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    paddingVertical: 10,
    borderRadius: radii.md,
  },
  btnSecondaryText: { fontSize: 13, fontWeight: "700", color: colors.accentLight },
  btnDisabled: { opacity: 0.5 },

  // Catalog card
  catalogCard: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    backgroundColor: colors.panel,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 14,
  },
  catalogHint: { fontSize: 12, color: colors.muted, lineHeight: 17 },
  catalogError: { fontSize: 12, color: colors.danger },
  seasonBlock: { gap: 10 },
  seasonRow: { flexDirection: "row", alignItems: "center" },
  seasonLabel: { fontSize: 13, fontWeight: "700", color: colors.text },
  seasonSub: { fontSize: 11, color: colors.muted, marginTop: 2 },
  dlSeasonBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.accent,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: radii.pill,
  },
  dlSeasonBtnOff: { backgroundColor: colors.panelSoft },
  dlSeasonText: { fontSize: 11, fontWeight: "700", color: colors.accentInk },
  epChipRow: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  epChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    backgroundColor: colors.accentMuted,
  },
  epChipDone: {
    borderColor: colors.line,
    backgroundColor: colors.panelSoft,
  },
  epChipText: { fontSize: 11, fontWeight: "600", color: colors.accentLight },
  epChipTextDone: { color: colors.muted },

  // Ep section header
  epHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.panel,
  },
  epHeaderText: { fontSize: 11, fontWeight: "700", color: colors.muted, letterSpacing: 0.8 },
  epHeaderCount: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.accentLight,
    backgroundColor: colors.accentMuted,
    borderRadius: radii.pill,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
});
