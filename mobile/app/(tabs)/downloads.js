import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  AppState,
  LayoutAnimation,
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
import EmptyState from "../../components/EmptyState";
import DownloadSheet from "../../components/DownloadSheet";
import DownloadSettingsModal from "../../components/DownloadSettingsModal";
import ProgressBorder from "../../components/ProgressBorder";
import VaultModal, {
  resolveVaultModalMode,
} from "../../components/VaultModal";
import VaultImportModal from "../../components/VaultImportModal";
import Screen from "../../components/Screen";
import {
  enqueueBestEffort,
  fetchSeasonCatalog,
  formatBytes,
  formatEta,
  etaSecondsOf,
  packEtaSeconds,
  getStorageStats,
  hydrateDownloads,
  isEpisodeCovered,
  canPlayPartial,
  isPartialOnly,
  moveDownloadFromVault,
  moveDownloadsToVault,
  pauseDownload,
  progressOf,
  removeDownload,
  resumeDownload,
  subscribeDownloads,
} from "../../lib/downloads";
import {
  hydrateMusicDownloads,
  musicDownloadProgress,
  pauseMusicDownload,
  removeMusicDownload,
  resumeMusicDownload,
  subscribeMusicDownloads,
} from "../../lib/musicDownloads";
import { playTrack } from "../../lib/musicPlayer";
import { openMusicPlayer } from "../../lib/musicUi";
import { toUserMessage } from "../../lib/userFacingError";
import {
  isVaultUnlocked,
  lockVault,
  subscribeVault,
} from "../../lib/vault";
import { colors, radii, spacing } from "../../lib/theme";
import {
  progressPercent,
  subscribeWatchProgress,
  watchProgressKey,
} from "../../lib/watchProgress";

function isSeriesItem(d) {
  return d.kind === "series" || Number(d.se) > 0 || Number(d.ep) > 0;
}

function qualityLabel(item) {
  if (item.height) return `${item.height}p`;
  if (item.resolution && !/preparing|failed/i.test(item.resolution)) {
    return item.resolution;
  }
  return "—";
}

function StatusDot({ status, pending }) {
  const color = pending
    ? colors.muted
    : status === "downloading" || status === "queued"
      ? colors.accent
      : status === "completed"
        ? colors.accent
        : status === "failed"
          ? colors.danger
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
            : status === "completed"
              ? "Ready"
              : status;
  return (
    <View style={styles.statusRow}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.statusText, { color }]}>{label}</Text>
    </View>
  );
}

function QualityBadge({ item }) {
  return (
    <View style={styles.qBadge}>
      <Text style={styles.qBadgeText}>{qualityLabel(item)}</Text>
    </View>
  );
}

function EpisodeRow({
  item,
  watchMap,
  onPlay,
  onPause,
  onResume,
  onDelete,
  onRestoreFromVault,
  vaultMode,
}) {
  const watchPct = progressPercent(
    watchMap?.get(
      watchProgressKey({
        subjectId: item.subjectId,
        se: item.se,
        ep: item.ep,
      })
    )
  );
  const pct = Math.round(progressOf(item) * 100);
  const written = formatBytes(item.bytesWritten || 0);
  const total = formatBytes(item.totalBytes || item.sizeHint || 0);
  const playable = canPlayPartial(item);
  const partial = isPartialOnly(item);
  const active =
    !item.pending &&
    (item.status === "downloading" || item.status === "queued");
  const canResume =
    !item.pending && (item.status === "paused" || item.status === "failed");
  // While downloading: pause + delete only. Play when paused/ready (partial OK).
  const showPlay =
    playable && !item.pending && item.status !== "downloading" && item.status !== "queued";
  const canRestore =
    vaultMode &&
    typeof onRestoreFromVault === "function" &&
    item.status === "completed" &&
    !item.pending;
  const etaLabel = formatEta(etaSecondsOf(item));

  return (
    <View style={styles.epRow}>
      <View style={styles.epLeft}>
        <ProgressBorder percent={watchPct} style={styles.watchBadgeBorder}>
          <Text style={styles.epTitle}>S{item.se}E{item.ep}</Text>
        </ProgressBorder>
        <View style={styles.epMetaRow}>
          <QualityBadge item={item} />
          <StatusDot status={item.status} pending={item.pending} />
        </View>
        {(item.status === "downloading" ||
          item.status === "queued" ||
          item.status === "paused" ||
          item.pending) && (
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${pct}%` }]} />
            </View>
          )}
        <Text style={styles.epSize} numberOfLines={1}>
          {item.error
            ? item.error
            : [
              total
                ? `${written}${item.totalBytes || item.sizeHint ? ` / ${total}` : ""}`
                : written !== "0 B"
                  ? written
                  : pct > 0
                    ? `${pct}%`
                    : "",
              etaLabel,
            ]
              .filter(Boolean)
              .join(" · ")}
        </Text>
        {watchPct > 0 ? (
          <Text style={styles.watchedText}>{watchPct}% watched</Text>
        ) : null}
        {partial && !active ? (
          <Text style={styles.partialHint}>Partial — may stop early</Text>
        ) : null}
      </View>
      <View style={styles.epActions}>
        {showPlay ? (
          <Pressable style={styles.iconAct} onPress={() => onPlay(item)} hitSlop={6}>
            <Ionicons name="play" size={16} color={colors.accentInk} />
          </Pressable>
        ) : null}
        {active ? (
          <Pressable style={styles.iconGhost} onPress={() => onPause(item)} hitSlop={6}>
            <Ionicons name="pause" size={16} color={colors.text} />
          </Pressable>
        ) : null}
        {canResume ? (
          <Pressable style={styles.iconAct} onPress={() => onResume(item)} hitSlop={6}>
            <Ionicons name="refresh" size={16} color={colors.accentInk} />
          </Pressable>
        ) : null}
        {canRestore ? (
          <Pressable
            style={styles.iconGhost}
            onPress={() => onRestoreFromVault(item)}
            hitSlop={6}
          >
            <Ionicons name="lock-open-outline" size={16} color={colors.accentLight} />
          </Pressable>
        ) : null}
        <Pressable style={styles.iconGhost} onPress={() => onDelete(item)} hitSlop={6}>
          <Ionicons name="trash-outline" size={16} color={colors.danger} />
        </Pressable>
      </View>
    </View>
  );
}

function MovieCard({
  item,
  watchMap,
  onPlay,
  onPause,
  onResume,
  onDelete,
  onRestoreFromVault,
  vaultMode,
}) {
  const watchPct = progressPercent(
    watchMap?.get(
      watchProgressKey({
        subjectId: item.subjectId,
        se: item.se,
        ep: item.ep,
      })
    )
  );
  const pct = Math.round(progressOf(item) * 100);
  const written = formatBytes(item.bytesWritten || 0);
  const total = formatBytes(item.totalBytes || item.sizeHint || 0);
  const isDownloading =
    !item.pending &&
    (item.status === "downloading" || item.status === "queued");
  const isPaused = !item.pending && item.status === "paused";
  const isFailed = !item.pending && item.status === "failed";
  const canResume = isPaused || isFailed;
  const etaLabel = formatEta(etaSecondsOf(item));

  const q = qualityLabel(item);
  const qStr = q && q !== "—" ? q : "Movie";
  const sizeStr = total || (written !== "0 B" ? written : "");

  const subtitleLine1 = isDownloading
    ? [qStr, sizeStr].filter(Boolean).join(" | ")
    : [
      qStr,
      sizeStr,
      watchPct > 0 ? `${watchPct}% watched` : null,
    ]
      .filter(Boolean)
      .join(" | ");

  const onLongPress = () => {
    Alert.alert(
      item.title,
      "Movie Options",
      [
        vaultMode && typeof onRestoreFromVault === "function"
          ? {
            text: "Restore to Downloads",
            onPress: () => onRestoreFromVault(item),
          }
          : null,
        isDownloading
          ? { text: "Pause", onPress: () => onPause?.(item) }
          : canResume
            ? { text: "Resume", onPress: () => onResume?.(item) }
            : null,
        {
          text: "Delete download",
          style: "destructive",
          onPress: () => onDelete?.(item),
        },
        { text: "Cancel", style: "cancel" },
      ].filter(Boolean)
    );
  };

  return (
    <Pressable
      style={({ pressed }) => [
        styles.netflixRow,
        pressed && styles.netflixRowPressed,
      ]}
      onPress={() => onPlay(item)}
      onLongPress={onLongPress}
      android_ripple={{ color: "rgba(255,255,255,0.08)" }}
    >
      <View style={styles.netflixThumbWrap}>
        {item.poster ? (
          <Image
            source={{ uri: item.poster }}
            style={styles.netflixThumb}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        ) : (
          <View style={[styles.netflixThumb, styles.netflixThumbEmpty]}>
            <Ionicons name="film-outline" size={24} color={colors.muted} />
          </View>
        )}
        {isDownloading || isPaused ? (
          <View style={styles.thumbProgressTrack}>
            <View style={[styles.thumbProgressFill, { width: `${pct}%` }]} />
          </View>
        ) : null}
      </View>

      <View style={styles.netflixCopy}>
        <Text style={styles.netflixTitle} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.netflixMeta} numberOfLines={1}>
          {subtitleLine1 || "Movie"}
        </Text>
        {isDownloading ? (
          <Text style={styles.netflixStatusDownloading}>
            {item.status === "queued"
              ? `Waiting in queue…${total ? ` · ${total}` : ""}`
              : `Downloading · ${pct}% (${written}${total ? ` / ${total}` : ""})${etaLabel ? ` · ${etaLabel}` : ""}`}
          </Text>
        ) : isPaused ? (
          <Text style={styles.netflixStatusPaused}>
            {`Paused · ${pct}% (${written}${total ? ` / ${total}` : ""})`}
          </Text>
        ) : isFailed ? (
          <Text style={styles.netflixStatusFailed}>
            {item.error || "Download failed · Tap to retry"}
          </Text>
        ) : null}
      </View>

      <View style={styles.netflixActionWrap}>
        {isDownloading ? (
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              onPause(item);
            }}
            hitSlop={10}
            style={styles.circleActionBtn}
          >
            <Ionicons name="pause-circle-outline" size={24} color={colors.accentLight} />
          </Pressable>
        ) : canResume ? (
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              onResume(item);
            }}
            hitSlop={10}
            style={styles.circleActionBtn}
          >
            <Ionicons name="arrow-down-circle-outline" size={24} color={colors.accentLight} />
          </Pressable>
        ) : (
          <Ionicons
            name="chevron-forward"
            size={20}
            color="#ffffff"
            style={styles.netflixChevron}
          />
        )}
      </View>
    </Pressable>
  );
}

function SongCard({ item, onPlay, onPause, onResume, onDelete }) {
  const pct = Math.round(musicDownloadProgress(item) * 100);
  const written = formatBytes(item.bytesWritten || 0);
  const total = formatBytes(item.totalBytes || 0);
  const isDownloading = item.status === "downloading" || item.status === "queued";
  const isPaused = item.status === "paused";
  const isFailed = item.status === "failed";
  const canResume = isPaused || isFailed;

  const onLongPress = () => {
    Alert.alert(item.name, "Song Options", [
      isDownloading
        ? { text: "Pause", onPress: () => onPause?.(item) }
        : canResume
          ? { text: "Resume", onPress: () => onResume?.(item) }
          : null,
      {
        text: "Delete download",
        style: "destructive",
        onPress: () => onDelete?.(item),
      },
      { text: "Cancel", style: "cancel" },
    ].filter(Boolean));
  };

  return (
    <Pressable
      style={({ pressed }) => [
        styles.netflixRow,
        pressed && styles.netflixRowPressed,
      ]}
      onPress={() => onPlay(item)}
      onLongPress={onLongPress}
      android_ripple={{ color: "rgba(255,255,255,0.08)" }}
    >
      <View style={styles.netflixMusicThumbWrap}>
        {item.image ? (
          <Image
            source={{ uri: item.image }}
            style={styles.netflixThumb}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        ) : (
          <View style={[styles.netflixThumb, styles.netflixThumbEmpty]}>
            <Ionicons name="musical-notes" size={24} color={colors.muted} />
          </View>
        )}
        {isDownloading || isPaused ? (
          <View style={styles.thumbProgressTrack}>
            <View style={[styles.thumbProgressFill, { width: `${pct}%` }]} />
          </View>
        ) : null}
      </View>

      <View style={styles.netflixCopy}>
        <Text style={styles.netflixTitle} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.netflixMeta} numberOfLines={1}>
          {[item.artist || "Unknown artist", total || (written !== "0 B" ? written : "")].filter(Boolean).join(" | ")}
        </Text>
        {isDownloading ? (
          <Text style={styles.netflixStatusDownloading}>
            Downloading{pct > 0 ? ` · ${pct}%` : ""}
          </Text>
        ) : isPaused ? (
          <Text style={styles.netflixStatusPaused}>Paused</Text>
        ) : isFailed ? (
          <Text style={styles.netflixStatusFailed}>Failed</Text>
        ) : null}
      </View>

      <View style={styles.netflixActionWrap}>
        {isDownloading ? (
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              onPause(item);
            }}
            hitSlop={10}
            style={styles.circleActionBtn}
          >
            <Ionicons name="pause-circle-outline" size={24} color={colors.accentLight} />
          </Pressable>
        ) : canResume ? (
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              onResume(item);
            }}
            hitSlop={10}
            style={styles.circleActionBtn}
          >
            <Ionicons name="arrow-down-circle-outline" size={24} color={colors.accentLight} />
          </Pressable>
        ) : (
          <Ionicons
            name="chevron-forward"
            size={20}
            color="#ffffff"
            style={styles.netflixChevron}
          />
        )}
      </View>
    </Pressable>
  );
}

function SeriesPack({
  pack,
  watchMap,
  expanded,
  onToggle,
  onPlay,
  onPause,
  onResume,
  onDelete,
  onDeleteAll,
  onRestoreFromVault,
  vaultMode,
  catalog,
  catalogBusy,
  onFetchMore,
  onDownloadSeason,
  onDownloadEpisode,
}) {
  const ready = pack.episodes.filter((e) => e.status === "completed" && !e.pending).length;
  const isDownloading = pack.episodes.some(
    (e) => e.status === "downloading" || e.status === "queued" || e.pending
  );
  const isPaused = !isDownloading && pack.episodes.some((e) => e.status === "paused");
  const isFailed = !isDownloading && !isPaused && pack.episodes.some((e) => e.status === "failed");

  const bytes = pack.episodes.reduce(
    (n, e) => n + (Number(e.bytesWritten) || Number(e.sizeHint) || 0),
    0
  );
  const avgPct = Math.round(
    (pack.episodes.reduce((n, e) => n + (Number(progressOf(e)) || 0), 0) / Math.max(1, pack.episodes.length)) *
    100
  );
  const remoteSeasons = catalog?.seasons || [];
  const hasCatalog = !vaultMode && remoteSeasons.length > 0;
  const [catalogOpen, setCatalogOpen] = useState(true);
  const packEta = formatEta(packEtaSeconds(pack.episodes));

  useEffect(() => {
    if (hasCatalog) setCatalogOpen(true);
  }, [hasCatalog, pack.key]);

  const onMorePress = () => {
    if (catalogBusy) return;
    if (hasCatalog && catalogOpen) {
      setCatalogOpen(false);
      return;
    }
    if (hasCatalog && !catalogOpen) {
      setCatalogOpen(true);
      return;
    }
    onFetchMore?.();
  };

  const moreLabel = catalogBusy
    ? "Fetching…"
    : hasCatalog && catalogOpen
      ? "Hide more"
      : hasCatalog && !catalogOpen
        ? "Show more"
        : "more";
  const moreIcon = catalogBusy
    ? "cloud-download-outline"
    : hasCatalog && catalogOpen
      ? "chevron-up"
      : hasCatalog && !catalogOpen
        ? "chevron-down"
        : "cloud-download-outline";

  const thumbUri =
    pack.poster ||
    pack.episodes.find((e) => e.poster || e.thumbnail)?.poster ||
    pack.episodes.find((e) => e.poster || e.thumbnail)?.thumbnail ||
    "";

  // Clean metadata matching Netflix design:
  // Downloading: "2 Episodes"
  // Completed: "2 Episodes | 175.4 MB"
  const epCountLabel = `${pack.episodes.length} Episode${pack.episodes.length === 1 ? "" : "s"}`;
  const sizeLabel = bytes ? formatBytes(bytes) : "";
  const subtitleLine1 = isDownloading
    ? epCountLabel
    : [epCountLabel, sizeLabel].filter(Boolean).join(" | ");

  const onLongPress = () => {
    Alert.alert(
      pack.title,
      `Delete all ${pack.episodes.length} downloaded episodes?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete all", style: "destructive", onPress: onDeleteAll },
      ]
    );
  };

  return (
    <View style={styles.netflixRowWrapper}>
      <Pressable
        style={({ pressed }) => [
          styles.netflixRow,
          pressed && styles.netflixRowPressed,
        ]}
        onPress={onToggle}
        onLongPress={onLongPress}
        android_ripple={{ color: "rgba(255,255,255,0.08)" }}
      >
        <View style={styles.netflixThumbWrap}>
          {thumbUri ? (
            <Image
              source={{ uri: thumbUri }}
              style={styles.netflixThumb}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
          ) : (
            <View style={[styles.netflixThumb, styles.netflixThumbEmpty]}>
              <Ionicons name="tv-outline" size={24} color={colors.muted} />
            </View>
          )}
          {isDownloading || isPaused ? (
            <View style={styles.thumbProgressTrack}>
              <View style={[styles.thumbProgressFill, { width: `${avgPct}%` }]} />
            </View>
          ) : null}
        </View>

        <View style={styles.netflixCopy}>
          <Text style={styles.netflixTitle} numberOfLines={1}>
            {pack.title}
          </Text>
          <Text style={styles.netflixMeta} numberOfLines={1}>
            {subtitleLine1}
          </Text>
          {isDownloading ? (
            <Text style={styles.netflixStatusDownloading}>
              Downloading{packEta ? ` · ${packEta}` : avgPct > 0 ? ` · ${avgPct}%` : ""}
            </Text>
          ) : isPaused ? (
            <Text style={styles.netflixStatusPaused}>Paused</Text>
          ) : isFailed ? (
            <Text style={styles.netflixStatusFailed}>Download failed</Text>
          ) : null}
        </View>

        <Ionicons
          name={vaultMode && expanded ? "chevron-down" : "chevron-forward"}
          size={20}
          color="#ffffff"
          style={styles.netflixChevron}
        />
      </Pressable>

      {expanded ? (
        <View style={styles.epList}>
          {!vaultMode ? (
            <View style={styles.packTools}>
              <Text style={styles.packToolsLabel}>Episodes</Text>
              <View style={styles.packToolsActions}>
                <Pressable
                  onPress={onMorePress}
                  disabled={catalogBusy}
                  hitSlop={8}
                  style={styles.moreBtn}
                >
                  <Ionicons
                    name={moreIcon}
                    size={14}
                    color={colors.accent}
                  />
                  <Text style={styles.moreBtnText}>{moreLabel}</Text>
                </Pressable>
                <Pressable onPress={onDeleteAll} hitSlop={8}>
                  <Text style={styles.deleteAll}>Delete all</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.packTools}>
              <Text style={styles.packToolsLabel}>Sealed episodes</Text>
              <Pressable onPress={onDeleteAll} hitSlop={8}>
                <Text style={styles.deleteAll}>Delete all</Text>
              </Pressable>
            </View>
          )}

          {!vaultMode && catalog?.error ? (
            <Text style={styles.catalogError}>{catalog.error}</Text>
          ) : null}

          {!vaultMode && hasCatalog && catalogOpen ? (
            <View style={styles.seasonCatalog}>
              <View style={styles.catalogHead}>
                <Text style={[styles.catalogHint, { flex: 1 }]}>
                  From server — tap a season to queue all missing episodes (720p)
                </Text>
                <Pressable onPress={() => setCatalogOpen(false)} hitSlop={8}>
                  <Text style={styles.hideMoreText}>Hide</Text>
                </Pressable>
              </View>
              {remoteSeasons.map((s) => {
                const se = s.season;
                const count = s.episode_count || (s.episodes || []).length || 0;
                const missing = (s.episodes || []).filter(
                  (ep) =>
                    !isEpisodeCovered({
                      subjectId: pack.subjectId,
                      detailPath: pack.detailPath,
                      se: ep.se ?? se,
                      ep: ep.ep,
                    })
                ).length;
                return (
                  <View key={`remote-se-${se}`} style={styles.seasonBlock}>
                    <View style={styles.seasonRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.seasonTitle}>Season {se}</Text>
                        <Text style={styles.seasonSub}>
                          {count} episode{count === 1 ? "" : "s"}
                          {missing
                            ? ` · ${missing} not downloaded`
                            : " · all queued"}
                        </Text>
                      </View>
                      <Pressable
                        style={[
                          styles.seasonDlBtn,
                          missing === 0 && styles.seasonDlBtnDisabled,
                        ]}
                        disabled={missing === 0}
                        onPress={() => onDownloadSeason(se)}
                      >
                        <Ionicons
                          name="download-outline"
                          size={14}
                          color={colors.accentInk}
                        />
                        <Text style={styles.seasonDlText}>Download</Text>
                      </Pressable>
                    </View>
                    <View style={styles.remoteEpGrid}>
                      {(s.episodes || []).map((ep) => {
                        const covered = isEpisodeCovered({
                          subjectId: pack.subjectId,
                          detailPath: pack.detailPath,
                          se: ep.se ?? se,
                          ep: ep.ep,
                        });
                        return (
                          <Pressable
                            key={`remote-${se}-${ep.ep}`}
                            style={[
                              styles.remoteEpChip,
                              covered && styles.remoteEpChipDone,
                            ]}
                            disabled={covered}
                            onPress={() =>
                              onDownloadEpisode(ep.se ?? se, ep.ep)
                            }
                          >
                            <Text
                              style={[
                                styles.remoteEpText,
                                covered && styles.remoteEpTextDone,
                              ]}
                            >
                              E{ep.ep}
                            </Text>
                            {!covered ? (
                              <Ionicons
                                name="download-outline"
                                size={11}
                                color={colors.accent}
                              />
                            ) : (
                              <Ionicons
                                name="checkmark"
                                size={11}
                                color={colors.accent}
                              />
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

          {pack.episodes.map((item) => (
            <EpisodeRow
              key={item.id}
              item={item}
              watchMap={watchMap}
              onPlay={onPlay}
              onPause={onPause}
              onResume={onResume}
              onDelete={onDelete}
              onRestoreFromVault={onRestoreFromVault}
              vaultMode={vaultMode}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

export default function DownloadsScreen() {
  const router = useRouter();
  const { expand: expandParam, tab: tabParam } = useLocalSearchParams();
  const expandKey = expandParam ? decodeURIComponent(String(expandParam)) : "";
  const requestedTab =
    tabParam === "series" || tabParam === "songs" ? tabParam : "movies";
  const [list, setList] = useState([]);
  const [songs, setSongs] = useState([]);
  const [watchEntries, setWatchEntries] = useState([]);
  const [tab, setTab] = useState(requestedTab);
  const [stats, setStats] = useState({ used: 0, free: 0, count: 0 });
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState({});
  // Catalog cache by pack key
  const [catalogByPack, setCatalogByPack] = useState({});
  const [catalogBusyKey, setCatalogBusyKey] = useState(null);
  const [dlSheet, setDlSheet] = useState(null);
  const [vaultMode, setVaultMode] = useState(false);
  const [vaultUnlocked, setVaultUnlocked] = useState(isVaultUnlocked());
  const [vaultModal, setVaultModal] = useState(null); // 'setup' | 'unlock' | null
  const [vaultImportOpen, setVaultImportOpen] = useState(false);
  const [vaultBusy, setVaultBusy] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const storageTaps = useRef({ count: 0, at: 0 });

  useEffect(() => subscribeVault(setVaultUnlocked), []);
  useEffect(() => subscribeWatchProgress(setWatchEntries), []);
  useEffect(() => {
    setTab(requestedTab);
  }, [requestedTab]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        lockVault();
        setVaultMode(false);
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    let alive = true;
    hydrateDownloads().catch(() => { });
    hydrateMusicDownloads().catch(() => { });
    const unsub = subscribeDownloads((next) => {
      if (!alive) return;
      setList(next);
    });
    const unsubMusic = subscribeMusicDownloads((next) => {
      if (!alive) return;
      setSongs(next);
    });
    return () => {
      alive = false;
      unsub();
      unsubMusic();
    };
  }, []);

  // Live "Used" from in-memory progress (updates while downloading).
  const usedBytes = useMemo(() => {
    let used = 0;
    for (const d of list) used += Number(d.bytesWritten || d.sizeHint || 0) || 0;
    for (const d of songs) used += Number(d.bytesWritten || 0) || 0;
    return used;
  }, [list, songs]);

  const fileCount = list.length + songs.length;
  const watchMap = useMemo(
    () => new Map(watchEntries.map((entry) => [entry.key, entry])),
    [watchEntries]
  );

  const refreshStats = useCallback(async () => {
    const s = await getStorageStats();
    setStats((prev) => ({
      used: usedBytes || s.used || 0,
      free: s.free,
      count: fileCount || s.count || 0,
      // keep previous free if probe fails
      ...(s.free ? {} : { free: prev.free || 0 }),
    }));
  }, [usedBytes, fileCount]);

  // Keep Used in sync with download progress; refresh free space less often.
  useEffect(() => {
    setStats((prev) => ({
      ...prev,
      used: usedBytes,
      count: fileCount,
    }));
  }, [usedBytes, fileCount]);

  useEffect(() => {
    const t = setTimeout(() => {
      refreshStats().catch(() => { });
    }, 400);
    return () => clearTimeout(t);
  }, [list.length, songs.length, refreshStats]);

  // While anything is actively downloading, refresh free space periodically.
  const hasActiveDl = useMemo(
    () =>
      list.some(
        (d) =>
          d.pending ||
          d.status === "downloading" ||
          d.status === "queued"
      ) ||
      songs.some(
        (d) => d.status === "downloading" || d.status === "queued"
      ),
    [list, songs]
  );

  useEffect(() => {
    if (!hasActiveDl) return;
    const id = setInterval(() => {
      refreshStats().catch(() => { });
    }, 2500);
    return () => clearInterval(id);
  }, [hasActiveDl, refreshStats]);

  const preparingId = list.find((d) => d.pending)?.id;
  useEffect(() => {
    if (!preparingId) return;
    const preparing = list.find((d) => d.id === preparingId);
    if (!preparing) return;
    setTab(isSeriesItem(preparing) ? "series" : "movies");
    if (isSeriesItem(preparing)) {
      const key = `${preparing.subjectId}|${preparing.detailPath}`;
      setExpanded((prev) => ({ ...prev, [key]: true }));
    }
  }, [preparingId]);

  useEffect(() => {
    if (!expandKey || !list.length) return;
    const match = list.find(
      (d) => `${d.subjectId}|${d.detailPath}` === expandKey
    );
    if (!match) return;
    setTab(isSeriesItem(match) ? "series" : "movies");
    if (isSeriesItem(match)) {
      setExpanded((prev) => ({ ...prev, [expandKey]: true }));
    }
  }, [expandKey, list.length]);

  const visibleList = useMemo(
    () => list.filter((d) => (vaultMode ? d.inVault : !d.inVault)),
    [list, vaultMode]
  );

  const movies = useMemo(
    () => visibleList.filter((d) => !isSeriesItem(d)),
    [visibleList]
  );

  const seriesPacks = useMemo(() => {
    const map = new Map();
    for (const d of visibleList.filter(isSeriesItem)) {
      const key = `${d.subjectId}|${d.detailPath}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          title: d.title,
          poster: d.poster,
          subjectId: d.subjectId,
          detailPath: d.detailPath,
          episodes: [],
        });
      }
      const pack = map.get(key);
      if (!pack.poster && d.poster) pack.poster = d.poster;
      pack.episodes.push(d);
    }
    for (const pack of map.values()) {
      pack.episodes.sort((a, b) => {
        const se = Number(a.se) - Number(b.se);
        if (se !== 0) return se;
        return Number(a.ep) - Number(b.ep);
      });
    }
    return [...map.values()].sort((a, b) => {
      const latestA = Math.max(...a.episodes.map((e) => e.updatedAt || 0));
      const latestB = Math.max(...b.episodes.map((e) => e.updatedAt || 0));
      return latestB - latestA;
    });
  }, [visibleList]);

  const onStorageTap = async () => {
    const now = Date.now();
    if (now - storageTaps.current.at > 2500) {
      storageTaps.current = { count: 1, at: now };
      return;
    }
    storageTaps.current.count += 1;
    storageTaps.current.at = now;
    if (storageTaps.current.count < 5) return;
    storageTaps.current = { count: 0, at: 0 };

    if (vaultUnlocked) {
      setVaultMode(true);
      return;
    }
    const mode = await resolveVaultModalMode();
    setVaultModal(mode);
  };

  const onVaultUnlocked = () => {
    setVaultMode(true);
    if (tab === "songs") setTab("movies");
  };

  const lockAndExit = () => {
    lockVault();
    setVaultMode(false);
    setVaultImportOpen(false);
  };

  const onRestoreFromVault = async (item) => {
    if (vaultBusy) return;
    try {
      setVaultBusy(true);
      await moveDownloadFromVault(item.id);
      Alert.alert("Restored", "Back in normal Downloads.");
    } catch (err) {
      Alert.alert(
        "Vault",
        toUserMessage(err, "Couldn’t restore from vault. Try again.")
      );
    } finally {
      setVaultBusy(false);
    }
  };

  const onImportToVault = async (ids) => {
    if (vaultBusy || !ids?.length) return;
    setVaultImportOpen(false);
    try {
      setVaultBusy(true);
      const { moved, failed } = await moveDownloadsToVault(ids);
      if (failed.length && moved.length) {
        Alert.alert(
          "Partially imported",
          `${moved.length} moved to vault. ${failed.length} skipped (file missing — re-download those first).`
        );
      } else if (failed.length) {
        Alert.alert(
          "Import",
          failed[0]?.message ||
          "File missing on disk. Re-download the title, then import again."
        );
      } else {
        Alert.alert(
          "Added to vault",
          moved.length === 1
            ? "Hidden from Downloads. Only visible here in Movie Safe."
            : `${moved.length} titles moved into Movie Safe.`
        );
      }
    } catch (err) {
      Alert.alert(
        "Import",
        toUserMessage(err, "Couldn’t import into the vault. Try again.")
      );
    } finally {
      setVaultBusy(false);
    }
  };

  const onPlay = (item) => {
    const isCompleted = item.status === "completed" && !item.pending;
    router.push({
      pathname: "/play",
      params: {
        subjectId: item.subjectId,
        detail_path: item.detailPath,
        se: item.se,
        ep: item.ep,
        title:
          isSeriesItem(item)
            ? `${item.title} · S${item.se}E${item.ep}`
            : item.title,
        poster: item.poster || "",
        kind: isSeriesItem(item) ? "series" : "movie",
        autoplay: "1",
        ...(isCompleted ? { downloadId: encodeURIComponent(item.id) } : {}),
      },
    });
  };

  const onPlaySong = async (item) => {
    const track = {
      id: item.id,
      name: item.name,
      artist: item.artist,
      album: item.album,
      image: item.image,
      duration_ms: item.duration_ms,
      stream_url: item.fileUri,
      preview_url: item.fileUri,
    };
    const queue = songs
      .filter((d) => d.status === "completed")
      .map((d) => ({
        id: d.id,
        name: d.name,
        artist: d.artist,
        album: d.album,
        image: d.image,
        duration_ms: d.duration_ms,
        stream_url: d.fileUri,
        preview_url: d.fileUri,
      }));
    openMusicPlayer();
    const result = await playTrack(track, queue.length ? queue : [track]);
    if (!result.ok && result.error) {
      Alert.alert("Can't play", result.error);
    }
  };

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
        Alert.alert(
          "Retry failed",
          toUserMessage(err, "Couldn't restart download. Check your connection.")
        );
      }
      return;
    }
    resumeDownload(item.id);
  };

  const onDelete = (item) => {
    Alert.alert(
      "Remove download",
      isSeriesItem(item)
        ? `Delete S${item.se}E${item.ep} (${qualityLabel(item)})?`
        : `Delete “${item.title}” (${qualityLabel(item)})?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => removeDownload(item.id),
        },
      ]
    );
  };

  const onDeletePack = (pack) => {
    Alert.alert(
      "Delete series downloads",
      `Remove all ${pack.episodes.length} downloaded episodes of “${pack.title}”?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete all",
          style: "destructive",
          onPress: () => {
            pack.episodes.forEach((e) => removeDownload(e.id));
          },
        },
      ]
    );
  };

  const onFetchMore = async (pack) => {
    setCatalogBusyKey(pack.key);
    try {
      const data = await fetchSeasonCatalog(pack.detailPath);
      setCatalogByPack((prev) => ({
        ...prev,
        [pack.key]: { seasons: data.seasons || [] },
      }));
      if (!(data.seasons || []).length) {
        Alert.alert("No episodes", "Server returned no seasons for this title.");
      }
    } catch (err) {
      const friendly = toUserMessage(
        err,
        "Couldn't load episodes. Check your connection and try again."
      );
      setCatalogByPack((prev) => ({
        ...prev,
        [pack.key]: {
          seasons: prev[pack.key]?.seasons || [],
          error: friendly,
        },
      }));
      Alert.alert("Couldn't load", friendly);
    } finally {
      setCatalogBusyKey(null);
    }
  };

  const onDownloadSeason = (pack, season) => {
    const catalog = catalogByPack[pack.key];
    const seasonRow = (catalog?.seasons || []).find(
      (s) => String(s.season) === String(season)
    );
    const first = seasonRow?.episodes?.[0];
    setDlSheet({
      mode: "season",
      subjectId: pack.subjectId,
      detailPath: pack.detailPath,
      title: pack.title,
      poster: pack.poster,
      se: String(first?.se ?? season),
      ep: String(first?.ep ?? 1),
      season,
      kind: "series",
    });
  };

  const onDownloadEpisode = (pack, se, ep) => {
    setDlSheet({
      mode: "single",
      subjectId: pack.subjectId,
      detailPath: pack.detailPath,
      title: pack.title,
      poster: pack.poster,
      se: String(se),
      ep: String(ep),
      season: null,
      kind: "series",
    });
  };

  const togglePack = (key) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([hydrateDownloads(), hydrateMusicDownloads()]);
    await refreshStats();
    setRefreshing(false);
  };

  const empty = vaultMode
    ? movies.length === 0 && seriesPacks.length === 0
    : tab === "movies"
      ? movies.length === 0
      : tab === "series"
        ? seriesPacks.length === 0
        : songs.length === 0;

  const emptyCopy =
    vaultMode
      ? {
        title: "Vault is empty",
        hint: "Tap Import, pick finished downloads, then Add. They leave Downloads and stay only here.",
      }
      : tab === "movies"
        ? {
          title: "No movie downloads",
          hint: "Open a title and tap Download to pick a quality.",
        }
        : tab === "series"
          ? {
            title: "No series downloads",
            hint: "Open a show and tap Download season, or download episodes one by one.",
          }
          : {
            title: "No song downloads",
            hint: "Open Songs, tap the download icon on a track, then find it here under Songs.",
          };

  return (
    <Screen title={vaultMode ? "Movie Safe" : "Downloads"}>
      <Pressable style={styles.storageCard} onPress={onStorageTap}>
        <View style={styles.storageIcon}>
          <Ionicons
            name={vaultMode ? "shield-checkmark" : "cloud-download-outline"}
            size={18}
            color={colors.accent}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.storageTitle}>
            {vaultMode ? "Movie Safe · unlocked" : "Device storage"}
          </Text>
          <Text style={styles.storageText}>
            {vaultMode
              ? "Import downloads here · Lock when you leave"
              : `Used ${formatBytes(usedBytes || stats.used)}${stats.free ? ` · Free ${formatBytes(stats.free)}` : ""
              }${fileCount || stats.count ? ` · ${fileCount || stats.count} files` : ""}`}
          </Text>
        </View>
        {vaultMode ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Pressable
              onPress={() => setVaultImportOpen(true)}
              hitSlop={8}
              style={styles.importBtn}
            >
              <Ionicons name="add" size={16} color={colors.accentInk} />
              <Text style={styles.importBtnText}>Import</Text>
            </Pressable>
            <Pressable
              onPress={lockAndExit}
              hitSlop={10}
              style={styles.lockIconBtn}
              accessibilityLabel="Lock vault"
            >
              <Ionicons name="exit-outline" size={18} color={colors.danger} />
            </Pressable>
          </View>
        ) : (
          <Pressable
            onPress={() => setSettingsModalOpen(true)}
            hitSlop={10}
            style={styles.settingsIconBtn}
            accessibilityLabel="Download settings"
          >
            <Ionicons name="settings-outline" size={18} color={colors.text} />
          </Pressable>
        )}
      </Pressable>

      {!vaultMode ? (
        <View style={styles.tabs}>
          <Pressable
            style={[styles.tab, tab === "movies" && styles.tabOn]}
            onPress={() => setTab("movies")}
          >
            <Ionicons
              name="film-outline"
              size={15}
              color={tab === "movies" ? colors.accentInk : colors.muted}
            />
            <Text style={[styles.tabText, tab === "movies" && styles.tabTextOn]}>
              Movies
            </Text>
            {movies.length ? (
              <View style={[styles.countPill, tab === "movies" && styles.countPillOn]}>
                <Text
                  style={[styles.countText, tab === "movies" && styles.countTextOn]}
                >
                  {movies.length}
                </Text>
              </View>
            ) : null}
          </Pressable>
          <Pressable
            style={[styles.tab, tab === "series" && styles.tabOn]}
            onPress={() => setTab("series")}
          >
            <Ionicons
              name="tv-outline"
              size={15}
              color={tab === "series" ? colors.accentInk : colors.muted}
            />
            <Text style={[styles.tabText, tab === "series" && styles.tabTextOn]}>
              Series
            </Text>
            {seriesPacks.length ? (
              <View style={[styles.countPill, tab === "series" && styles.countPillOn]}>
                <Text
                  style={[styles.countText, tab === "series" && styles.countTextOn]}
                >
                  {seriesPacks.length}
                </Text>
              </View>
            ) : null}
          </Pressable>
          <Pressable
            style={[styles.tab, tab === "songs" && styles.tabOn]}
            onPress={() => setTab("songs")}
          >
            <Ionicons
              name="musical-notes-outline"
              size={15}
              color={tab === "songs" ? colors.accentInk : colors.muted}
            />
            <Text style={[styles.tabText, tab === "songs" && styles.tabTextOn]}>
              Songs
            </Text>
            {songs.length ? (
              <View style={[styles.countPill, tab === "songs" && styles.countPillOn]}>
                <Text
                  style={[styles.countText, tab === "songs" && styles.countTextOn]}
                >
                  {songs.length}
                </Text>
              </View>
            ) : null}
          </Pressable>
        </View>
      ) : (
        <View style={styles.tabs}>
          <Pressable
            style={[styles.tab, tab === "movies" && styles.tabOn]}
            onPress={() => setTab("movies")}
          >
            <Ionicons
              name="film-outline"
              size={15}
              color={tab === "movies" ? colors.accentInk : colors.muted}
            />
            <Text style={[styles.tabText, tab === "movies" && styles.tabTextOn]}>
              Movies
            </Text>
            {movies.length ? (
              <View style={[styles.countPill, tab === "movies" && styles.countPillOn]}>
                <Text
                  style={[styles.countText, tab === "movies" && styles.countTextOn]}
                >
                  {movies.length}
                </Text>
              </View>
            ) : null}
          </Pressable>
          <Pressable
            style={[styles.tab, tab === "series" && styles.tabOn]}
            onPress={() => setTab("series")}
          >
            <Ionicons
              name="tv-outline"
              size={15}
              color={tab === "series" ? colors.accentInk : colors.muted}
            />
            <Text style={[styles.tabText, tab === "series" && styles.tabTextOn]}>
              Series
            </Text>
            {seriesPacks.length ? (
              <View style={[styles.countPill, tab === "series" && styles.countPillOn]}>
                <Text
                  style={[styles.countText, tab === "series" && styles.countTextOn]}
                >
                  {seriesPacks.length}
                </Text>
              </View>
            ) : null}
          </Pressable>
        </View>
      )}

      {empty ? (
        <EmptyState title={emptyCopy.title} hint={emptyCopy.hint} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.accent}
            />
          }
        >
          {(() => {
            const viewTab = vaultMode && tab === "songs" ? "movies" : tab;
            if (viewTab === "movies") {
              return movies.map((item) => (
                <MovieCard
                  key={item.id}
                  item={item}
                  watchMap={watchMap}
                  onPlay={onPlay}
                  onPause={onPause}
                  onResume={onResume}
                  onDelete={onDelete}
                  onRestoreFromVault={onRestoreFromVault}
                  vaultMode={vaultMode}
                />
              ));
            }
            if (viewTab === "series") {
              return seriesPacks.map((pack) => (
                <SeriesPack
                  key={pack.key}
                  pack={pack}
                  watchMap={watchMap}
                  expanded={!!expanded[pack.key]}
                  onToggle={() =>
                    vaultMode
                      ? togglePack(pack.key)
                      : router.push({
                        pathname: "/series-detail",
                        params: { packKey: encodeURIComponent(pack.key) },
                      })
                  }
                  onPlay={onPlay}
                  onPause={onPause}
                  onResume={onResume}
                  onDelete={onDelete}
                  onDeleteAll={() => onDeletePack(pack)}
                  onRestoreFromVault={onRestoreFromVault}
                  vaultMode={vaultMode}
                  catalog={vaultMode ? undefined : catalogByPack[pack.key]}
                  catalogBusy={catalogBusyKey === pack.key}
                  onFetchMore={() => onFetchMore(pack)}
                  onDownloadSeason={(se) => onDownloadSeason(pack, se)}
                  onDownloadEpisode={(se, ep) =>
                    onDownloadEpisode(pack, se, ep)
                  }
                />
              ));
            }
            return songs.map((item) => (
              <SongCard
                key={item.id}
                item={item}
                onPlay={onPlaySong}
                onPause={(d) => pauseMusicDownload(d.id)}
                onResume={(d) => resumeMusicDownload(d.id)}
                onDelete={(d) => {
                  Alert.alert("Remove download", `Delete “${d.name}”?`, [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Delete",
                      style: "destructive",
                      onPress: () => removeMusicDownload(d.id),
                    },
                  ]);
                }}
              />
            ));
          })()}
        </ScrollView>
      )}
      <DownloadSheet
        visible={!!dlSheet}
        onClose={() => setDlSheet(null)}
        onStarted={() => setDlSheet(null)}
        subjectId={dlSheet?.subjectId || ""}
        detailPath={dlSheet?.detailPath || ""}
        title={dlSheet?.title || ""}
        poster={dlSheet?.poster || null}
        se={dlSheet?.se || "0"}
        ep={dlSheet?.ep || "0"}
        kind={dlSheet?.kind || "series"}
        mode={dlSheet?.mode || "single"}
        season={dlSheet?.season}
      />
      <VaultModal
        visible={!!vaultModal}
        mode={vaultModal || "unlock"}
        onClose={() => setVaultModal(null)}
        onUnlocked={onVaultUnlocked}
      />
      <VaultImportModal
        visible={vaultImportOpen}
        items={list}
        busy={vaultBusy}
        onClose={() => setVaultImportOpen(false)}
        onImport={onImportToVault}
      />
      <DownloadSettingsModal
        visible={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  storageCard: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    padding: 12,
    borderRadius: radii.md,
    backgroundColor: colors.panel,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  storageIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accentMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  storageTitle: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 13,
  },
  storageText: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 2,
  },
  lockBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.accent,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radii.pill,
  },
  lockBtnText: {
    color: colors.accentInk,
    fontWeight: "800",
    fontSize: 12,
  },
  lockIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.35)",
  },
  settingsIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(246, 240, 240, 0.06)",
    borderWidth: 1,
    borderColor: "rgba(246, 231, 231, 0.1)",
  },
  importBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.accent,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.pill,
  },
  importBtnText: {
    color: colors.accentInk,
    fontWeight: "800",
    fontSize: 12,
  },
  tabs: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: radii.pill,
    backgroundColor: colors.panel,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  tabOn: {
    backgroundColor: colors.accent,
  },
  tabText: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 12,
  },
  tabTextOn: {
    color: colors.accentInk,
  },
  countPill: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  countPillOn: {
    backgroundColor: "rgba(4, 20, 12, 0.2)",
  },
  countText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
  },
  countTextOn: {
    color: colors.accentInk,
  },
  list: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl + 24,
  },
  netflixRowWrapper: {
    width: "100%",
  },
  netflixRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
  },
  netflixRowPressed: {
    opacity: 0.72,
  },
  netflixThumbWrap: {
    width: 126,
    height: 71,
    borderRadius: 6,
    overflow: "hidden",
    backgroundColor: colors.panelSoft,
    position: "relative",
  },
  netflixMusicThumbWrap: {
    width: 68,
    height: 68,
    borderRadius: 6,
    overflow: "hidden",
    backgroundColor: colors.panelSoft,
    position: "relative",
  },
  netflixThumb: {
    width: "100%",
    height: "100%",
  },
  netflixThumbEmpty: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.panelSoft,
  },
  thumbProgressTrack: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
  },
  thumbProgressFill: {
    height: "100%",
    backgroundColor: colors.accentLight,
  },
  netflixCopy: {
    flex: 1,
    marginHorizontal: 14,
    justifyContent: "center",
  },
  netflixTitle: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 20,
  },
  netflixMeta: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 3,
    lineHeight: 17,
  },
  netflixStatusDownloading: {
    color: colors.accentLight,
    fontSize: 13,
    fontWeight: "500",
    marginTop: 3,
  },
  netflixStatusPaused: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 3,
  },
  netflixStatusFailed: {
    color: colors.danger,
    fontSize: 13,
    marginTop: 3,
  },
  netflixChevron: {
    opacity: 0.75,
  },
  netflixActionWrap: {
    paddingLeft: 4,
    justifyContent: "center",
    alignItems: "center",
  },
  circleActionBtn: {
    padding: 4,
  },
  pack: {
    backgroundColor: colors.panel,
    borderRadius: radii.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.line,
  },
  packHead: {
    flexDirection: "row",
    gap: 12,
    padding: 12,
    alignItems: "flex-start",
  },
  poster: {
    width: 64,
    height: 96,
    borderRadius: radii.sm,
    backgroundColor: colors.panelSoft,
  },
  posterProgress: {
    borderRadius: radii.sm,
  },
  posterEmpty: {
    alignItems: "center",
    justifyContent: "center",
  },
  songArt: {
    width: 72,
    height: 72,
    borderRadius: radii.sm,
    backgroundColor: colors.panelSoft,
  },
  songArtist: {
    color: colors.muted,
    fontSize: 12,
    marginBottom: 4,
  },
  packCopy: {
    flex: 1,
    minWidth: 0,
  },
  packTitle: {
    color: colors.text,
    fontWeight: "800",
    fontSize: 15,
    lineHeight: 20,
  },
  packSub: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 4,
    lineHeight: 16,
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8,
  },
  qBadge: {
    backgroundColor: colors.accentMuted,
    borderRadius: radii.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  qBadgeText: {
    color: colors.accent,
    fontWeight: "800",
    fontSize: 11,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "700",
  },
  epMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
    flexWrap: "wrap",
  },
  epList: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingBottom: 6,
  },
  packTools: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 4,
  },
  packToolsActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  moreBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  moreBtnText: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: "700",
  },
  catalogError: {
    color: colors.danger,
    fontSize: 12,
    paddingHorizontal: 12,
    paddingBottom: 6,
  },
  seasonCatalog: {
    paddingHorizontal: 12,
    paddingBottom: 10,
    gap: 10,
  },
  catalogHint: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 15,
  },
  catalogHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  hideMoreText: {
    color: colors.accentLight,
    fontWeight: "700",
    fontSize: 12,
  },
  seasonBlock: {
    backgroundColor: colors.panelSoft,
    borderRadius: radii.sm,
    padding: 10,
    gap: 8,
  },
  seasonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  seasonTitle: {
    color: colors.text,
    fontWeight: "800",
    fontSize: 13,
  },
  seasonSub: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 2,
  },
  seasonDlBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.accent,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: radii.sm,
  },
  seasonDlBtnDisabled: {
    opacity: 0.45,
  },
  seasonDlText: {
    color: colors.accentInk,
    fontWeight: "800",
    fontSize: 12,
  },
  remoteEpGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  remoteEpChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: radii.sm,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
  },
  remoteEpChipDone: {
    borderColor: colors.accentBorder,
    backgroundColor: colors.accentMuted,
  },
  remoteEpText: {
    color: colors.text,
    fontSize: 11,
    fontWeight: "700",
  },
  remoteEpTextDone: {
    color: colors.accent,
  },
  packToolsLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  deleteAll: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: "700",
  },
  epRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  epLeft: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  epTitle: {
    color: colors.text,
    fontWeight: "800",
    fontSize: 14,
  },
  watchBadgeBorder: {
    alignSelf: "flex-start",
    borderRadius: 5,
  },
  watchedText: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: "700",
  },
  epSize: {
    color: colors.muted,
    fontSize: 11,
  },
  partialHint: {
    color: colors.muted,
    fontSize: 10,
    fontStyle: "italic",
    paddingHorizontal: 12,
    paddingBottom: 6,
  },
  epActions: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
  },
  progressTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.12)",
    overflow: "hidden",
  },
  progressFill: {
    height: 3,
    backgroundColor: colors.accent,
  },
  iconAct: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  iconGhost: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  playWide: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.accent,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.pill,
  },
  playWideText: {
    color: colors.accentInk,
    fontWeight: "800",
    fontSize: 13,
  },
});
