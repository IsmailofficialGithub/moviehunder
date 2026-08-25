import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  getMusicState,
  stopMusic,
  subscribeMusicPlayer,
  togglePlayPause,
} from "../lib/musicPlayer";
import { colors, spacing } from "../lib/theme";

/**
 * Top bar (under status bar) on every screen while a track is active.
 */
export default function MusicNowPlayingBanner({ onOpen }) {
  const insets = useSafeAreaInsets();
  const [state, setState] = useState(getMusicState());

  useEffect(() => subscribeMusicPlayer(setState), []);

  if (!state?.track) return null;
  const t = state.track;

  return (
    <View style={[styles.wrap, { paddingTop: Math.max(insets.top, 4) }]}>
      <Pressable style={styles.row} onPress={onOpen}>
        {t.image ? (
          <Image source={{ uri: t.image }} style={styles.art} contentFit="cover" />
        ) : (
          <View style={[styles.art, styles.artEmpty]}>
            <Ionicons name="musical-notes" size={14} color={colors.muted} />
          </View>
        )}
        <View style={styles.copy}>
          <Text style={styles.label}>
            {state.playing ? "Now playing" : "Paused"}
          </Text>
          <Text style={styles.title} numberOfLines={1}>
            {t.name}
          </Text>
        </View>
        <Pressable
          onPress={(e) => {
            e?.stopPropagation?.();
            togglePlayPause();
          }}
          style={styles.btn}
          hitSlop={8}
        >
          <Ionicons
            name={state.playing ? "pause" : "play"}
            size={20}
            color={colors.text}
          />
        </Pressable>
        <Pressable
          onPress={(e) => {
            e?.stopPropagation?.();
            stopMusic();
          }}
          style={styles.btn}
          hitSlop={8}
        >
          <Ionicons name="stop" size={18} color={colors.danger} />
        </Pressable>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.panel,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.sm,
    paddingBottom: 8,
    gap: 8,
  },
  art: {
    width: 36,
    height: 36,
    borderRadius: 6,
    backgroundColor: colors.panelSoft,
  },
  artEmpty: { alignItems: "center", justifyContent: "center" },
  copy: { flex: 1, minWidth: 0 },
  label: {
    color: colors.secondary,
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  title: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  btn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
});
