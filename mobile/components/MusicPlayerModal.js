import { useEffect, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import Constants from "expo-constants";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  bumpVolume,
  cycleRepeat,
  playNext,
  playPrev,
  seekTo,
  subscribeMusicPlayer,
  toggleLike,
  togglePlayPause,
  toggleShuffle,
} from "../lib/musicPlayer";
import {
  enqueueMusicDownload,
  getMusicDownloadById,
  musicDownloadProgress,
  pauseMusicDownload,
  removeMusicDownload,
  resumeMusicDownload,
  subscribeMusicDownloads,
} from "../lib/musicDownloads";
import { colors, radii, spacing } from "../lib/theme";

function formatTime(sec) {
  const n = Math.max(0, Math.floor(Number(sec) || 0));
  const m = Math.floor(n / 60);
  const s = String(n % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function ProgressBar({ position, duration, onSeek }) {
  const { width } = useWindowDimensions();
  const barW = Math.min(width - 48, 420);
  const pct = duration > 0 ? Math.min(1, position / duration) : 0;

  return (
    <View style={styles.progressWrap}>
      <Pressable
        style={[styles.progressTrack, { width: barW }]}
        onPress={(e) => {
          if (!duration || !onSeek) return;
          const x = e.nativeEvent.locationX;
          onSeek((x / barW) * duration);
        }}
      >
        <View style={[styles.progressFill, { width: `${pct * 100}%` }]} />
        <View style={[styles.progressKnob, { left: `${pct * 100}%` }]} />
      </Pressable>
      <View style={[styles.timeRow, { width: barW }]}>
        <Text style={styles.time}>{formatTime(position)}</Text>
        <Text style={styles.time}>{formatTime(duration)}</Text>
      </View>
    </View>
  );
}

function VolumeButtons({ volume, onMinus, onPlus }) {
  const pct = Math.round((Number(volume) || 0) * 100);
  return (
    <View style={styles.volRow}>
      <Pressable onPress={onMinus} style={styles.volBtn} hitSlop={8}>
        <Ionicons name="remove" size={22} color={colors.text} />
      </Pressable>
      <View style={styles.volLabelBox}>
        <Ionicons name="volume-medium" size={18} color={colors.muted} />
        <Text style={styles.volPct}>{pct}%</Text>
      </View>
      <Pressable onPress={onPlus} style={styles.volBtn} hitSlop={8}>
        <Ionicons name="add" size={22} color={colors.text} />
      </Pressable>
    </View>
  );
}

export default function MusicPlayerModal({ visible, onClose }) {
  const insets = useSafeAreaInsets();
  const [state, setState] = useState({
    track: null,
    playing: false,
    shuffle: false,
    repeatMode: "off",
    volume: 1,
    position: 0,
    duration: 0,
    liked: false,
  });
  const [download, setDownload] = useState(null);

  useEffect(() => subscribeMusicPlayer(setState), []);

  useEffect(() => {
    return subscribeMusicDownloads(() => {
      const id = state.track?.id;
      setDownload(id ? getMusicDownloadById(id) : null);
    });
  }, [state.track?.id]);

  useEffect(() => {
    setDownload(state.track?.id ? getMusicDownloadById(state.track.id) : null);
  }, [state.track?.id]);

  const onDownload = async () => {
    const track = state.track;
    if (!track?.id) return;
    try {
      const dl = getMusicDownloadById(track.id);
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
      await resumeMusicDownload(track.id);
    } catch {
      /* ignore */
    }
  };

  const t = state.track;
  if (!visible) return null;

  const repeatIcon =
    state.repeatMode === "one"
      ? "repeat"
      : state.repeatMode === "all"
        ? "repeat"
        : "repeat-outline";

  const dl = download || (t?.id ? getMusicDownloadById(t.id) : null);
  const dlPct =
    dl && dl.status !== "completed" && musicDownloadProgress(dl) > 0
      ? Math.round(musicDownloadProgress(dl) * 100)
      : null;
  const dlIcon =
    dl?.status === "completed"
      ? "checkmark-circle"
      : dl?.status === "downloading" || dl?.status === "queued"
        ? "cloud-download"
        : dl?.status === "paused"
          ? "pause-circle-outline"
          : dl?.status === "failed"
            ? "alert-circle-outline"
            : "download-outline";
  const dlLabel =
    dl?.status === "completed"
      ? "Downloaded"
      : dlPct != null
        ? `${dlPct}%`
        : dl?.status === "paused"
          ? "Resume"
          : dl?.status === "failed"
            ? "Retry"
            : "Download";
  const dlColor =
    dl?.status === "completed"
      ? colors.secondary
      : dl?.status === "failed"
        ? colors.danger
        : colors.text;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.page, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.topBar}>
          <Pressable onPress={onClose} hitSlop={10} style={styles.topBtn}>
            <Ionicons name="chevron-down" size={28} color={colors.text} />
          </Pressable>
          <Text style={styles.topLabel}>Now playing</Text>
          <View style={styles.topBtn} />
        </View>

        <View style={styles.artWrap}>
          {t?.image ? (
            <Image source={{ uri: t.image }} style={styles.art} contentFit="cover" />
          ) : (
            <View style={[styles.art, styles.artEmpty]}>
              <Ionicons name="musical-notes" size={64} color={colors.muted} />
            </View>
          )}
        </View>

        <View style={styles.meta}>
          <Text style={styles.title} numberOfLines={2}>
            {t?.name || "Nothing playing"}
          </Text>
          <Text style={styles.artist} numberOfLines={1}>
            {t?.artist || "—"}
          </Text>
        </View>

        <ProgressBar
          position={state.position}
          duration={state.duration}
          onSeek={(sec) => seekTo(sec)}
        />

        <View style={styles.controls}>
          <Pressable onPress={() => toggleShuffle()} style={styles.sideBtn}>
            <Ionicons
              name="shuffle"
              size={22}
              color={state.shuffle ? colors.secondary : colors.muted}
            />
          </Pressable>

          <Pressable onPress={() => playPrev()} style={styles.sideBtn}>
            <Ionicons name="play-skip-back" size={32} color={colors.text} />
          </Pressable>

          <Pressable onPress={() => togglePlayPause()} style={styles.playBtn}>
            <Ionicons
              name={state.playing ? "pause" : "play"}
              size={36}
              color={colors.accentInk}
            />
          </Pressable>

          <Pressable onPress={() => playNext()} style={styles.sideBtn}>
            <Ionicons name="play-skip-forward" size={32} color={colors.text} />
          </Pressable>

          <Pressable onPress={() => cycleRepeat()} style={styles.sideBtn}>
            <Ionicons
              name={repeatIcon}
              size={22}
              color={state.repeatMode === "off" ? colors.muted : colors.secondary}
            />
            {state.repeatMode === "one" ? (
              <Text style={styles.oneBadge}>1</Text>
            ) : null}
          </Pressable>
        </View>

        <View style={styles.extraRow}>
          <Pressable onPress={() => toggleLike()} style={styles.extraBtn}>
            <Ionicons
              name={state.liked ? "heart" : "heart-outline"}
              size={26}
              color={state.liked ? colors.danger : colors.text}
            />
            <Text style={styles.extraLabel}>{state.liked ? "Liked" : "Like"}</Text>
          </Pressable>
          <Pressable onPress={onDownload} style={styles.extraBtn} disabled={!t?.id}>
            <Ionicons name={dlIcon} size={26} color={dlColor} />
            <Text style={styles.extraLabel}>{dlLabel}</Text>
          </Pressable>
        </View>

        <VolumeButtons
          volume={state.volume}
          onMinus={() => bumpVolume(-0.1)}
          onPlus={() => bumpVolume(0.1)}
        />

        <Text style={styles.hint}>
          {Constants.appOwnership === "expo"
            ? "Full screen-off / lock-screen playback needs a native build (npx expo run:android)"
            : "Keeps playing with the screen off · lock-screen controls enabled"}
        </Text>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.md,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  topBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  topLabel: {
    flex: 1,
    textAlign: "center",
    color: colors.muted,
    fontWeight: "700",
    fontSize: 13,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  artWrap: { alignItems: "center", marginVertical: spacing.md },
  art: {
    width: "88%",
    aspectRatio: 1,
    borderRadius: radii.lg,
    backgroundColor: colors.panel,
    maxWidth: 360,
  },
  artEmpty: { alignItems: "center", justifyContent: "center" },
  meta: { alignItems: "center", gap: 6, marginBottom: spacing.md, paddingHorizontal: 8 },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center",
  },
  artist: { color: colors.muted, fontSize: 15 },
  progressWrap: { alignItems: "center", marginBottom: spacing.md },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.panelSoft,
    overflow: "visible",
    justifyContent: "center",
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.secondary,
  },
  progressKnob: {
    position: "absolute",
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.text,
    marginLeft: -7,
    top: -4,
  },
  timeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  time: { color: colors.muted, fontSize: 11, fontWeight: "600" },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 18,
    marginVertical: spacing.md,
  },
  sideBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  oneBadge: {
    position: "absolute",
    right: 4,
    bottom: 6,
    color: colors.secondary,
    fontSize: 9,
    fontWeight: "800",
  },
  playBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  extraRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  extraBtn: { alignItems: "center", gap: 4, paddingHorizontal: 16 },
  extraLabel: { color: colors.muted, fontSize: 11, fontWeight: "600" },
  volRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    marginTop: 15,
  },
  volBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.panelSoft,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  volLabelBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 72,
    justifyContent: "center",
  },
  volPct: {
    color: colors.text,
    fontWeight: "800",
    fontSize: 14,
  },
  hint: {
    color: colors.muted,
    fontSize: 11,
    textAlign: "center",
    marginTop: spacing.lg,
    opacity: 0.8,
  },
});
