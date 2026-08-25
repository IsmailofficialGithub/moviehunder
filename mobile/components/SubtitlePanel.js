import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors, radii, spacing } from "../lib/theme";
import { downloadSubtitle, searchSubtitles } from "../lib/subtitlesApi";
import {
  applySyncToTrack,
  cleanSearchTitle,
  formatClock,
  formatOffsetLabel,
  makeSubtitleTrack,
  referenceCue,
  shortSubtitleLabel,
  uriToSubtitleTrack,
} from "../lib/subtitles";

export default function SubtitlePanel({
  title,
  detailPath,
  se = "0",
  ep = "0",
  currentTime = 0,
  cueText = "",
  subtitles = [],
  activeSubId = "off",
  onSubtitlesChange,
  onActiveSubIdChange,
  onSeek,
}) {
  const [subError, setSubError] = useState("");
  const [osResults, setOsResults] = useState([]);
  const [osStatus, setOsStatus] = useState("idle");
  const [osMessage, setOsMessage] = useState("");
  const [osLoadingId, setOsLoadingId] = useState(null);
  const [uploadBusy, setUploadBusy] = useState(false);

  const searchQuery = useMemo(
    () => cleanSearchTitle(title, detailPath),
    [title, detailPath]
  );

  const activeTrack = useMemo(
    () => subtitles.find((t) => t.id === activeSubId) || null,
    [subtitles, activeSubId]
  );

  const setSubtitles = useCallback(
    (updater) => {
      onSubtitlesChange(typeof updater === "function" ? updater(subtitles) : updater);
    },
    [onSubtitlesChange, subtitles]
  );

  const searchOnline = useCallback(async () => {
    if (!searchQuery) {
      setOsMessage("No title to search");
      return;
    }
    setOsStatus("loading");
    setOsMessage("");
    setOsResults([]);
    setSubError("");
    try {
      const params = {
        query: searchQuery,
        languages: "en",
      };
      if (Number(se) > 0) params.season = String(se);
      if (Number(ep) > 0) params.episode = String(ep);
      if (Number(se) > 0 || Number(ep) > 0) params.type = "episode";
      else params.type = "movie";

      const data = await searchSubtitles(params);
      if (!data.configured) {
        setOsStatus("need_key");
        setOsMessage("Online subtitles aren’t set up yet. Add SUBDL_API_KEY to server/.dev.vars");
        return;
      }
      if (!data.ok) throw new Error(data.error || "Search failed");
      setOsResults(data.results || []);
      setOsStatus("ready");
      setOsMessage(
        data.results?.length
          ? `Found ${data.results.length} — pick one close to your quality (e.g. CAM)`
          : "No matches. Try uploading a .srt file"
      );
    } catch (err) {
      setOsStatus("error");
      setOsMessage(err?.message || "Subtitle search didn’t work");
      setOsResults([]);
    }
  }, [searchQuery, se, ep]);

  const pickUpload = useCallback(async () => {
    setSubError("");
    setUploadBusy(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["text/*", "application/x-subrip", "*/*"],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const track = await uriToSubtitleTrack(asset.uri, asset.name || "Subtitles");
      setSubtitles((prev) => [...prev, track]);
      onActiveSubIdChange(track.id);
      setOsMessage(`Uploaded ${track.cues.length} lines. Use Sync if text is early/late.`);
    } catch (err) {
      setSubError(err?.message || "Couldn’t load that subtitle file");
    } finally {
      setUploadBusy(false);
    }
  }, [onActiveSubIdChange, setSubtitles]);

  const loadOnline = useCallback(
    async (item) => {
      setOsLoadingId(item.file_id);
      setSubError("");
      try {
        const data = await downloadSubtitle(item.file_id);
        if (!data.ok) throw new Error(data.error || "Download failed");
        const track = makeSubtitleTrack({
          vttText: data.vtt,
          label: data.label || item.file_name,
          srclang: String(item.language || "en").slice(0, 8),
          source: "subdl",
          fileId: item.file_id,
        });
        setSubtitles((prev) => [...prev, track]);
        onActiveSubIdChange(track.id);
        setOsMessage(`On · ${track.label} (${track.cues.length} lines)`);
        setOsResults([]);
      } catch (err) {
        setSubError(err?.message || "Couldn’t download that subtitle");
      } finally {
        setOsLoadingId(null);
      }
    },
    [onActiveSubIdChange, setSubtitles]
  );

  const setOffset = useCallback(
    (value) => {
      if (!activeTrack) return;
      setSubtitles((prev) =>
        prev.map((t) =>
          t.id === activeTrack.id ? applySyncToTrack(t, { offset: value }) : t
        )
      );
    },
    [activeTrack, setSubtitles]
  );

  const nudgeOffset = useCallback(
    (delta) => {
      if (!activeTrack) return;
      setOffset(Math.round((activeTrack.offset + delta) * 10) / 10);
    },
    [activeTrack, setOffset]
  );

  const alignLineToNow = useCallback(() => {
    if (!activeTrack?.cues?.length) return;
    const { cue } = referenceCue(
      activeTrack.cues,
      currentTime,
      activeTrack.offset || 0,
      activeTrack.rate || 1
    );
    if (!cue) return;
    const rate = activeTrack.rate || 1;
    setOffset(Math.round((currentTime - cue.start * rate) * 10) / 10);
  }, [activeTrack, currentTime, setOffset]);

  const jumpToCue = useCallback(
    (dir) => {
      if (!activeTrack?.cues?.length || !onSeek) return;
      const { index } = referenceCue(
        activeTrack.cues,
        currentTime,
        activeTrack.offset || 0,
        activeTrack.rate || 1
      );
      const next = Math.max(0, Math.min(activeTrack.cues.length - 1, index + dir));
      const cue = activeTrack.cues[next];
      if (!cue) return;
      const rate = activeTrack.rate || 1;
      onSeek(cue.start * rate + (activeTrack.offset || 0));
    },
    [activeTrack, currentTime, onSeek]
  );

  const removeTrack = useCallback(
    (id) => {
      setSubtitles((prev) => prev.filter((t) => t.id !== id));
      if (activeSubId === id) onActiveSubIdChange("off");
    },
    [activeSubId, onActiveSubIdChange, setSubtitles]
  );

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.body}>
      <Text style={styles.lead}>
        Pause on a spoken line, then tap <Text style={styles.leadStrong}>This line is now</Text>{" "}
        to sync. CAM streams often need a small offset.
      </Text>

      <View style={styles.chips}>
        <Pressable
          style={[styles.chip, activeSubId === "off" && styles.chipOn]}
          onPress={() => onActiveSubIdChange("off")}
        >
          <Text style={[styles.chipText, activeSubId === "off" && styles.chipTextOn]}>
            Off
          </Text>
        </Pressable>
        <Pressable style={styles.chip} onPress={pickUpload} disabled={uploadBusy}>
          {uploadBusy ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : (
            <Text style={styles.chipText}>Upload .srt</Text>
          )}
        </Pressable>
        <Pressable
          style={[styles.chip, styles.chipPrimary]}
          onPress={searchOnline}
          disabled={osStatus === "loading"}
        >
          {osStatus === "loading" ? (
            <ActivityIndicator size="small" color={colors.accentInk} />
          ) : (
            <Text style={styles.chipPrimaryText}>Search online</Text>
          )}
        </Pressable>
      </View>

      {subtitles.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Loaded</Text>
          {subtitles.map((t) => (
            <View key={t.id} style={styles.trackRow}>
              <Pressable
                style={[styles.trackBtn, t.id === activeSubId && styles.trackBtnOn]}
                onPress={() => onActiveSubIdChange(t.id)}
              >
                <Text style={styles.trackTitle} numberOfLines={1}>
                  {t.label}
                </Text>
                <Text style={styles.trackMeta}>
                  {t.cues.length} lines
                  {t.offset ? ` · ${formatOffsetLabel(t.offset)}` : ""}
                </Text>
              </Pressable>
              <Pressable style={styles.removeBtn} onPress={() => removeTrack(t.id)}>
                <Ionicons name="close" size={18} color="rgba(255,255,255,0.6)" />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      {activeTrack ? (
        <View style={styles.syncBox}>
          <Text style={styles.syncHead}>
            Video {formatClock(currentTime)} · offset {formatOffsetLabel(activeTrack.offset)}
          </Text>
          <Text style={styles.nowLine} numberOfLines={3}>
            {cueText
              ? `On screen: “${cueText.replace(/\n/g, " ")}”`
              : "No line at this time — skip ahead, then align."}
          </Text>
          <View style={styles.syncBtns}>
            <Pressable style={styles.syncBtn} onPress={() => jumpToCue(-1)}>
              <Text style={styles.syncBtnText}>← Prev</Text>
            </Pressable>
            <Pressable style={[styles.syncBtn, styles.alignBtn]} onPress={alignLineToNow}>
              <Text style={styles.alignBtnText}>This line is now</Text>
            </Pressable>
            <Pressable style={styles.syncBtn} onPress={() => jumpToCue(1)}>
              <Text style={styles.syncBtnText}>Next →</Text>
            </Pressable>
          </View>
          <View style={styles.nudgeRow}>
            {[-10, -5, -1, 0, 1, 5, 10].map((n) => (
              <Pressable
                key={n}
                style={styles.nudgeBtn}
                onPress={() => (n === 0 ? setOffset(0) : nudgeOffset(n))}
              >
                <Text style={styles.nudgeText}>{n === 0 ? "0" : `${n > 0 ? "+" : ""}${n}s`}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {subError ? <Text style={styles.error}>{subError}</Text> : null}
      {osMessage ? (
        <Text
          style={
            osStatus === "need_key" || osStatus === "error" ? styles.error : styles.banner
          }
        >
          {osMessage}
        </Text>
      ) : null}

      {osResults.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Online — tap to use</Text>
          {osResults.map((item) => {
            const label = shortSubtitleLabel(item.release || item.file_name, item.language);
            const loading = osLoadingId === item.file_id;
            return (
              <Pressable
                key={item.id}
                style={styles.osRow}
                disabled={loading}
                onPress={() => loadOnline(item)}
              >
                <Text style={styles.osLang}>{String(item.language || "en").slice(0, 7)}</Text>
                <View style={styles.osCopy}>
                  <Text style={styles.osName} numberOfLines={2}>
                    {label}
                  </Text>
                  {item.download_count ? (
                    <Text style={styles.osMeta}>{item.download_count} downloads</Text>
                  ) : null}
                </View>
                {loading ? (
                  <ActivityIndicator size="small" color={colors.accent} />
                ) : (
                  <Ionicons name="download-outline" size={18} color={colors.accent} />
                )}
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    maxHeight: 420,
  },
  body: {
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  lead: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 13,
    lineHeight: 18,
  },
  leadStrong: {
    color: colors.accent,
    fontWeight: "700",
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    minHeight: 36,
    justifyContent: "center",
  },
  chipOn: {
    borderColor: colors.accent,
    backgroundColor: colors.accentMuted,
  },
  chipPrimary: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  chipText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 13,
  },
  chipTextOn: {
    color: colors.accent,
  },
  chipPrimaryText: {
    color: colors.accentInk,
    fontWeight: "800",
    fontSize: 13,
  },
  section: {
    gap: 6,
  },
  sectionTitle: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginTop: 4,
  },
  trackRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  trackBtn: {
    flex: 1,
    padding: 10,
    borderRadius: radii.md,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "transparent",
  },
  trackBtnOn: {
    borderColor: colors.accent,
    backgroundColor: colors.accentMuted,
  },
  trackTitle: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },
  trackMeta: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 11,
    marginTop: 2,
  },
  removeBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  syncBox: {
    padding: 12,
    borderRadius: radii.md,
    backgroundColor: "rgba(255,255,255,0.05)",
    gap: 8,
  },
  syncHead: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 11,
  },
  nowLine: {
    color: "#fff",
    fontSize: 13,
    lineHeight: 18,
  },
  syncBtns: {
    flexDirection: "row",
    gap: 6,
  },
  syncBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: radii.sm,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
  },
  syncBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  alignBtn: {
    flex: 1.4,
    backgroundColor: colors.accentMuted,
  },
  alignBtnText: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: "800",
  },
  nudgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  nudgeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.sm,
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  nudgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
  osRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: radii.md,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  osLang: {
    color: colors.accent,
    fontWeight: "800",
    fontSize: 11,
    width: 28,
  },
  osCopy: {
    flex: 1,
  },
  osName: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  osMeta: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 10,
    marginTop: 2,
  },
  error: {
    color: "#ff8a80",
    fontSize: 13,
  },
  banner: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 13,
  },
});
