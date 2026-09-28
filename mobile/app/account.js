import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import Constants from "expo-constants";
import AuthModal from "../components/AuthModal";
import DetailHeader from "../components/DetailHeader";
import { useAuth } from "../lib/AuthProvider";
import {
  linkGoogle,
  resendVerification,
  setPassword,
  storeSession,
  verifyEmail,
} from "../lib/auth";
import { getDownloadSettings, setDownloadSettings, subscribeDownloadSettings } from "../lib/downloads";
import { runFullSync } from "../lib/sync";
import { colors, radii, spacing } from "../lib/theme";

const CONCURRENCY_OPTIONS = [
  { value: 1, label: "1 Video" },
  { value: 2, label: "2 Videos" },
  { value: 3, label: "3 Videos" },
  { value: 5, label: "5 Videos" },
];

export default function AccountScreen() {
  const { user, loading, logout, providers, hasPassword, refresh } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [dlSettings, setDlSettings] = useState(getDownloadSettings());

  useEffect(() => {
    const unsub = subscribeDownloadSettings((next) => setDlSettings(next));
    return unsub;
  }, []);

  useEffect(() => {
    const access = params.access_token;
    const refreshToken = params.refresh_token;
    const verify = params.verify;
    if (!access && !refreshToken && !verify) return;
    (async () => {
      try {
        if (verify) {
          await verifyEmail(String(verify));
          setMsg("Email verified successfully.");
          return;
        }
        if (access && refreshToken) {
          await storeSession({
            access_token: String(access),
            refresh_token: String(refreshToken),
          });
          await refresh();
          runFullSync().catch(() => { });
          setMsg("Signed in successfully.");
        }
      } catch (e) {
        setError(e.message || "Callback failed");
      }
    })();
  }, [params, refresh]);

  async function triggerManualSync() {
    setSyncBusy(true);
    setError("");
    setMsg("");
    try {
      await runFullSync();
      setMsg("Library and watch progress synced.");
    } catch (e) {
      setError(e.message || "Sync failed.");
    } finally {
      setSyncBusy(false);
    }
  }

  const appVersion = Constants.expoConfig?.version || "1.0.0";

  if (loading) {
    return (
      <View style={styles.root}>
        <DetailHeader title="Settings" />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.secondary} />
        </View>
      </View>
    );
  }

  const avatarUrl = user?.picture || user?.avatar_url || user?.user_metadata?.avatar_url;
  const initialLetter = (user?.display_name || user?.email || "U").slice(0, 1).toUpperCase();

  return (
    <View style={styles.root}>
      <DetailHeader title="Settings" />

      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.container}>


          {/* Section: ACCOUNT */}
          <View style={styles.section}>
            <Text style={styles.sectionCategoryLabel}>ACCOUNT</Text>
            {user ? (
              // Logged in user profile card
              <View style={styles.card}>
                <View style={styles.profileRow}>
                  <View style={styles.avatarWrap}>
                    {avatarUrl ? (
                      <Image source={{ uri: avatarUrl }} style={styles.avatarImg} />
                    ) : (
                      <View style={styles.avatarFallback}>
                        <Text style={styles.avatarLetter}>{initialLetter}</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.profileInfo}>
                    <Text style={styles.userName}>{user.display_name || user.email?.split("@")[0]}</Text>
                    <Text style={styles.userEmail}>{user.email}</Text>
                    <View style={styles.badgeRow}>
                      <View style={[styles.badge, user.email_verified ? styles.badgeSuccess : styles.badgeWarn]}>
                        <Ionicons
                          name={user.email_verified ? "checkmark-circle" : "alert-circle"}
                          size={12}
                          color={user.email_verified ? "#4ade80" : "#fbbf24"}
                        />
                        <Text style={[styles.badgeText, { color: user.email_verified ? "#4ade80" : "#fbbf24" }]}>
                          {user.email_verified ? "Verified" : "Unverified"}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>

                {/* Account Actions */}
                <View style={styles.userActionsGroup}>
                  {!user.email_verified && (
                    <Pressable
                      style={styles.actionRowBtn}
                      disabled={busy}
                      onPress={async () => {
                        setBusy(true);
                        try {
                          await resendVerification();
                          setMsg("Verification email sent.");
                        } catch (e) {
                          setError(e.message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      <Ionicons name="mail-unread-outline" size={18} color={colors.secondary} />
                      <Text style={styles.actionRowText}>Resend Email Verification</Text>
                    </Pressable>
                  )}

                  {!providers?.includes("google") && (
                    <Pressable
                      style={styles.actionRowBtn}
                      onPress={async () => {
                        try {
                          const data = await linkGoogle();
                          if (data.url) await Linking.openURL(data.url);
                        } catch (e) {
                          setError(e.message);
                        }
                      }}
                    >
                      <Ionicons name="logo-google" size={18} color="#ea4335" />
                      <Text style={styles.actionRowText}>Link Google Account</Text>
                    </Pressable>
                  )}

                  {!hasPassword && (
                    <View style={styles.passwordSection}>
                      <Text style={styles.inputLabel}>Set Password</Text>
                      <View style={styles.inputBox}>
                        <Ionicons name="lock-closed-outline" size={18} color={colors.muted} style={styles.fieldIcon} />
                        <TextInput
                          style={styles.fieldInput}
                          placeholder="New password (min 8 chars)"
                          placeholderTextColor={colors.muted}
                          secureTextEntry={!showNewPassword}
                          value={newPassword}
                          onChangeText={setNewPassword}
                        />
                        <Pressable onPress={() => setShowNewPassword(!showNewPassword)} hitSlop={10}>
                          <Ionicons
                            name={showNewPassword ? "eye-off-outline" : "eye-outline"}
                            size={20}
                            color={colors.muted}
                          />
                        </Pressable>
                      </View>
                      <Pressable
                        style={styles.savePassBtn}
                        disabled={busy || !newPassword.trim()}
                        onPress={async () => {
                          setBusy(true);
                          try {
                            await setPassword(newPassword);
                            setNewPassword("");
                            setMsg("Password updated.");
                            await refresh();
                          } catch (e) {
                            setError(e.message);
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        <Text style={styles.savePassBtnText}>Save Password</Text>
                      </Pressable>
                    </View>
                  )}
                </View>

                <Pressable style={styles.signOutBtn} onPress={() => logout()}>
                  <Ionicons name="log-out-outline" size={18} color={colors.danger} />
                  <Text style={styles.signOutText}>Sign Out</Text>
                </Pressable>
              </View>
            ) : (
              // Guest Mode Card -> Clicking Sign in opens bottom sheet AuthModal
              <View style={styles.card}>
                <View style={styles.guestRow}>
                  <View style={styles.guestTextGroup}>
                    <Text style={styles.cardTitle}>Guest mode</Text>
                    <Text style={styles.cardSub}>
                      Sign in to sync watch progress across devices
                    </Text>
                  </View>
                  <Pressable
                    style={({ pressed }) => [styles.signInPillBtn, pressed && styles.btnPressed]}
                    onPress={() => setAuthModalOpen(true)}
                  >
                    <Text style={styles.signInPillText}>Sign in</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>

          {/* Messages */}
          {msg ? (
            <View style={styles.msgToast}>
              <Ionicons name="checkmark-circle" size={18} color="#4ade80" />
              <Text style={styles.msgText}>{msg}</Text>
            </View>
          ) : null}
          {error ? (
            <View style={styles.errToast}>
              <Ionicons name="alert-circle" size={18} color={colors.danger} />
              <Text style={styles.errText}>{error}</Text>
            </View>
          ) : null}

          {/* Section: GENERAL */}
          <View style={styles.section}>
            <Text style={styles.sectionCategoryLabel}>GENERAL</Text>
            <View style={styles.card}>
              <View style={styles.infoRow}>
                <View style={styles.infoRowContent}>
                  <Text style={styles.infoRowTitle}>App</Text>
                  <Text style={styles.infoRowSub}>MovieHunter — Mobile</Text>
                </View>
                <View style={styles.tagBadge}>
                  <Text style={styles.tagBadgeText}>Mobile</Text>
                </View>
              </View>

              <View style={styles.dividerLine} />

              <View style={styles.infoRow}>
                <View style={styles.infoRowContent}>
                  <Text style={styles.infoRowTitle}>Catalog</Text>
                  <Text style={styles.infoRowSub}>Movies, TV series, anime, rankings, and songs</Text>
                </View>
              </View>

              <View style={styles.dividerLine} />

              <View style={styles.infoRow}>
                <View style={styles.infoRowContent}>
                  <Text style={styles.infoRowTitle}>Search</Text>
                  <Text style={styles.infoRowSub}>Use the top search bar to find titles quickly</Text>
                </View>
                <Pressable style={styles.tagBadge} onPress={() => router.push("/(tabs)/search")}>
                  <Text style={styles.tagBadgeText}>Search</Text>
                </Pressable>
              </View>
            </View>
          </View>

          {/* Section: PLAYBACK & DOWNLOADS */}
          <View style={styles.section}>
            <Text style={styles.sectionCategoryLabel}>PLAYBACK & DOWNLOADS</Text>
            <View style={styles.card}>
              {user && (
                <>
                  <Pressable style={styles.settingRowBtn} onPress={triggerManualSync} disabled={syncBusy}>
                    <Ionicons name="cloud-download-outline" size={18} color={colors.secondary} />
                    <View style={styles.settingRowContent}>
                      <Text style={styles.settingRowTitle}>Sync Library & Progress</Text>
                      <Text style={styles.settingRowSub}>Sync local watch progress with cloud account</Text>
                    </View>
                    {syncBusy ? (
                      <ActivityIndicator size="small" color={colors.secondary} />
                    ) : (
                      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                    )}
                  </Pressable>
                  <View style={styles.dividerLine} />
                </>
              )}

              <View style={styles.settingGroup}>
                <Text style={styles.settingLabel}>Simultaneous Downloads</Text>
                <View style={styles.concurrencyGrid}>
                  {CONCURRENCY_OPTIONS.map((opt) => {
                    const isSelected = dlSettings.maxConcurrent === opt.value;
                    return (
                      <Pressable
                        key={opt.value}
                        style={[styles.concurrencyChip, isSelected && styles.concurrencyChipActive]}
                        onPress={() => setDownloadSettings({ maxConcurrent: opt.value })}
                      >
                        <Text style={[styles.concurrencyChipText, isSelected && styles.concurrencyChipTextActive]}>
                          {opt.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={styles.dividerLine} />

              <Pressable
                style={styles.settingRowBtn}
                onPress={() => setDownloadSettings({ autoResume: !dlSettings.autoResume })}
              >
                <Ionicons
                  name={dlSettings.autoResume ? "checkbox" : "square-outline"}
                  size={20}
                  color={dlSettings.autoResume ? colors.secondary : colors.muted}
                />
                <View style={styles.settingRowContent}>
                  <Text style={styles.settingRowTitle}>Auto-Resume Downloads</Text>
                  <Text style={styles.settingRowSub}>Resume downloads automatically on app restart</Text>
                </View>
              </Pressable>

              <View style={styles.dividerLine} />

              <Pressable style={styles.settingRowBtn} onPress={() => Linking.openSettings()}>
                <Ionicons name="options-outline" size={18} color={colors.muted} />
                <View style={styles.settingRowContent}>
                  <Text style={styles.settingRowTitle}>Device Permissions</Text>
                  <Text style={styles.settingRowSub}>Configure notifications and storage access</Text>
                </View>
                <Ionicons name="open-outline" size={16} color={colors.muted} />
              </Pressable>
            </View>
          </View>

          {/* Section: ABOUT */}
          <View style={styles.section}>
            <Text style={styles.sectionCategoryLabel}>ABOUT</Text>
            <View style={styles.card}>
              <View style={styles.infoRow}>
                <View style={styles.infoRowContent}>
                  <Text style={styles.infoRowTitle}>Version</Text>
                  <Text style={styles.infoRowSub}>v{appVersion}</Text>
                </View>
              </View>
            </View>
          </View>

        </View>
      </ScrollView>

      {/* Auth Bottom Sheet Drawer Modal */}
      <AuthModal
        visible={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        initialMode="login"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: 40,
  },
  center: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  container: {
    gap: 24,
    maxWidth: 520,
    width: "100%",
    alignSelf: "center",
  },
  pageHead: {
    marginBottom: 4,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  pageSub: {
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
  },
  section: {
    gap: 8,
  },
  sectionCategoryLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.muted,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginLeft: 4,
  },
  card: {
    backgroundColor: colors.panel,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.lg,
    gap: 12,
  },
  guestRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  guestTextGroup: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 2,
  },
  cardSub: {
    fontSize: 13,
    color: colors.muted,
    lineHeight: 18,
  },
  signInPillBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: radii.pill,
    backgroundColor: colors.accentMuted,
    borderWidth: 1,
    borderColor: colors.accentBorder,
  },
  signInPillText: {
    color: colors.secondary,
    fontSize: 14,
    fontWeight: "700",
  },
  btnPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  // Profile Row Styles
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 8,
  },
  avatarWrap: {},
  avatarImg: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: colors.secondary,
  },
  avatarFallback: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.accentMuted,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.accentBorder,
  },
  avatarLetter: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.secondary,
  },
  profileInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.text,
    marginBottom: 2,
  },
  userEmail: {
    fontSize: 13,
    color: colors.muted,
    marginBottom: 6,
  },
  badgeRow: {
    flexDirection: "row",
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radii.pill,
  },
  badgeSuccess: {
    backgroundColor: "rgba(74, 222, 128, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(74, 222, 128, 0.3)",
  },
  badgeWarn: {
    backgroundColor: "rgba(251, 191, 36, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(251, 191, 36, 0.3)",
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  userActionsGroup: {
    gap: spacing.sm,
    marginTop: 4,
  },
  actionRowBtn: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: radii.md,
    backgroundColor: colors.panelSoft,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 10,
  },
  actionRowText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
    flex: 1,
  },
  passwordSection: {
    marginTop: 4,
    gap: 8,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.muted,
    textTransform: "uppercase",
  },
  inputBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.panelSoft,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 12,
    height: 44,
  },
  fieldIcon: {
    marginRight: 8,
  },
  fieldInput: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
  },
  savePassBtn: {
    height: 40,
    borderRadius: radii.md,
    backgroundColor: colors.accentMuted,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  savePassBtnText: {
    color: colors.secondary,
    fontSize: 13,
    fontWeight: "700",
  },
  signOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 44,
    borderRadius: radii.md,
    backgroundColor: "rgba(248, 113, 113, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(248, 113, 113, 0.25)",
    marginTop: 8,
  },
  signOutText: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: "700",
  },
  // Info & Settings Row Styles
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  infoRowContent: {
    flex: 1,
  },
  infoRowTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
  },
  infoRowSub: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  tagBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.sm,
    backgroundColor: colors.panelSoft,
    borderWidth: 1,
    borderColor: colors.line,
  },
  tagBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.secondary,
  },
  dividerLine: {
    height: 1,
    backgroundColor: colors.line,
    marginVertical: 4,
  },
  settingGroup: {
    gap: 8,
  },
  settingLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.muted,
  },
  concurrencyGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  concurrencyChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.sm,
    backgroundColor: colors.panelSoft,
    borderWidth: 1,
    borderColor: colors.line,
  },
  concurrencyChipActive: {
    backgroundColor: colors.accentMuted,
    borderColor: colors.accentBorder,
  },
  concurrencyChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.muted,
  },
  concurrencyChipTextActive: {
    color: colors.text,
    fontWeight: "700",
  },
  settingRowBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  settingRowContent: {
    flex: 1,
  },
  settingRowTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
  },
  settingRowSub: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 2,
  },
  msgToast: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(74, 222, 128, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(74, 222, 128, 0.3)",
    borderRadius: radii.md,
    padding: 12,
  },
  msgText: {
    color: "#4ade80",
    fontSize: 13,
    fontWeight: "600",
    flex: 1,
  },
  errToast: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(248, 113, 113, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(248, 113, 113, 0.3)",
    borderRadius: radii.md,
    padding: 12,
  },
  errText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: "600",
    flex: 1,
  },
});
