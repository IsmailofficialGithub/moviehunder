import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  checkForAppUpdate,
  downloadAndInstallApk,
  openReleasesPage,
} from "../lib/appUpdate";
import { colors, radii, spacing } from "../lib/theme";

/**
 * Force-update gate + optional soft-update sheet.
 * Returns { blocking, checking } so the root layout can pause the app.
 */
export function useAppUpdateCheck({ enabled = true } = {}) {
  const [checking, setChecking] = useState(Boolean(enabled));
  const [info, setInfo] = useState(null);
  const [softVisible, setSoftVisible] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);

  const runCheck = useCallback(async () => {
    if (!enabled) {
      setChecking(false);
      setInfo(null);
      return;
    }
    setChecking(true);
    setError("");
    try {
      const next = await checkForAppUpdate();
      setInfo(next);
      if (next?.updateAvailable && !next.force) {
        setSoftVisible(true);
      }
    } catch {
      // Fail open — don't brick the app if GitHub/CDN is down
      setInfo(null);
    } finally {
      setChecking(false);
    }
  }, [enabled]);

  useEffect(() => {
    runCheck();
  }, [runCheck]);

  const startUpdate = useCallback(async () => {
    if (!info) return;
    setBusy(true);
    setError("");
    setProgress(0);
    try {
      if (info.canInstallApk && info.apkUrl) {
        const result = await downloadAndInstallApk(info.apkUrl, setProgress);
        if (!result.ok) {
          setError(
            result.error ||
              "Update failed. If Android says “App not installed”, uninstall the old app once, then install v0.0.2 from GitHub — after that, in-app updates work (same signing key)."
          );
        }
      } else {
        const opened = await openReleasesPage();
        if (!opened) {
          setError("No download URL configured");
        }
      }
    } catch (err) {
      setError(err?.message || "Update failed");
    } finally {
      setBusy(false);
    }
  }, [info]);

  const dismissSoft = useCallback(() => setSoftVisible(false), []);

  const blocking = Boolean(info?.force && info?.updateAvailable);

  return {
    checking,
    blocking,
    info,
    softVisible: softVisible && info?.updateAvailable && !info?.force,
    error,
    busy,
    progress,
    startUpdate,
    dismissSoft,
    recheck: runCheck,
  };
}

export function AppUpdateGate({
  info,
  force,
  busy,
  progress,
  error,
  onUpdate,
  onLater,
}) {
  const insets = useSafeAreaInsets();
  if (!info) return null;

  const pct = Math.round((progress || 0) * 100);
  const releaseMetadata = info.releaseMetadata;
  const changeGroups = [
    ["Added", releaseMetadata?.added],
    ["Changed", releaseMetadata?.changed],
    ["Fixed", releaseMetadata?.fixed],
    ["Removed", releaseMetadata?.removed],
  ].filter(([, items]) => items?.length);

  return (
    <View
      style={[
        styles.forceWrap,
        force ? styles.forceFull : styles.softSheet,
        { paddingBottom: insets.bottom + 16, paddingTop: force ? insets.top + 24 : 16 },
      ]}
    >
      <Ionicons
        name={force ? "cloud-download-outline" : "arrow-up-circle-outline"}
        size={force ? 56 : 36}
        color={colors.secondary}
      />
      <Text style={styles.title}>
        {force ? "Update required" : "Update available"}
      </Text>
      <Text style={styles.meta}>
        v{info.currentVersion} → v{info.latestVersion}
      </Text>
      {releaseMetadata?.summary ? (
        <Text style={styles.notes}>{releaseMetadata.summary}</Text>
      ) : info.releaseNotes ? (
        <Text style={styles.notes}>{info.releaseNotes}</Text>
      ) : (
        <Text style={styles.notes}>
          A newer version of MovieHunter is ready. Install it to keep using the
          app.
        </Text>
      )}
      {changeGroups.length ? (
        <View style={styles.changes}>
          {changeGroups.map(([label, items]) => (
            <View key={label} style={styles.changeGroup}>
              <Text style={styles.changeTitle}>{label}</Text>
              {items.map((item) => (
                <Text key={`${label}-${item}`} style={styles.changeItem}>
                  • {item}
                </Text>
              ))}
            </View>
          ))}
        </View>
      ) : null}

      {busy ? (
        <View style={styles.progressBlock}>
          <ActivityIndicator color={colors.secondary} />
          <Text style={styles.progressText}>
            {pct > 0 ? `Downloading ${pct}%` : "Starting download…"}
          </Text>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${pct}%` }]} />
          </View>
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        style={[styles.primaryBtn, busy && styles.btnDisabled]}
        disabled={busy}
        onPress={onUpdate}
      >
        <Ionicons name="download-outline" size={18} color={colors.accentInk} />
        <Text style={styles.primaryText}>
          {info.canInstallApk ? "Download & install" : "Get update"}
        </Text>
      </Pressable>

      {!force && onLater ? (
        <Pressable style={styles.laterBtn} disabled={busy} onPress={onLater}>
          <Text style={styles.laterText}>Later</Text>
        </Pressable>
      ) : null}

      {!info.canInstallApk ? (
        <Text style={styles.hint}>
          Opens the GitHub releases page. Use a release APK build for in-app
          install.
        </Text>
      ) : null}
    </View>
  );
}

/** Soft update as a modal sheet over the app. */
export function SoftUpdateModal({
  visible,
  info,
  busy,
  progress,
  error,
  onUpdate,
  onLater,
}) {
  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.modalBg}>
        <AppUpdateGate
          info={info}
          force={false}
          busy={busy}
          progress={progress}
          error={error}
          onUpdate={onUpdate}
          onLater={onLater}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  forceWrap: {
    backgroundColor: colors.bg,
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    gap: 8,
  },
  forceFull: {
    flex: 1,
    justifyContent: "center",
  },
  softSheet: {
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
    paddingTop: spacing.md,
  },
  modalBg: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "800",
    marginTop: 8,
  },
  meta: {
    color: colors.secondary,
    fontWeight: "700",
    fontSize: 13,
  },
  notes: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    marginTop: 6,
    marginBottom: 8,
    maxWidth: 340,
  },
  changes: {
    width: "100%",
    maxWidth: 360,
    gap: 8,
    marginTop: 4,
    marginBottom: 4,
  },
  changeGroup: {
    gap: 2,
  },
  changeTitle: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "800",
  },
  changeItem: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  progressBlock: {
    width: "100%",
    maxWidth: 320,
    alignItems: "center",
    gap: 8,
    marginVertical: 8,
  },
  progressText: { color: colors.muted, fontSize: 12, fontWeight: "600" },
  barTrack: {
    width: "100%",
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.panelSoft,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    backgroundColor: colors.secondary,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    textAlign: "center",
    marginBottom: 4,
  },
  primaryBtn: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.accent,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: radii.pill,
  },
  primaryText: {
    color: colors.accentInk,
    fontWeight: "800",
    fontSize: 14,
  },
  btnDisabled: { opacity: 0.55 },
  laterBtn: { paddingVertical: 12, paddingHorizontal: 16 },
  laterText: { color: colors.muted, fontWeight: "700", fontSize: 13 },
  hint: {
    color: colors.muted,
    fontSize: 11,
    textAlign: "center",
    marginTop: 8,
    opacity: 0.85,
    maxWidth: 300,
  },
});
