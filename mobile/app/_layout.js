import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Platform, StyleSheet, Text, View } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { NavigationBar } from "expo-navigation-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import AccessBlocked from "../components/AccessBlocked";
import AppSplash from "../components/AppSplash";
import { BrandLogoSymbol } from "../components/BrandLogo";
import {
  AppUpdateGate,
  SoftUpdateModal,
  useAppUpdateCheck,
} from "../components/AppUpdateGate";
import MusicNowPlayingBanner from "../components/MusicNowPlayingBanner";
import MusicPlayerModal from "../components/MusicPlayerModal";
import { useAccessGate } from "../lib/useAccessGate";
import Constants from "expo-constants";
import { setupMusicNotifications } from "../lib/musicNotification";
import { openMusicPlayer, registerMusicPlayerOpener } from "../lib/musicUi";
import { colors } from "../lib/theme";

const IS_EXPO_GO =
  Constants.appOwnership === "expo" ||
  Constants.executionEnvironment === "storeClient";

/** Skip splash on dev reload — only show on first open this session. */
let splashShownThisSession = false;

function BootScreen({ label = "Loading…" }) {
  return (
    <View style={styles.center}>
      <BrandLogoSymbol size={56} />
      <ActivityIndicator
        size="large"
        color={colors.secondary}
        style={styles.bootSpinner}
      />
      <Text style={styles.bootLabel}>{label}</Text>
    </View>
  );
}

export default function RootLayout() {
  const [splashDone, setSplashDone] = useState(splashShownThisSession);
  const [showPlayer, setShowPlayer] = useState(false);

  const update = useAppUpdateCheck({ enabled: splashDone });

  const { access, blocked, allowed, checking, recheck } = useAccessGate({
    enabled: splashDone && !update.checking && !update.blocking,
  });

  const onSplashDone = useCallback(() => {
    splashShownThisSession = true;
    setSplashDone(true);
  }, []);

  useEffect(() => {
    return registerMusicPlayerOpener(() => setShowPlayer(true));
  }, []);

  useEffect(() => {
    if (!allowed || IS_EXPO_GO) return;
    setupMusicNotifications().catch(() => {});
  }, [allowed]);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    // SDK 57+: background/behavior APIs removed — only style + hidden remain
    try {
      NavigationBar.setStyle("light");
    } catch {
      /* Expo Go / unsupported */
    }
  }, []);

  const showUpdateCheck =
    splashDone && update.checking && !update.blocking;
  const showForceUpdate = splashDone && update.blocking;
  const showInitialLoader =
    splashDone &&
    !update.checking &&
    !update.blocking &&
    checking &&
    !blocked;
  const showApp =
    splashDone &&
    !update.checking &&
    !update.blocking &&
    allowed &&
    !checking;
  const showBlocked =
    splashDone && !update.checking && !update.blocking && blocked;

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <View style={styles.root}>
        {!splashDone ? (
          <AppSplash onDone={onSplashDone} />
        ) : showForceUpdate ? (
          <AppUpdateGate
            info={update.info}
            force
            busy={update.busy}
            progress={update.progress}
            error={update.error}
            onUpdate={update.startUpdate}
          />
        ) : showUpdateCheck ? (
          <BootScreen label="Checking for updates…" />
        ) : showInitialLoader ? (
          <BootScreen label="Getting things ready…" />
        ) : showBlocked ? (
          <AccessBlocked reason={access?.reason} onRetry={recheck} />
        ) : showApp ? (
          <View style={styles.root}>
            <MusicNowPlayingBanner onOpen={() => openMusicPlayer()} />
            <View style={styles.stack}>
              <Stack
                screenOptions={{
                  headerStyle: { backgroundColor: colors.bg },
                  headerTintColor: colors.accentLight || colors.accent,
                  headerTitleStyle: { color: colors.text, fontWeight: "700" },
                  contentStyle: { backgroundColor: colors.bg },
                }}
              >
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen
                  name="history"
                  options={{ headerShown: false }}
                />
                <Stack.Screen name="title/[slug]" options={{ headerShown: false }} />
                <Stack.Screen name="shorts/[slug]" options={{ headerShown: false }} />
                <Stack.Screen
                  name="play"
                  options={{
                    headerShown: false,
                    contentStyle: {
                      backgroundColor: "#000",
                      margin: 0,
                      padding: 0,
                    },
                  }}
                />
              </Stack>
            </View>
            <MusicPlayerModal
              visible={showPlayer}
              onClose={() => setShowPlayer(false)}
            />
            <SoftUpdateModal
              visible={update.softVisible}
              info={update.info}
              busy={update.busy}
              progress={update.progress}
              error={update.error}
              onUpdate={update.startUpdate}
              onLater={update.dismissSoft}
            />
          </View>
        ) : null}
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  stack: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg,
    gap: 16,
  },
  bootSpinner: {
    marginTop: 20,
  },
  bootLabel: {
    marginTop: 4,
    color: colors.muted,
    fontSize: 13,
    fontWeight: "600",
  },
});
