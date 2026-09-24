import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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
  searchCuesByDialogue,
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
  const [dialogueQuery, setDialogueQuery] = useState("");
  const [dialogueSyncToast, setDialogueSyncToast] = useState("");
  const [syncTab, setSyncTab] = useState("smart");


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

  const setRate = useCallback(
    (value) => {
      if (!activeTrack) return;
      setSubtitles((prev) =>
        prev.map((t) =>
          t.id === activeTrack.id ? applySyncToTrack(t, { rate: value }) : t
        )
      );
    },
    [activeTrack, setSubtitles]
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

  const dialogueMatches = useMemo(() => {
    if (!activeTrack?.cues?.length || !dialogueQuery.trim()) return [];
    return searchCuesByDialogue(activeTrack.cues, dialogueQuery, {
      currentTime,
      rate: activeTrack.rate || 1,
      maxResults: 8,
    });
  }, [activeTrack, dialogueQuery, currentTime]);

  const syncDialogueCue = useCallback(
    (item) => {
      if (!activeTrack || item?.suggestedOffset == null) return;
      setOffset(item.suggestedOffset);
      const snippet = item.text.length > 28 ? `${item.text.slice(0, 28)}…` : item.text;
      setDialogueSyncToast(
        `Synced! Shifted by ${formatOffsetLabel(item.suggestedOffset)} for “${snippet}”`
      );
      setTimeout(() => setDialogueSyncToast(""), 4500);
    },
    [activeTrack, setOffset]
  );


  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
      <View style={styles.headerRow}>
        <View style={styles.aiBadge}>
          <Ionicons name="sparkles" size={11} color={colors.accent} />
          <Text style={styles.aiBadgeText}>AI SUBTITLES</Text>
        </View>
        {activeTrack ? (
          <View style={styles.activeTrackBadge}>
            <View style={styles.activeDot} />
            <Text style={styles.activeTrackText} numberOfLines={1}>
              {activeTrack.label}
            </Text>
          </View>
        ) : (
          <Text style={styles.inactiveTrackText}>Off</Text>
        )}
      </View>

      <View style={styles.chips}>
        <Pressable
          style={[styles.miniChip, activeSubId === "off" && styles.miniChipActive]}
          onPress={() => onActiveSubIdChange("off")}
        >
          <Text style={[styles.miniChipText, activeSubId === "off" && styles.miniChipTextActive]}>
            Off
          </Text>
        </Pressable>
        <Pressable style={styles.miniChip} onPress={pickUpload} disabled={uploadBusy}>
          {uploadBusy ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : (
            <>
              <Ionicons name="cloud-upload-outline" size={12} color="rgba(255,255,255,0.7)" />
              <Text style={styles.miniChipText}>Upload</Text>
            </>
          )}
        </Pressable>
        <Pressable
          style={[styles.miniChip, styles.miniChipPrimary]}
          onPress={searchOnline}
          disabled={osStatus === "loading"}
        >
          {osStatus === "loading" ? (
            <ActivityIndicator size="small" color={colors.accentInk} />
          ) : (
            <>
              <Ionicons name="search-outline" size={12} color={colors.accentInk} />
              <Text style={styles.miniChipPrimaryText}>Search SubDL</Text>
            </>
          )}
        </Pressable>
      </View>

      {subtitles.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.loadedStrip}>
          {subtitles.map((t) => (
            <View key={t.id} style={[styles.loadedPill, t.id === activeSubId && styles.loadedPillActive]}>
              <Pressable
                style={styles.loadedSelectBtn}
                onPress={() => onActiveSubIdChange(t.id)}
              >
                <Text style={styles.loadedLabel} numberOfLines={1}>
                  {t.label}
                </Text>
                <Text style={styles.loadedCount}>{t.cues.length} lines</Text>
              </Pressable>
              <Pressable style={styles.loadedRemoveBtn} onPress={() => removeTrack(t.id)}>
                <Ionicons name="close" size={12} color="rgba(255,255,255,0.6)" />
              </Pressable>
            </View>
          ))}
        </ScrollView>
      ) : null}

      {activeTrack ? (
        <View style={styles.syncCard}>
          <View style={styles.segmentedTabs}>
            <Pressable
              style={[styles.segmentBtn, syncTab === "smart" && styles.segmentActive]}
              onPress={() => setSyncTab("smart")}
            >
              <Ionicons
                name="sparkles"
                size={11}
                color={syncTab === "smart" ? colors.accent : "rgba(255,255,255,0.5)"}
              />
              <Text
                style={[
                  styles.segmentText,
                  syncTab === "smart" && styles.segmentTextActive,
                ]}
              >
                AI Dialogue Sync
              </Text>
            </Pressable>
            <Pressable
              style={[styles.segmentBtn, syncTab === "manual" && styles.segmentActive]}
              onPress={() => setSyncTab("manual")}
            >
              <Ionicons
                name="options-outline"
                size={11}
                color={syncTab === "manual" ? colors.accent : "rgba(255,255,255,0.5)"}
              />
              <Text
                style={[
                  styles.segmentText,
                  syncTab === "manual" && styles.segmentTextActive,
                ]}
              >
                Manual Timing
              </Text>
            </Pressable>
          </View>

          {syncTab === "smart" ? (
            <View style={styles.smartTabContent}>
              <View style={styles.dialoguePromptBox}>
                <View style={styles.dialoguePromptHeader}>
                  <Ionicons name="chatbubble-ellipses-outline" size={12} color="#a855f7" />
                  <Text style={styles.dialoguePromptText}>
                    Heard words out of sync? Type them to auto-align:
                  </Text>
                </View>
                <View style={styles.dialogueInputWrap}>
                  <Ionicons name="search" size={13} color="rgba(255,255,255,0.4)" style={styles.dialogueSearchIcon} />
                  <TextInput
                    style={styles.dialogueInput}
                    placeholder="e.g. hello brother, wait for me..."
                    placeholderTextColor="rgba(255,255,255,0.35)"
                    value={dialogueQuery}
                    onChangeText={setDialogueQuery}
                    returnKeyType="search"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  {dialogueQuery ? (
                    <Pressable onPress={() => setDialogueQuery("")} hitSlop={8}>
                      <Ionicons name="close-circle" size={14} color="rgba(255,255,255,0.5)" />
                    </Pressable>
                  ) : null}
                </View>

                {dialogueSyncToast ? (
                  <View style={styles.toastBox}>
                    <Ionicons name="checkmark-circle" size={13} color="#4ade80" />
                    <Text style={styles.toastText}>{dialogueSyncToast}</Text>
                  </View>
                ) : null}

                {dialogueMatches.length > 0 ? (
                  <View style={styles.dialogueList}>
                    {dialogueMatches.map((m) => (
                      <View key={m.index} style={styles.dialogueItem}>
                        <View style={styles.dialogueInfo}>
                          <Text style={styles.dialogueText} numberOfLines={2}>
                            “{m.text}”
                          </Text>
                          <Text style={styles.dialogueMeta}>
                            Subtitle: {formatClock(m.start)} · Needed: {formatOffsetLabel(m.suggestedOffset)}
                          </Text>
                        </View>
                        <View style={styles.dialogueActions}>
                          <Pressable
                            style={styles.dialogueSyncBtn}
                            onPress={() => syncDialogueCue(m)}
                          >
                            <Ionicons name="sparkles" size={10} color="#000" />
                            <Text style={styles.dialogueSyncBtnText}>Sync</Text>
                          </Pressable>
                          {onSeek ? (
                            <Pressable
                              style={styles.dialogueJumpBtn}
                              onPress={() =>
                                onSeek(m.start * (activeTrack.rate || 1) + (activeTrack.offset || 0))
                              }
                            >
                              <Text style={styles.dialogueJumpBtnText}>Jump</Text>
                            </Pressable>
                          ) : null}
                        </View>
                      </View>
                    ))}
                  </View>
                ) : dialogueQuery.trim().length > 1 ? (
                  <Text style={styles.dialogueEmpty}>No matching dialogue found in this subtitle track.</Text>
                ) : null}
              </View>

              <View style={styles.currentSpeechBox}>
                <View style={styles.currentSpeechTop}>
                  <Text style={styles.microLabel}>CURRENT TIMELINE CUE</Text>
                  <Text style={styles.clockTag}>Video {formatClock(currentTime)}</Text>
                </View>
                <Text style={styles.currentSpeechText} numberOfLines={2}>
                  {cueText ? `“${cueText.replace(/\n/g, " ")}”` : "Silence / no line at this timestamp"}
                </Text>
                <View style={styles.quickAlignRow}>
                  <Pressable style={styles.navCueBtn} onPress={() => jumpToCue(-1)}>
                    <Ionicons name="play-skip-back" size={11} color="#fff" />
                    <Text style={styles.navCueBtnText}>Prev</Text>
                  </Pressable>
                  <Pressable style={styles.aiSyncNowBtn} onPress={alignLineToNow}>
                    <Ionicons name="sparkles" size={11} color="#000" />
                    <Text style={styles.aiSyncNowBtnText}>Align this line to now</Text>
                  </Pressable>
                  <Pressable style={styles.navCueBtn} onPress={() => jumpToCue(1)}>
                    <Text style={styles.navCueBtnText}>Next</Text>
                    <Ionicons name="play-skip-forward" size={11} color="#fff" />
                  </Pressable>
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.manualTabContent}>
              <View style={styles.offsetControlBox}>
                <View style={styles.stepperTop}>
                  <Text style={styles.microLabel}>SYNC OFFSET</Text>
                  <Text style={styles.offsetReadout}>{formatOffsetLabel(activeTrack.offset)}</Text>
                </View>
                <View style={styles.stepperRow}>
                  {[-5, -1, -0.2].map((delta) => (
                    <Pressable
                      key={delta}
                      style={styles.stepBtn}
                      onPress={() => nudgeOffset(delta)}
                    >
                      <Text style={styles.stepBtnText}>{delta}s</Text>
                    </Pressable>
                  ))}
                  <Pressable style={styles.stepResetBtn} onPress={() => setOffset(0)}>
                    <Ionicons name="refresh-outline" size={12} color={colors.accent} />
                    <Text style={styles.stepResetText}>0s</Text>
                  </Pressable>
                  {[0.2, 1, 5].map((delta) => (
                    <Pressable
                      key={delta}
                      style={styles.stepBtn}
                      onPress={() => nudgeOffset(delta)}
                    >
                      <Text style={styles.stepBtnText}>+{delta}s</Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={styles.speedBox}>
                <Text style={styles.microLabel}>DRIFT CORRECTION</Text>
                <View style={styles.speedBtnRow}>
                  <Pressable
                    style={[
                      styles.miniSpeedBtn,
                      Math.abs((activeTrack.rate || 1) - 1) < 0.001 && styles.miniSpeedActive,
                    ]}
                    onPress={() => setRate(1)}
                  >
                    <Text
                      style={[
                        styles.miniSpeedText,
                        Math.abs((activeTrack.rate || 1) - 1) < 0.001 && styles.miniSpeedTextActive,
                      ]}
                    >
                      1.00× Normal
                    </Text>
                  </Pressable>
                  <Pressable
                    style={styles.miniSpeedBtn}
                    onPress={() => setRate(23.976 / 25)}
                  >
                    <Text style={styles.miniSpeedText}>23.98 → 25 fps</Text>
                  </Pressable>
                  <Pressable
                    style={styles.miniSpeedBtn}
                    onPress={() => setRate(25 / 23.976)}
                  >
                    <Text style={styles.miniSpeedText}>25 → 23.98 fps</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          )}
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
                  <Text style={styles.osName} numberOfLines={1}>
                    {label}
                  </Text>
                  {item.download_count ? (
                    <Text style={styles.osMeta}>{item.download_count} downloads</Text>
                  ) : null}
                </View>
                {loading ? (
                  <ActivityIndicator size="small" color={colors.accent} />
                ) : (
                  <Ionicons name="download-outline" size={15} color={colors.accent} />
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
    maxHeight: 460,
  },
  body: {
    paddingBottom: spacing.md,
    gap: 8,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingBottom: 2,
  },
  aiBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(246,196,67,0.15)",
    borderWidth: 1,
    borderColor: "rgba(246,196,67,0.35)",
    borderRadius: radii.pill,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  aiBadgeText: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  activeTrackBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
    maxWidth: 200,
  },
  activeDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#4ade80",
  },
  activeTrackText: {
    color: "#e2e2ec",
    fontSize: 11,
    fontWeight: "600",
  },
  inactiveTrackText: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 11,
    fontWeight: "600",
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  miniChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.sm,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  miniChipActive: {
    backgroundColor: "rgba(246,196,67,0.14)",
    borderColor: "rgba(246,196,67,0.45)",
  },
  miniChipPrimary: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  miniChipText: {
    color: "#cfcfdc",
    fontWeight: "600",
    fontSize: 11,
  },
  miniChipTextActive: {
    color: colors.accent,
    fontWeight: "700",
  },
  miniChipPrimaryText: {
    color: colors.accentInk,
    fontWeight: "800",
    fontSize: 11,
  },
  loadedStrip: {
    flexDirection: "row",
    gap: 6,
    paddingVertical: 2,
  },
  loadedPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(20,20,26,0.9)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: radii.sm,
    overflow: "hidden",
  },
  loadedPillActive: {
    borderColor: "rgba(246,196,67,0.5)",
    backgroundColor: "rgba(246,196,67,0.08)",
  },
  loadedSelectBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  loadedLabel: {
    color: "#e5e5ed",
    fontSize: 11,
    fontWeight: "600",
    maxWidth: 130,
  },
  loadedCount: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 10,
  },
  loadedRemoveBtn: {
    paddingHorizontal: 6,
    paddingVertical: 5,
    borderLeftWidth: 1,
    borderLeftColor: "rgba(255,255,255,0.08)",
  },
  syncCard: {
    padding: 10,
    borderRadius: radii.md,
    backgroundColor: "rgba(10,10,14,0.65)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    gap: 8,
  },
  segmentedTabs: {
    flexDirection: "row",
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: radii.sm,
    padding: 2,
    gap: 2,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  segmentBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 6,
    borderRadius: 4,
  },
  segmentActive: {
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  segmentText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 11,
    fontWeight: "600",
  },
  segmentTextActive: {
    color: colors.accent,
    fontWeight: "700",
  },
  smartTabContent: {
    gap: 8,
  },
  manualTabContent: {
    gap: 8,
  },
  dialoguePromptBox: {
    gap: 6,
  },
  dialoguePromptHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  dialoguePromptText: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 11,
    fontWeight: "600",
  },
  dialogueInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: radii.sm,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    height: 32,
  },
  dialogueSearchIcon: {
    marginRight: 6,
  },
  dialogueInput: {
    flex: 1,
    color: "#fff",
    fontSize: 11,
    paddingVertical: 2,
  },
  toastBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(74,222,128,0.12)",
    borderWidth: 1,
    borderColor: "rgba(74,222,128,0.25)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.sm,
  },
  toastText: {
    color: "#4ade80",
    fontSize: 11,
    fontWeight: "600",
    flex: 1,
  },
  dialogueList: {
    gap: 5,
    maxHeight: 140,
  },
  dialogueItem: {
    backgroundColor: "rgba(20,20,28,0.85)",
    borderRadius: radii.sm,
    padding: 6,
    gap: 4,
    borderLeftWidth: 2,
    borderLeftColor: colors.accent,
  },
  dialogueInfo: {
    gap: 1,
  },
  dialogueText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "600",
  },
  dialogueMeta: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 9,
  },
  dialogueActions: {
    flexDirection: "row",
    gap: 6,
    justifyContent: "flex-end",
  },
  dialogueSyncBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: colors.accent,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  dialogueSyncBtnText: {
    color: "#000",
    fontSize: 10,
    fontWeight: "800",
  },
  dialogueJumpBtn: {
    backgroundColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 4,
  },
  dialogueJumpBtnText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 10,
    fontWeight: "600",
  },
  dialogueEmpty: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 11,
    fontStyle: "italic",
    paddingVertical: 2,
  },
  currentSpeechBox: {
    backgroundColor: "rgba(0,0,0,0.35)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    borderRadius: radii.sm,
    padding: 8,
    gap: 4,
  },
  currentSpeechTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  microLabel: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  clockTag: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 10,
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  currentSpeechText: {
    color: "#e8e8f2",
    fontSize: 11,
    fontStyle: "italic",
    minHeight: 16,
  },
  quickAlignRow: {
    flexDirection: "row",
    gap: 4,
    marginTop: 2,
  },
  navCueBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  navCueBtnText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "600",
  },
  aiSyncNowBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  aiSyncNowBtnText: {
    color: "#000",
    fontSize: 11,
    fontWeight: "800",
  },
  offsetControlBox: {
    backgroundColor: "rgba(0,0,0,0.35)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    borderRadius: radii.sm,
    padding: 8,
    gap: 6,
  },
  stepperTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  offsetReadout: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: "700",
  },
  stepperRow: {
    flexDirection: "row",
    gap: 3,
    justifyContent: "space-between",
  },
  stepBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 5,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  stepBtnText: {
    color: "#cfcfdc",
    fontSize: 10,
    fontWeight: "700",
  },
  stepResetBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingVertical: 5,
    borderRadius: 4,
    backgroundColor: "rgba(246,196,67,0.12)",
    borderWidth: 1,
    borderColor: "rgba(246,196,67,0.3)",
  },
  stepResetText: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: "800",
  },
  speedBox: {
    backgroundColor: "rgba(0,0,0,0.35)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    borderRadius: radii.sm,
    padding: 8,
    gap: 5,
  },
  speedBtnRow: {
    flexDirection: "row",
    gap: 4,
  },
  miniSpeedBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 5,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  miniSpeedActive: {
    backgroundColor: "rgba(246,196,67,0.15)",
    borderColor: "rgba(246,196,67,0.5)",
  },
  miniSpeedText: {
    color: "#cfcfdc",
    fontSize: 10,
    fontWeight: "600",
  },
  miniSpeedTextActive: {
    color: colors.accent,
    fontWeight: "700",
  },
  section: {
    gap: 5,
  },
  sectionTitle: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  osRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    padding: 7,
    borderRadius: radii.sm,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  osLang: {
    color: colors.accent,
    fontWeight: "800",
    fontSize: 10,
    width: 24,
  },
  osCopy: {
    flex: 1,
  },
  osName: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "600",
  },
  osMeta: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 9,
    marginTop: 1,
  },
  error: {
    color: "#ff8a80",
    fontSize: 11,
  },
  banner: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 11,
  },
});

