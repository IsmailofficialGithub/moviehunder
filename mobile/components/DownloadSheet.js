import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  enqueueDownload,
  enqueueSeason,
  findDownload,
} from "../lib/downloads";
import { formatBytes, resolveStreams } from "../lib/stream";
import { toUserMessage } from "../lib/userFacingError";
import { colors, radii, spacing } from "../lib/theme";

/**
 * Quality picker → enqueue in-app download (defaults highlight ≤720p to save space).
 * mode "single" = one episode/movie; "season" = all missing eps at chosen height.
 */
export default function DownloadSheet({
  visible,
  onClose,
  onStarted,
  subjectId,
  detailPath,
  title,
  poster,
  se = "0",
  ep = "0",
  kind = "movie",
  mode = "single",
  season = null,
}) {
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busyHeight, setBusyHeight] = useState(null);
  const [error, setError] = useState("");

  const isSeason = mode === "season";
  const seasonNum = season ?? se;

  const load = useCallback(async () => {
    if (!subjectId || !detailPath) return;
    setLoading(true);
    setError("");
    try {
      const result = await resolveStreams({
        subjectId,
        detailPath,
        se,
        ep,
      });
      setSources(result.sources || []);
      if (!result.sources?.length) setError("No downloadable streams.");
    } catch (err) {
      setSources([]);
      setError(
        toUserMessage(
          err,
          "Couldn't load qualities. Check your connection and try again."
        )
      );
    } finally {
      setLoading(false);
    }
  }, [subjectId, detailPath, se, ep]);

  useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  const recommended = useMemo(() => {
    const under = sources.filter((s) => s.height > 0 && s.height <= 720);
    if (!under.length) return sources[sources.length - 1]?.height;
    return under.sort((a, b) => b.height - a.height)[0]?.height;
  }, [sources]);

  const onPick = async (source) => {
    setBusyHeight(source.height);
    setError("");
    try {
      if (isSeason) {
        const r = await enqueueSeason({
          subjectId,
          detailPath,
          title,
          poster,
          season: seasonNum,
          preferredHeight: source.height || 720,
        });
        if (r?.queued === 0 && r?.total > 0) {
          setError(
            `All episodes of season ${seasonNum} are already queued or saved.`
          );
          return;
        }
        onStarted?.(r);
        onClose?.();
      } else {
        await enqueueDownload({
          subjectId,
          detailPath,
          title,
          poster,
          se,
          ep,
          kind,
          source,
        });
        onStarted?.();
        onClose?.();
      }
    } catch (err) {
      setError(
        toUserMessage(
          err,
          "Couldn't start download. Check your connection and try again."
        )
      );
    } finally {
      setBusyHeight(null);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.head}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>
                {isSeason ? "Download season" : "Download"}
              </Text>
              <Text style={styles.sub} numberOfLines={2}>
                {title}
                {isSeason
                  ? ` · Season ${seasonNum}`
                  : Number(se) > 0 || Number(ep) > 0
                    ? ` · S${se}E${ep}`
                    : ""}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={styles.close}>
              <Ionicons name="close" size={22} color={colors.text} />
            </Pressable>
          </View>

          <Text style={styles.hint}>
            Pick a quality. 720p or lower uses less space
            {isSeason ? " — applied to every episode in this season." : "."}{" "}
            Downloads resume if interrupted.
          </Text>

          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : (
            <View style={styles.list}>
              {sources.map((s) => {
                const existing = isSeason
                  ? null
                  : findDownload({
                      subjectId,
                      detailPath,
                      se,
                      ep,
                      height: s.height,
                    });
                const done = existing?.status === "completed";
                const active =
                  existing &&
                  (existing.status === "downloading" ||
                    existing.status === "queued" ||
                    existing.status === "paused");
                const size = formatBytes(s.size_bytes);
                const isRec = s.height === recommended;
                const busy = busyHeight === s.height;

                return (
                  <Pressable
                    key={`${s.resolution}-${s.height}`}
                    style={[
                      styles.row,
                      isRec && styles.rowRec,
                      (done || active) && styles.rowMuted,
                    ]}
                    disabled={busy || done || active}
                    onPress={() => onPick(s)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>
                        {s.resolution}
                        {isRec ? " · recommended" : ""}
                      </Text>
                      <Text style={styles.rowSub}>
                        {isSeason
                          ? size
                            ? `~${size} per episode`
                            : "Size unknown"
                          : size || "Size unknown"}
                        {done
                          ? " · Downloaded"
                          : active
                            ? ` · ${existing.status}`
                            : ""}
                      </Text>
                    </View>
                    {busy ? (
                      <ActivityIndicator color={colors.accent} />
                    ) : done ? (
                      <Ionicons
                        name="checkmark-circle"
                        size={22}
                        color={colors.accent}
                      />
                    ) : (
                      <Ionicons
                        name="download-outline"
                        size={22}
                        color={colors.accent}
                      />
                    )}
                  </Pressable>
                );
              })}
            </View>
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: spacing.md,
    paddingBottom: spacing.xl,
    maxHeight: "70%",
  },
  head: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: spacing.sm,
  },
  title: {
    color: colors.text,
    fontWeight: "800",
    fontSize: 18,
  },
  sub: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 2,
  },
  close: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  hint: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    marginBottom: spacing.sm,
  },
  center: {
    paddingVertical: 28,
    alignItems: "center",
  },
  list: {
    gap: 6,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: radii.md,
    backgroundColor: colors.panel,
    gap: 10,
  },
  rowRec: {
    borderWidth: 1,
    borderColor: colors.accentBorder,
  },
  rowMuted: {
    opacity: 0.7,
  },
  rowTitle: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 15,
  },
  rowSub: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
    textTransform: "capitalize",
  },
  error: {
    color: colors.danger,
    marginTop: spacing.sm,
    fontSize: 13,
  },
});
