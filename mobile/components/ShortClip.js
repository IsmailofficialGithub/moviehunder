import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { useVideoPlayer } from "expo-video/build/VideoPlayer";
import { VideoView } from "expo-video/build/VideoView";
import Ionicons from "@expo/vector-icons/Ionicons";
import { pickAutoIndex, proxiedMediaUrl } from "../lib/stream";
import { prefetchStreams } from "../lib/streamCache";
import { colors, spacing } from "../lib/theme";

export default function ShortClip({
  item,
  subjectId,
  detailPath,
  title,
  poster,
  isActive,
  height,
  total,
}) {
  const [playUri, setPlayUri] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const player = useVideoPlayer(null, (p) => {
    p.loop = true;
  });

  useEffect(() => {
    if (!isActive || !subjectId || !detailPath || !item) return;
    let cancelled = false;
    setLoading(true);
    setError("");

    (async () => {
      try {
        const result = await prefetchStreams({
          subjectId: String(subjectId),
          detailPath,
          se: String(item.se ?? 1),
          ep: String(item.ep ?? 1),
        });
        const idx = pickAutoIndex(result.sources, 720);
        const url = proxiedMediaUrl(result.sources[idx]?.url);
        if (!url) throw new Error("No stream");
        if (!cancelled) setPlayUri(url);
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || "Couldn’t load");
          setPlayUri(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isActive, subjectId, detailPath, item?.se, item?.ep]);

  useEffect(() => {
    if (!playUri) return;
    try {
      if (typeof player.replaceAsync === "function") {
        player.replaceAsync(playUri).then(() => {
          if (isActive) player.play();
        });
      } else {
        player.replace(playUri, true);
        if (isActive) player.play();
      }
    } catch {
      /* ignore */
    }
  }, [playUri, isActive, player]);

  useEffect(() => {
    if (!isActive) {
      try {
        player.pause();
      } catch {
        /* ignore */
      }
    }
  }, [isActive, player]);

  const togglePlay = () => {
    try {
      if (player.playing) player.pause();
      else player.play();
    } catch {
      /* ignore */
    }
  };

  return (
    <Pressable style={[styles.clip, { height }]} onPress={togglePlay}>
      {poster ? (
        <Image
          source={{ uri: poster }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="memory-disk"
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.fallback]} />
      )}

      {playUri ? (
        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          nativeControls={false}
        />
      ) : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.secondary} />
        </View>
      ) : null}

      {error && !playUri ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={32} color={colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <View style={styles.gradient} pointerEvents="none" />

      <View style={styles.meta} pointerEvents="none">
        <Text style={styles.showTitle} numberOfLines={2}>
          {title}
        </Text>
        <Text style={styles.epLabel}>
          Part {item?.ep ?? 1}
          {total ? ` · ${total} parts` : ""}
        </Text>
      </View>

      {!player.playing && playUri && isActive ? (
        <View style={styles.playHint} pointerEvents="none">
          <Ionicons name="play" size={40} color="rgba(255,255,255,0.85)" />
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  clip: {
    width: "100%",
    backgroundColor: "#000",
    overflow: "hidden",
  },
  fallback: {
    backgroundColor: colors.panel,
  },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    padding: spacing.lg,
  },
  errorText: {
    color: colors.text,
    textAlign: "center",
    fontSize: 13,
  },
  gradient: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 160,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  meta: {
    position: "absolute",
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.lg + 8,
    gap: 4,
  },
  showTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "800",
    lineHeight: 22,
  },
  epLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "600",
  },
  playHint: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
});
