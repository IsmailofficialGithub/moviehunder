import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useVideoPlayer } from "expo-video/build/VideoPlayer";
import { VideoView } from "expo-video/build/VideoView";
import Ionicons from "@expo/vector-icons/Ionicons";
import { pickAutoIndex, proxiedMediaUrl } from "../lib/stream";
import { prefetchStreams } from "../lib/streamCache";
import { openCatalogTitle } from "../lib/catalogNav";
import { colors, radii, spacing } from "../lib/theme";

export default function MobilePreviewModal({ visible, item, onClose }) {
  const router = useRouter();
  const [playUri, setPlayUri] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [videoLoaded, setVideoLoaded] = useState(false);
  const soughtRef = useRef(false);

  const player = useVideoPlayer(null, (p) => {
    p.loop = true;
    p.muted = true;
  });

  // Resolve stream when item is selected
  useEffect(() => {
    if (!visible || !item) {
      setPlayUri(null);
      setVideoLoaded(false);
      soughtRef.current = false;
      try {
        player.pause();
      } catch {}
      return;
    }

    let cancelled = false;
    setLoading(true);
    setVideoLoaded(false);
    soughtRef.current = false;

    (async () => {
      try {
        const slug = item.slug || "";
        const subjectId = item.subject_id || item.id || slug;
        const result = await prefetchStreams({
          subjectId: String(subjectId),
          detailPath: slug,
          se: String(item.se ?? 1),
          ep: String(item.ep ?? 1),
        });

        // Prefer 360p or 480p for instant playback without delay
        const idx = pickAutoIndex(result.sources, 480);
        const chosen = result.sources[idx] || result.sources[0];
        const url = proxiedMediaUrl(chosen?.url);

        if (!cancelled && url) {
          setPlayUri(url);
        }
      } catch {
        // Stream lookup failed; preview will show static poster with play button
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visible, item, player]);

  // Load stream into player
  useEffect(() => {
    if (!visible || !playUri) return;
    try {
      player.muted = isMuted;
      if (typeof player.replaceAsync === "function") {
        player.replaceAsync(playUri).then(() => {
          if (visible) {
            player.play();
          }
        });
      } else {
        player.replace(playUri, true);
        if (visible) {
          player.play();
        }
      }
    } catch {
      /* ignore */
    }
  }, [visible, playUri, player, isMuted]);

  // Skip 1-minute intro on first playback (start around 75s)
  useEffect(() => {
    if (!player) return;
    const sub = player.addListener("timeUpdate", () => {
      setVideoLoaded(true);
      if (!soughtRef.current && (player.currentTime || 0) < 60) {
        soughtRef.current = true;
        try {
          player.currentTime = 75;
        } catch {}
      }
    });
    return () => sub?.remove?.();
  }, [player]);

  const toggleMute = () => {
    setIsMuted((prev) => {
      const next = !prev;
      try {
        player.muted = next;
      } catch {}
      return next;
    });
  };

  const handlePlay = () => {
    onClose?.();
    if (!item) return;
    const slug = item.slug || "";
    const subjectId = item.subject_id || item.id || slug;
    router.push({
      pathname: "/play",
      params: {
        subjectId: String(subjectId),
        detail_path: slug,
        se: String(item.se ?? "0"),
        ep: String(item.ep ?? "0"),
        title: item.name || "Now playing",
        poster: item.poster_url || "",
        kind: Number(item.se) > 0 || Number(item.ep) > 0 ? "series" : "movie",
        autoplay: "1",
      },
    });
  };

  const handleDetails = () => {
    onClose?.();
    if (item?.slug) {
      openCatalogTitle(item.slug);
    }
  };

  if (!visible || !item) return null;

  const isHindi =
    item.dub_lang === "hi" ||
    /hindi/i.test(String(item.badge || "")) ||
    /\[\s*hindi\s*\]|\(\s*hindi\s*\)/i.test(String(item.name || ""));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
          {/* Header video / poster area (16:9 ratio) */}
          <View style={styles.mediaWrap}>
            {item.poster_url ? (
              <Image
                source={{ uri: item.poster_url }}
                style={styles.backdropPoster}
                contentFit="cover"
                blurRadius={videoLoaded ? 0 : 4}
              />
            ) : (
              <View style={[styles.backdropPoster, styles.placeholder]}>
                <Ionicons name="film-outline" size={32} color={colors.muted} />
              </View>
            )}

            {playUri ? (
              <VideoView
                player={player}
                style={[styles.videoView, !videoLoaded && styles.videoHidden]}
                contentFit="cover"
                nativeControls={false}
              />
            ) : null}

            {loading ? (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="small" color={colors.accentLight} />
              </View>
            ) : null}

            {/* Mute toggle button */}
            {playUri && videoLoaded ? (
              <Pressable
                style={styles.soundBtn}
                onPress={toggleMute}
                hitSlop={8}
              >
                <Ionicons
                  name={isMuted ? "volume-mute" : "volume-high"}
                  size={14}
                  color="#fff"
                />
              </Pressable>
            ) : null}

            {/* Close button */}
            <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={18} color="#fff" />
            </Pressable>
          </View>

          {/* Details & Action controls */}
          <View style={styles.body}>
            <Text style={styles.title} numberOfLines={2}>
              {item.name || "Untitled"}
            </Text>

            <View style={styles.metaRow}>
              {item.rating ? (
                <View style={styles.ratingBadge}>
                  <Ionicons name="star" size={11} color={colors.gold} />
                  <Text style={styles.ratingText}>{item.rating}</Text>
                </View>
              ) : null}

              {item.year ? (
                <Text style={styles.metaText}>{String(item.year).slice(0, 4)}</Text>
              ) : null}

              {isHindi ? (
                <View style={styles.langBadge}>
                  <Text style={styles.langBadgeText}>Hindi</Text>
                </View>
              ) : null}

              {item.badge ? (
                <View style={styles.tagBadge}>
                  <Text style={styles.tagBadgeText}>{item.badge}</Text>
                </View>
              ) : null}
            </View>

            {/* Buttons */}
            <View style={styles.actionsRow}>
              <Pressable style={styles.playBtn} onPress={handlePlay}>
                <Ionicons name="play" size={16} color={colors.accentInk} />
                <Text style={styles.playBtnText}>Watch Now</Text>
              </Pressable>

              <Pressable style={styles.detailsBtn} onPress={handleDetails}>
                <Ionicons
                  name="information-circle-outline"
                  size={16}
                  color={colors.accentLight}
                />
                <Text style={styles.detailsBtnText}>Details</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.78)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: colors.panel,
    borderRadius: radii.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.line,
    elevation: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.6,
    shadowRadius: 18,
  },
  mediaWrap: {
    width: "100%",
    aspectRatio: 16 / 9,
    position: "relative",
    backgroundColor: "#000",
  },
  backdropPoster: {
    ...StyleSheet.absoluteFillObject,
  },
  placeholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  videoView: {
    ...StyleSheet.absoluteFillObject,
  },
  videoHidden: {
    opacity: 0,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  soundBtn: {
    position: "absolute",
    bottom: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtn: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    padding: spacing.md,
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 22,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  ratingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  ratingText: {
    color: colors.gold,
    fontSize: 12,
    fontWeight: "700",
  },
  metaText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "500",
  },
  langBadge: {
    backgroundColor: "rgba(90, 0, 162, 0.92)",
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  langBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
  },
  tagBadge: {
    backgroundColor: colors.panelSoft,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  tagBadgeText: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "600",
  },
  actionsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  playBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.accent,
    paddingVertical: 10,
    borderRadius: radii.md,
  },
  playBtnText: {
    color: colors.accentInk,
    fontSize: 13,
    fontWeight: "700",
  },
  detailsBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.panelSoft,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: 10,
    borderRadius: radii.md,
  },
  detailsBtnText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "600",
  },
});
