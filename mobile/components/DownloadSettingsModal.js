// Modal for configuring download concurrency, auto-resume, and background optimization
import { useEffect, useState } from "react";
import {
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  getDownloadSettings,
  setDownloadSettings,
  subscribeDownloadSettings,
} from "../lib/downloads";
import { colors, radii, spacing } from "../lib/theme";

const CONCURRENCY_OPTIONS = [
  { value: 1, label: "1 Video", hint: "Best for mobile data" },
  { value: 2, label: "2 Videos", hint: "Recommended" },
  { value: 3, label: "3 Videos", hint: "Fast Wi-Fi" },
  { value: 5, label: "5 Videos", hint: "Maximum speed" },
];

export default function DownloadSettingsModal({ visible, onClose }) {
  const [settings, setSettings] = useState(getDownloadSettings());

  useEffect(() => {
    if (!visible) return;
    const unsub = subscribeDownloadSettings((next) => {
      setSettings(next);
    });
    return unsub;
  }, [visible]);

  const onSelectConcurrency = (val) => {
    setDownloadSettings({ maxConcurrent: val }).catch(() => {});
  };

  const onToggleAutoResume = () => {
    setDownloadSettings({ autoResume: !settings.autoResume }).catch(() => {});
  };

  const onOpenAppSettings = async () => {
    try {
      await Linking.openSettings();
    } catch {
      // ignore
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.titleGroup}>
              <View style={styles.headerIcon}>
                <Ionicons name="settings-sharp" size={16} color={colors.accent} />
              </View>
              <Text style={styles.title}>Download Settings</Text>
            </View>
            <Pressable
              onPress={onClose}
              style={styles.closeBtn}
              hitSlop={8}
              accessibilityLabel="Close settings"
            >
              <Ionicons name="close" size={18} color="rgba(255,255,255,0.7)" />
            </Pressable>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.section}>
              <View style={styles.sectionHead}>
                <Ionicons name="layers-outline" size={16} color={colors.accent} />
                <Text style={styles.sectionTitle}>Simultaneous Downloads</Text>
              </View>
              <Text style={styles.sectionDesc}>
                Set how many videos download at the same time:
              </Text>
              <View style={styles.concurrencyGrid}>
                {CONCURRENCY_OPTIONS.map((opt) => {
                  const selected = settings.maxConcurrent === opt.value;
                  return (
                    <Pressable
                      key={opt.value}
                      style={[
                        styles.concurrencyPill,
                        selected && styles.concurrencyPillActive,
                      ]}
                      onPress={() => onSelectConcurrency(opt.value)}
                    >
                      <View style={styles.pillTop}>
                        <Text
                          style={[
                            styles.concurrencyValue,
                            selected && styles.concurrencyValueActive,
                          ]}
                        >
                          {opt.label}
                        </Text>
                        {selected ? (
                          <Ionicons
                            name="checkmark-circle"
                            size={14}
                            color={colors.accent}
                          />
                        ) : null}
                      </View>
                      <Text
                        style={[
                          styles.concurrencyHint,
                          selected && styles.concurrencyHintActive,
                        ]}
                      >
                        {opt.hint}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.section}>
              <View style={styles.toggleRow}>
                <View style={{ flex: 1, gap: 3 }}>
                  <View style={styles.sectionHead}>
                    <Ionicons
                      name="refresh-circle-outline"
                      size={17}
                      color={colors.accent}
                    />
                    <Text style={styles.sectionTitle}>Auto-Resume on Open</Text>
                  </View>
                  <Text style={styles.sectionDesc}>
                    Automatically resume queued & interrupted downloads when reopening MovieHunter
                  </Text>
                </View>
                <Pressable
                  style={[
                    styles.toggleTrack,
                    settings.autoResume && styles.toggleTrackActive,
                  ]}
                  onPress={onToggleAutoResume}
                >
                  <View
                    style={[
                      styles.toggleThumb,
                      settings.autoResume && styles.toggleThumbActive,
                    ]}
                  />
                </Pressable>
              </View>
            </View>

            <View style={styles.guideCard}>
              <View style={styles.guideHead}>
                <Ionicons name="information-circle-outline" size={17} color="#f6c443" />
                <Text style={styles.guideTitle}>Background Downloads</Text>
              </View>
              <Text style={styles.guideText}>
                When switching to heavy apps like Instagram or games, Android’s memory manager may kill background processes unless battery restrictions are lifted.
              </Text>
              <View style={styles.guidePoints}>
                <View style={styles.guideBullet}>
                  <Text style={styles.bulletDot}>•</Text>
                  <Text style={styles.bulletText}>
                    Set Battery to <Text style={styles.strongText}>Unrestricted</Text> in App Info so Android doesn’t pause MovieHunter.
                  </Text>
                </View>
                <View style={styles.guideBullet}>
                  <Text style={styles.bulletDot}>•</Text>
                  <Text style={styles.bulletText}>
                    Keep <Text style={styles.strongText}>Auto-Resume ON</Text> so downloads instantly continue whenever you return.
                  </Text>
                </View>
              </View>

              {Platform.OS === "android" ? (
                <Pressable
                  style={styles.batteryBtn}
                  onPress={onOpenAppSettings}
                >
                  <Ionicons
                    name="battery-charging-outline"
                    size={15}
                    color="#000"
                  />
                  <Text style={styles.batteryBtnText}>Open App Battery Settings</Text>
                </Pressable>
              ) : null}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    maxHeight: "86%",
    backgroundColor: "#121218",
    borderRadius: radii.lg || 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  titleGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerIcon: {
    width: 28,
    height: 28,
    borderRadius: 7,
    backgroundColor: "rgba(246,196,67,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 7,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: {
    maxHeight: 520,
  },
  scrollContent: {
    padding: 16,
    gap: 16,
  },
  section: {
    gap: 8,
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sectionTitle: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
  sectionDesc: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 11,
    lineHeight: 16,
  },
  concurrencyGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  concurrencyPill: {
    flex: 1,
    minWidth: "46%",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: radii.sm || 8,
    padding: 10,
    gap: 3,
  },
  concurrencyPillActive: {
    backgroundColor: "rgba(246,196,67,0.12)",
    borderColor: "rgba(246,196,67,0.5)",
  },
  pillTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  concurrencyValue: {
    color: "#cfcfdc",
    fontSize: 13,
    fontWeight: "700",
  },
  concurrencyValueActive: {
    color: colors.accent,
  },
  concurrencyHint: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 10,
  },
  concurrencyHintActive: {
    color: "rgba(246,196,67,0.8)",
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  toggleTrack: {
    width: 44,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.12)",
    padding: 2,
    justifyContent: "center",
  },
  toggleTrackActive: {
    backgroundColor: colors.accent,
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#fff",
  },
  toggleThumbActive: {
    alignSelf: "flex-end",
    backgroundColor: "#000",
  },
  guideCard: {
    backgroundColor: "rgba(246,196,67,0.06)",
    borderWidth: 1,
    borderColor: "rgba(246,196,67,0.2)",
    borderRadius: radii.md || 10,
    padding: 12,
    gap: 8,
  },
  guideHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  guideTitle: {
    color: "#f6c443",
    fontSize: 12,
    fontWeight: "700",
  },
  guideText: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 11,
    lineHeight: 16,
  },
  guidePoints: {
    gap: 4,
  },
  guideBullet: {
    flexDirection: "row",
    gap: 6,
  },
  bulletDot: {
    color: "#f6c443",
    fontSize: 12,
    lineHeight: 16,
  },
  bulletText: {
    flex: 1,
    color: "rgba(255,255,255,0.6)",
    fontSize: 11,
    lineHeight: 16,
  },
  strongText: {
    color: "#fff",
    fontWeight: "700",
  },
  batteryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.accent,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radii.sm || 6,
    marginTop: 4,
  },
  batteryBtnText: {
    color: "#000",
    fontSize: 11,
    fontWeight: "800",
  },
});
