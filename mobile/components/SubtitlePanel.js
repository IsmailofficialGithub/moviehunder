import { useCallback, useEffect, useMemo, useState } from "react";
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

// Popular languages for subtitle queries
const SUB_LANGUAGES = [
  { id: "en", label: "EN" },
  { id: "hi", label: "HI" },
  { id: "ur", label: "UR" },
  { id: "ar", label: "AR" },
  { id: "es", label: "ES" },
  { id: "fr", label: "FR" },
  { id: "all", label: "ALL" },
];

const FONT_SIZES = [
  { id: "sm", label: "Small", size: 13 },
  { id: "md", label: "Normal", size: 16 },
  { id: "lg", label: "Large", size: 20 },
  { id: "xl", label: "Extra", size: 24 },
];

const BG_STYLES = [
  { id: "translucent", label: "Translucent", bg: "rgba(0,0,0,0.6)" },
  { id: "solid", label: "Solid Black", bg: "rgba(0,0,0,0.95)" },
  { id: "clear", label: "Clear Outline", bg: "transparent" },
];

const TEXT_COLORS = [
  { id: "white", label: "White", color: "#ffffff" },
  { id: "yellow", label: "Yellow", color: "#f6c443" },
  { id: "cyan", label: "Cyan", color: "#38bdf8" },
];

const POSITIONS = [
  { id: "bottom", label: "Bottom", elevation: 0 },
  { id: "elevated", label: "Elevated", elevation: 28 },
];

export default function SubtitlePanel({
  title,
  detailPath,
  se = "0",
  ep = "0",
  currentTime = 0,
  cueText = "",
  subtitles = [],
  activeSubId = "off",
  subSettings,
  onSubSettingsChange,
  onSubtitlesChange,
  onActiveSubIdChange,
  onSeek,
}) {
  const [panelTab, setPanelTab] = useState("search"); // "search" | "sync" | "style"
  const [subError, setSubError] = useState("");
  const [osResults, setOsResults] = useState([]);
  const [osStatus, setOsStatus] = useState("idle");
  const [osMessage, setOsMessage] = useState("");
  const [osLoadingId, setOsLoadingId] = useState(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [dialogueQuery, setDialogueQuery] = useState("");
  const [dialogueSyncToast, setDialogueSyncToast] = useState("");
  const [syncTab, setSyncTab] = useState("smart"); // "smart" | "manual"
  const [selectedLang, setSelectedLang] = useState("en");

  // Editable custom keyword search for online subtitles
  const defaultQuery = useMemo(
    () => cleanSearchTitle(title, detailPath),
    [title, detailPath]
  );
  const [keywordQuery, setKeywordQuery] = useState(defaultQuery);

  // Update query when title or detailPath changes
  useEffect(() => {
    setKeywordQuery(defaultQuery);
  }, [defaultQuery]);

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

  // Online SubDL search using user's custom keyword & language
  const searchOnline = useCallback(async () => {
    const q = (keywordQuery || "").trim();
    if (!q) {
      setOsMessage("Please enter a title or keyword to search");
      return;
    }
    setOsStatus("loading");
    setOsMessage("");
    setOsResults([]);
    setSubError("");
    try {
      const languagesParam =
        selectedLang === "all" ? "en,hi,ur,ar,es,fr,de,tr" : selectedLang;
      const params = {
        query: q,
        languages: languagesParam,
      };
      if (Number(se) > 0) params.season = String(se);
      if (Number(ep) > 0) params.episode = String(ep);
      if (Number(se) > 0 || Number(ep) > 0) params.type = "episode";
      else params.type = "movie";

      const data = await searchSubtitles(params);
      if (!data.configured) {
        setOsStatus("need_key");
        setOsMessage("Online subtitles aren't set up yet. Add SUBDL_API_KEY to server/.dev.vars");
        return;
      }
      if (!data.ok) throw new Error(data.error || "Search failed");
      const list = Array.isArray(data.results) ? data.results : [];
      setOsResults(list);
      setOsStatus("ready");
      setOsMessage(
        list.length
          ? `Found ${list.length} subtitles · tap any to download and activate`
          : "No subtitles found. Try different keywords or select ALL languages."
      );
    } catch (err) {
      setOsStatus("error");
      setOsMessage(err?.message || "Subtitle search didn't work. Try again.");
      setOsResults([]);
    }
  }, [keywordQuery, selectedLang, se, ep]);

  // Upload local subtitle file (.srt / .vtt)
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
      setOsMessage(`Loaded ${track.cues.length} lines. Use Sync if timing needs adjusting.`);
    } catch (err) {
      setSubError(err?.message || "Couldn't load that subtitle file");
    } finally {
      setUploadBusy(false);
    }
  }, [onActiveSubIdChange, setSubtitles]);

  // Download chosen online subtitle
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
        setOsMessage(`Active: ${track.label} (${track.cues.length} lines)`);
        setOsResults([]);
      } catch (err) {
        setSubError(err?.message || "Couldn't download that subtitle");
      } finally {
        setOsLoadingId(null);
      }
    },
    [onActiveSubIdChange, setSubtitles]
  );

  // Sync adjustments
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
      setOffset(Math.round(((activeTrack.offset || 0) + delta) * 10) / 10);
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

  // Dialogue search
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
      const snippet = item.text.length > 28 ? `${item.text.slice(0, 28)}...` : item.text;
      setDialogueSyncToast(
        `Synced! Shifted by ${formatOffsetLabel(item.suggestedOffset)} for "${snippet}"`
      );
      setTimeout(() => setDialogueSyncToast(""), 4500);
    },
    [activeTrack, setOffset]
  );

  // Subtitle styling settings
  const currentSettings = subSettings || {
    fontSize: 16,
    bgColor: "rgba(0,0,0,0.6)",
    textColor: "#ffffff",
    elevation: 0,
  };

  const handleUpdateSetting = (key, val) => {
    if (onSubSettingsChange) {
      onSubSettingsChange({ ...currentSettings, [key]: val });
    }
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.body}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      nestedScrollEnabled={true}
    >
      // Header status row
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
          <Text style={styles.inactiveTrackText}>Subtitles: Off</Text>
        )}
      </View>

      // Top main navigation tabs: Search & Tracks | AI Sync & Timing | Appearance
      <View style={styles.mainNav}>
        <Pressable
          style={[styles.mainNavBtn, panelTab === "search" && styles.mainNavBtnActive]}
          onPress={() => setPanelTab("search")}
        >
          <Ionicons
            name="search"
            size={13}
            color={panelTab === "search" ? colors.accent : "rgba(255,255,255,0.6)"}
          />
          <Text
            style={[
              styles.mainNavText,
              panelTab === "search" && styles.mainNavTextActive,
            ]}
          >
            Search & Tracks
          </Text>
        </Pressable>

        <Pressable
          style={[styles.mainNavBtn, panelTab === "sync" && styles.mainNavBtnActive]}
          onPress={() => setPanelTab("sync")}
        >
          <Ionicons
            name="sparkles"
            size={13}
            color={panelTab === "sync" ? colors.accent : "rgba(255,255,255,0.6)"}
          />
          <Text
            style={[
              styles.mainNavText,
              panelTab === "sync" && styles.mainNavTextActive,
            ]}
          >
            AI Sync & Timing
          </Text>
        </Pressable>

        <Pressable
          style={[styles.mainNavBtn, panelTab === "style" && styles.mainNavBtnActive]}
          onPress={() => setPanelTab("style")}
        >
          <Ionicons
            name="color-palette-outline"
            size={13}
            color={panelTab === "style" ? colors.accent : "rgba(255,255,255,0.6)"}
          />
          <Text
            style={[
              styles.mainNavText,
              panelTab === "style" && styles.mainNavTextActive,
            ]}
          >
            Appearance
          </Text>
        </Pressable>
      </View>

      // TAB 1: Search & Tracks
      {panelTab === "search" ? (
        <View style={styles.tabContent}>
          // Quick actions: Off & Upload file
          <View style={styles.actionChipRow}>
            <Pressable
              style={[styles.miniChip, activeSubId === "off" && styles.miniChipActive]}
              onPress={() => onActiveSubIdChange("off")}
            >
              <Text
                style={[
                  styles.miniChipText,
                  activeSubId === "off" && styles.miniChipTextActive,
                ]}
              >
                Off
              </Text>
            </Pressable>

            <Pressable style={styles.miniChip} onPress={pickUpload} disabled={uploadBusy}>
              {uploadBusy ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <>
                  <Ionicons name="cloud-upload-outline" size={13} color="rgba(255,255,255,0.8)" />
                  <Text style={styles.miniChipText}>Upload File (.srt / .vtt)</Text>
                </>
              )}
            </Pressable>
          </View>

          // Online Subtitle Keyword Search Box
          <View style={styles.searchCard}>
            <View style={styles.searchHeader}>
              <Ionicons name="globe-outline" size={13} color={colors.accent} />
              <Text style={styles.searchCardTitle}>Search Online Subtitles (SubDL)</Text>
            </View>

            // Keyword input field
            <View style={styles.keywordInputWrap}>
              <Ionicons name="search" size={14} color="rgba(255,255,255,0.4)" style={styles.inputIcon} />
              <TextInput
                style={styles.keywordInput}
                placeholder="Search title, movie, series, or keywords..."
                placeholderTextColor="rgba(255,255,255,0.35)"
                value={keywordQuery}
                onChangeText={setKeywordQuery}
                returnKeyType="search"
                onSubmitEditing={searchOnline}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {keywordQuery ? (
                <Pressable onPress={() => setKeywordQuery("")} hitSlop={8} style={styles.clearBtn}>
                  <Ionicons name="close-circle" size={15} color="rgba(255,255,255,0.5)" />
                </Pressable>
              ) : null}
            </View>

            // Language Selector Chips
            <View style={styles.langRow}>
              <Text style={styles.langLabel}>Lang:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.langScroll}>
                {SUB_LANGUAGES.map((lang) => (
                  <Pressable
                    key={lang.id}
                    style={[styles.langChip, selectedLang === lang.id && styles.langChipActive]}
                    onPress={() => setSelectedLang(lang.id)}
                  >
                    <Text
                      style={[styles.langChipText, selectedLang === lang.id && styles.langChipTextActive]}
                    >
                      {lang.label}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            // Search Trigger Button
            <Pressable
              style={styles.searchSubmitBtn}
              onPress={searchOnline}
              disabled={osStatus === "loading"}
            >
              {osStatus === "loading" ? (
                <ActivityIndicator size="small" color={colors.accentInk} />
              ) : (
                <>
                  <Ionicons name="search" size={13} color={colors.accentInk} />
                  <Text style={styles.searchSubmitText}>Search SubDL</Text>
                </>
              )}
            </Pressable>
          </View>

          // Subtitle Status / Error / Information
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

          // Search Results
          {osResults.length > 0 ? (
            <View style={styles.resultsBox}>
              <Text style={styles.sectionHeader}>Available Online ({osResults.length})</Text>
              {osResults.map((item) => {
                const label = shortSubtitleLabel(item.release || item.file_name, item.language);
                const loading = osLoadingId === item.file_id;
                return (
                  <Pressable
                    key={item.id || item.file_id}
                    style={styles.resultItem}
                    disabled={loading}
                    onPress={() => loadOnline(item)}
                  >
                    <View style={styles.langBadge}>
                      <Text style={styles.langBadgeText}>
                        {String(item.language || "en").toUpperCase().slice(0, 3)}
                      </Text>
                    </View>
                    <View style={styles.resultCopy}>
                      <Text style={styles.resultName} numberOfLines={1}>
                        {label}
                      </Text>
                      {item.download_count ? (
                        <Text style={styles.resultMeta}>{item.download_count} downloads</Text>
                      ) : null}
                    </View>
                    {loading ? (
                      <ActivityIndicator size="small" color={colors.accent} />
                    ) : (
                      <View style={styles.downloadIconWrap}>
                        <Ionicons name="download" size={14} color={colors.accent} />
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          // Loaded Tracks List
          {subtitles.length > 0 ? (
            <View style={styles.loadedSection}>
              <Text style={styles.sectionHeader}>Loaded Subtitles</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.loadedStrip}>
                {subtitles.map((t) => (
                  <View
                    key={t.id}
                    style={[styles.loadedPill, t.id === activeSubId && styles.loadedPillActive]}
                  >
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
            </View>
          ) : null}
        </View>
      ) : null}

      // TAB 2: AI Sync & Timing
      {panelTab === "sync" ? (
        <View style={styles.tabContent}>
          {!activeTrack ? (
            <View style={styles.emptyCard}>
              <Ionicons name="information-circle-outline" size={24} color={colors.accent} />
              <Text style={styles.emptyCardTitle}>No Subtitle Track Selected</Text>
              <Text style={styles.emptyCardText}>
                Search online or select a loaded subtitle track in the "Search & Tracks" tab to sync timing.
              </Text>
            </View>
          ) : (
            <View style={styles.syncCard}>
              // Sub-tabs: AI Dialogue Sync vs Manual Timing
              <View style={styles.segmentedTabs}>
                <Pressable
                  style={[styles.segmentBtn, syncTab === "smart" && styles.segmentActive]}
                  onPress={() => setSyncTab("smart")}
                >
                  <Ionicons
                    name="sparkles"
                    size={12}
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
                    size={12}
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

              // AI Dialogue Sync content
              {syncTab === "smart" ? (
                <View style={styles.smartTabContent}>
                  <View style={styles.dialoguePromptBox}>
                    <View style={styles.dialoguePromptHeader}>
                      <Ionicons name="chatbubble-ellipses-outline" size={13} color="#a855f7" />
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
                                "{m.text}"
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
                                <Text style={styles.dialogueSyncBtnText}>Sync Here</Text>
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

                  // Current Timeline Cue card
                  <View style={styles.currentSpeechBox}>
                    <View style={styles.currentSpeechTop}>
                      <Text style={styles.microLabel}>CURRENT TIMELINE CUE</Text>
                      <Text style={styles.clockTag}>Video {formatClock(currentTime)}</Text>
                    </View>
                    <Text style={styles.currentSpeechText} numberOfLines={2}>
                      {cueText ? `"${cueText.replace(/\n/g, " ")}"` : "Silence / no line at this timestamp"}
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
                // Manual Timing content
                <View style={styles.manualTabContent}>
                  <View style={styles.offsetControlBox}>
                    <View style={styles.stepperTop}>
                      <Text style={styles.microLabel}>SYNC OFFSET</Text>
                      <Text style={styles.offsetReadout}>
                        {formatOffsetLabel(activeTrack.offset || 0)}
                      </Text>
                    </View>
                    <View style={styles.stepperRow}>
                      {[-5, -1, -0.5, -0.2].map((delta) => (
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
                      {[0.2, 0.5, 1, 5].map((delta) => (
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

                  // Drift Rate Correction
                  <View style={styles.speedBox}>
                    <Text style={styles.microLabel}>DRIFT CORRECTION (FRAME RATE)</Text>
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
                          1.00x Normal
                        </Text>
                      </Pressable>
                      <Pressable
                        style={[
                          styles.miniSpeedBtn,
                          Math.abs((activeTrack.rate || 1) - (23.976 / 25)) < 0.001 && styles.miniSpeedActive,
                        ]}
                        onPress={() => setRate(23.976 / 25)}
                      >
                        <Text
                          style={[
                            styles.miniSpeedText,
                            Math.abs((activeTrack.rate || 1) - (23.976 / 25)) < 0.001 && styles.miniSpeedTextActive,
                          ]}
                        >
                          23.98 -> 25 fps
                        </Text>
                      </Pressable>
                      <Pressable
                        style={[
                          styles.miniSpeedBtn,
                          Math.abs((activeTrack.rate || 1) - (25 / 23.976)) < 0.001 && styles.miniSpeedActive,
                        ]}
                        onPress={() => setRate(25 / 23.976)}
                      >
                        <Text
                          style={[
                            styles.miniSpeedText,
                            Math.abs((activeTrack.rate || 1) - (25 / 23.976)) < 0.001 && styles.miniSpeedTextActive,
                          ]}
                        >
                          25 -> 23.98 fps
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              )}
            </View>
          )}
        </View>
      ) : null}

      // TAB 3: Appearance & Style
      {panelTab === "style" ? (
        <View style={styles.tabContent}>
          // Live preview card
          <View style={styles.previewBox}>
            <Text style={styles.microLabel}>LIVE PREVIEW</Text>
            <View style={styles.previewStage}>
              <View
                style={[
                  styles.previewSubWrap,
                  {
                    backgroundColor: currentSettings.bgColor || "rgba(0,0,0,0.6)",
                  },
                  currentSettings.bgColor === "transparent" && styles.textShadowOutline,
                ]}
              >
                <Text
                  style={[
                    styles.previewSubText,
                    {
                      fontSize: currentSettings.fontSize || 16,
                      color: currentSettings.textColor || "#ffffff",
                    },
                    currentSettings.bgColor === "transparent" && styles.textShadowOutlineText,
                  ]}
                >
                  "The quick brown fox jumps over the lazy dog"
                </Text>
              </View>
            </View>
          </View>

          // Font Size Selector
          <View style={styles.settingGroup}>
            <Text style={styles.settingGroupTitle}>FONT SIZE</Text>
            <View style={styles.settingOptionsRow}>
              {FONT_SIZES.map((item) => (
                <Pressable
                  key={item.id}
                  style={[
                    styles.settingPill,
                    currentSettings.fontSize === item.size && styles.settingPillActive,
                  ]}
                  onPress={() => handleUpdateSetting("fontSize", item.size)}
                >
                  <Text
                    style={[
                      styles.settingPillText,
                      currentSettings.fontSize === item.size && styles.settingPillTextActive,
                    ]}
                  >
                    {item.label} ({item.size})
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          // Background Style Selector
          <View style={styles.settingGroup}>
            <Text style={styles.settingGroupTitle}>BACKGROUND STYLE</Text>
            <View style={styles.settingOptionsRow}>
              {BG_STYLES.map((item) => (
                <Pressable
                  key={item.id}
                  style={[
                    styles.settingPill,
                    currentSettings.bgColor === item.bg && styles.settingPillActive,
                  ]}
                  onPress={() => handleUpdateSetting("bgColor", item.bg)}
                >
                  <Text
                    style={[
                      styles.settingPillText,
                      currentSettings.bgColor === item.bg && styles.settingPillTextActive,
                    ]}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          // Text Color Selector
          <View style={styles.settingGroup}>
            <Text style={styles.settingGroupTitle}>TEXT COLOR</Text>
            <View style={styles.settingOptionsRow}>
              {TEXT_COLORS.map((item) => (
                <Pressable
                  key={item.id}
                  style={[
                    styles.settingPill,
                    currentSettings.textColor === item.color && styles.settingPillActive,
                  ]}
                  onPress={() => handleUpdateSetting("textColor", item.color)}
                >
                  <View style={[styles.colorDot, { backgroundColor: item.color }]} />
                  <Text
                    style={[
                      styles.settingPillText,
                      currentSettings.textColor === item.color && styles.settingPillTextActive,
                    ]}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          // Vertical Position
          <View style={styles.settingGroup}>
            <Text style={styles.settingGroupTitle}>VERTICAL POSITION</Text>
            <View style={styles.settingOptionsRow}>
              {POSITIONS.map((item) => (
                <Pressable
                  key={item.id}
                  style={[
                    styles.settingPill,
                    (currentSettings.elevation || 0) === item.elevation && styles.settingPillActive,
                  ]}
                  onPress={() => handleUpdateSetting("elevation", item.elevation)}
                >
                  <Text
                    style={[
                      styles.settingPillText,
                      (currentSettings.elevation || 0) === item.elevation && styles.settingPillTextActive,
                    ]}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    maxHeight: 520,
  },
  body: {
    paddingBottom: spacing.lg,
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
    paddingHorizontal: 8,
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
    maxWidth: 220,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#4ade80",
  },
  activeTrackText: {
    color: "#e2e2ec",
    fontSize: 11,
    fontWeight: "600",
  },
  inactiveTrackText: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 11,
    fontWeight: "600",
  },
  mainNav: {
    flexDirection: "row",
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: radii.sm,
    padding: 3,
    gap: 4,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  mainNavBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 7,
    borderRadius: 5,
  },
  mainNavBtnActive: {
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  mainNavText: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 11,
    fontWeight: "600",
  },
  mainNavTextActive: {
    color: colors.accent,
    fontWeight: "700",
  },
  tabContent: {
    gap: 8,
  },
  actionChipRow: {
    flexDirection: "row",
    gap: 6,
  },
  miniChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radii.sm,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  miniChipActive: {
    backgroundColor: "rgba(246,196,67,0.14)",
    borderColor: "rgba(246,196,67,0.45)",
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
  searchCard: {
    backgroundColor: "rgba(18,18,24,0.9)",
    borderRadius: radii.md,
    padding: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  searchHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  searchCardTitle: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  keywordInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: radii.sm,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    height: 36,
  },
  inputIcon: {
    marginRight: 6,
  },
  keywordInput: {
    flex: 1,
    color: "#fff",
    fontSize: 12,
    paddingVertical: 4,
  },
  clearBtn: {
    padding: 2,
  },
  langRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  langLabel: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 11,
    fontWeight: "600",
  },
  langScroll: {
    flexDirection: "row",
    gap: 5,
  },
  langChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  langChipActive: {
    backgroundColor: "rgba(246,196,67,0.18)",
    borderColor: colors.accent,
  },
  langChipText: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 10,
    fontWeight: "700",
  },
  langChipTextActive: {
    color: colors.accent,
  },
  searchSubmitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.accent,
    paddingVertical: 8,
    borderRadius: radii.sm,
  },
  searchSubmitText: {
    color: colors.accentInk,
    fontSize: 12,
    fontWeight: "800",
  },
  resultsBox: {
    backgroundColor: "rgba(14,14,20,0.85)",
    borderRadius: radii.md,
    padding: 10,
    gap: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  sectionHeader: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  resultItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: radii.sm,
    padding: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  langBadge: {
    backgroundColor: "rgba(246,196,67,0.15)",
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: "rgba(246,196,67,0.3)",
  },
  langBadgeText: {
    color: colors.accent,
    fontSize: 9,
    fontWeight: "800",
  },
  resultCopy: {
    flex: 1,
  },
  resultName: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "600",
  },
  resultMeta: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 9,
    marginTop: 2,
  },
  downloadIconWrap: {
    padding: 4,
  },
  loadedSection: {
    gap: 6,
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
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  loadedLabel: {
    color: "#e5e5ed",
    fontSize: 11,
    fontWeight: "600",
    maxWidth: 140,
  },
  loadedCount: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 10,
  },
  loadedRemoveBtn: {
    paddingHorizontal: 7,
    paddingVertical: 6,
    borderLeftWidth: 1,
    borderLeftColor: "rgba(255,255,255,0.08)",
  },
  emptyCard: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: radii.md,
    padding: 18,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  emptyCardTitle: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
  emptyCardText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 11,
    textAlign: "center",
    lineHeight: 16,
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
  previewBox: {
    backgroundColor: "rgba(0,0,0,0.4)",
    borderRadius: radii.md,
    padding: 10,
    gap: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  previewStage: {
    height: 70,
    backgroundColor: "rgba(20,20,30,0.8)",
    borderRadius: radii.sm,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  previewSubWrap: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radii.sm,
    maxWidth: "95%",
  },
  previewSubText: {
    fontWeight: "700",
    textAlign: "center",
  },
  textShadowOutline: {
    backgroundColor: "transparent",
  },
  textShadowOutlineText: {
    textShadowColor: "#000000",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  settingGroup: {
    gap: 6,
  },
  settingGroupTitle: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  settingOptionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  settingPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: radii.sm,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  settingPillActive: {
    backgroundColor: "rgba(246,196,67,0.15)",
    borderColor: colors.accent,
  },
  settingPillText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 11,
    fontWeight: "600",
  },
  settingPillTextActive: {
    color: colors.accent,
    fontWeight: "800",
  },
  colorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.3)",
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
