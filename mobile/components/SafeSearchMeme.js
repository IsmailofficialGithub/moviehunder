import { useEffect } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useVideoPlayer } from "expo-video/build/VideoPlayer";
import { VideoView } from "expo-video/build/VideoView";
import { colors, spacing } from "../lib/theme";

const MEME_SOURCE = require("../assets/18+meme.mp4");

/**
 * Full-width looping meme for blocked searches (with sound).
 * Stops as soon as `active` becomes false or the component unmounts.
 */
export default function SafeSearchMeme({ active = true }) {
  const { width, height } = useWindowDimensions();
  const player = useVideoPlayer(MEME_SOURCE, (p) => {
    p.loop = true;
    p.muted = false;
    p.volume = 1;
  });

  useEffect(() => {
    const stop = () => {
      try {
        player.pause();
        player.muted = true;
        if (typeof player.currentTime === "number") player.currentTime = 0;
      } catch {
        /* ignore */
      }
    };

    try {
      if (active) {
        player.loop = true;
        player.muted = false;
        player.volume = 1;
        player.play();
      } else {
        stop();
      }
    } catch {
      /* ignore */
    }

    return stop;
  }, [active, player]);

  // Near full-width on phones and large screens
  const videoW = Math.max(280, width - spacing.md * 2);
  const videoH = Math.min(
    Math.round(height * 0.68),
    Math.round(videoW * 1.25)
  );

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={[styles.frame, { width: videoW, height: videoH }]}>
        <VideoView
          style={styles.video}
          player={player}
          contentFit="contain"
          nativeControls={false}
          allowsFullscreen={false}
          allowsPictureInPicture={false}
        />
      </View>
      <Text style={styles.caption}>Keep your search clean, beta.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  frame: {
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#000",
    borderWidth: 1,
    borderColor: colors.line,
    maxWidth: "100%",
  },
  video: {
    width: "100%",
    height: "100%",
  },
  caption: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
    maxWidth: 320,
  },
});
