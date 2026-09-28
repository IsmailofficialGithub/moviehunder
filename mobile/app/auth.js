import { useEffect, useState } from "react";
import {
  ActivityIndicator,
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
import DetailHeader from "../components/DetailHeader";
import { useAuth } from "../lib/AuthProvider";
import {
  googleStartUrl,
  storeSession,
  verifyEmail,
} from "../lib/auth";
import { runFullSync } from "../lib/sync";
import { colors, radii, spacing } from "../lib/theme";

export default function AuthScreen() {
  const { user, loading, login, signup, refresh } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams();
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPasswordField] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) {
      router.replace("/account");
    }
  }, [user, router]);

  useEffect(() => {
    const access = params.access_token;
    const refreshToken = params.refresh_token;
    const verify = params.verify;
    if (!access && !refreshToken && !verify) return;
    (async () => {
      try {
        if (verify) {
          await verifyEmail(String(verify));
          setMsg("Email verified successfully — you can sign in.");
          return;
        }
        if (access && refreshToken) {
          await storeSession({
            access_token: String(access),
            refresh_token: String(refreshToken),
          });
          await refresh();
          runFullSync().catch(() => {});
          router.replace("/account");
        }
      } catch (e) {
        setError(e.message || "Authentication callback failed");
      }
    })();
  }, [params, refresh, router]);

  async function onSubmit() {
    setError("");
    setMsg("");
    if (!email.trim() || !password.trim()) {
      setError("Please fill in all required fields.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "signup") {
        await signup({
          email: email.trim(),
          password,
          display_name: displayName.trim() || undefined,
        });
        setMsg("Verification email sent — please check your inbox.");
      } else {
        await login({ email: email.trim(), password });
        router.replace("/account");
      }
    } catch (e) {
      setError(e.message || "Authentication failed.");
    } finally {
      setBusy(false);
    }
  }

  const headerTitle = mode === "signup" ? "Create Account" : "Sign In";

  if (loading) {
    return (
      <View style={styles.root}>
        <DetailHeader title={headerTitle} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.secondary} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <DetailHeader title={headerTitle} />

      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.container}>
          {/* Mode Segment Switcher */}
          <View style={styles.segmentedTab}>
            <Pressable
              style={[styles.segmentBtn, mode === "login" && styles.segmentBtnActive]}
              onPress={() => {
                setMode("login");
                setError("");
                setMsg("");
              }}
            >
              <Text style={[styles.segmentText, mode === "login" && styles.segmentTextActive]}>
                Sign In
              </Text>
            </Pressable>
            <Pressable
              style={[styles.segmentBtn, mode === "signup" && styles.segmentBtnActive]}
              onPress={() => {
                setMode("signup");
                setError("");
                setMsg("");
              }}
            >
              <Text style={[styles.segmentText, mode === "signup" && styles.segmentTextActive]}>
                Create Account
              </Text>
            </Pressable>
          </View>

          {/* Form Card */}
          <View style={styles.formCard}>
            {mode === "signup" && (
              <View style={styles.fieldGroup}>
                <Text style={styles.inputLabel}>Display Name</Text>
                <View style={styles.inputBox}>
                  <Ionicons name="person-outline" size={18} color={colors.muted} style={styles.fieldIcon} />
                  <TextInput
                    style={styles.fieldInput}
                    placeholder="Your name"
                    placeholderTextColor={colors.muted}
                    value={displayName}
                    onChangeText={setDisplayName}
                  />
                </View>
              </View>
            )}

            <View style={styles.fieldGroup}>
              <Text style={styles.inputLabel}>Email Address</Text>
              <View style={styles.inputBox}>
                <Ionicons name="mail-outline" size={18} color={colors.muted} style={styles.fieldIcon} />
                <TextInput
                  style={styles.fieldInput}
                  placeholder="name@example.com"
                  placeholderTextColor={colors.muted}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={email}
                  onChangeText={setEmail}
                />
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.inputLabel}>Password</Text>
              <View style={styles.inputBox}>
                <Ionicons name="lock-closed-outline" size={18} color={colors.muted} style={styles.fieldIcon} />
                <TextInput
                  style={styles.fieldInput}
                  placeholder="••••••••"
                  placeholderTextColor={colors.muted}
                  secureTextEntry={!showPassword}
                  value={password}
                  onChangeText={setPasswordField}
                />
                <Pressable onPress={() => setShowPassword(!showPassword)} hitSlop={10} style={styles.eyeBtn}>
                  <Ionicons
                    name={showPassword ? "eye-off-outline" : "eye-outline"}
                    size={20}
                    color={colors.muted}
                  />
                </Pressable>
              </View>
            </View>

            {/* Toasts */}
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

            {/* Submit Button */}
            <Pressable
              style={({ pressed }) => [styles.submitBtn, pressed && styles.btnPressed, busy && styles.btnDisabled]}
              disabled={busy}
              onPress={onSubmit}
            >
              {busy ? (
                <ActivityIndicator color={colors.accentInk} />
              ) : (
                <Text style={styles.submitBtnText}>
                  {mode === "signup" ? "Create Account" : "Sign In"}
                </Text>
              )}
            </Pressable>

            {/* Divider */}
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>OR</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Google OAuth Button */}
            <Pressable
              style={({ pressed }) => [styles.googleBtn, pressed && styles.btnPressed]}
              onPress={() => Linking.openURL(googleStartUrl({ client: "mobile" }))}
            >
              <Ionicons name="logo-google" size={18} color="#ea4335" style={{ marginRight: 8 }} />
              <Text style={styles.googleBtnText}>Continue with Google</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
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
    gap: spacing.md,
    maxWidth: 480,
    width: "100%",
    alignSelf: "center",
  },
  segmentedTab: {
    flexDirection: "row",
    backgroundColor: colors.panelSoft,
    borderRadius: radii.md,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.line,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: radii.sm,
  },
  segmentBtnActive: {
    backgroundColor: colors.accentMuted,
    borderWidth: 1,
    borderColor: colors.accentBorder,
  },
  segmentText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.muted,
  },
  segmentTextActive: {
    color: colors.text,
    fontWeight: "700",
  },
  formCard: {
    backgroundColor: colors.panel,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.lg,
    gap: spacing.md,
  },
  fieldGroup: {
    gap: spacing.xs,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  inputBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.panelSoft,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 12,
    height: 48,
  },
  fieldIcon: {
    marginRight: 8,
  },
  fieldInput: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    height: "100%",
  },
  eyeBtn: {
    padding: 4,
  },
  submitBtn: {
    height: 48,
    borderRadius: radii.md,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  submitBtnText: {
    color: colors.accentInk,
    fontSize: 15,
    fontWeight: "700",
  },
  btnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  btnDisabled: {
    opacity: 0.6,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 4,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.line,
  },
  dividerText: {
    marginHorizontal: 12,
    fontSize: 11,
    fontWeight: "700",
    color: colors.muted,
  },
  googleBtn: {
    height: 48,
    borderRadius: radii.md,
    backgroundColor: colors.panelSoft,
    borderWidth: 1,
    borderColor: colors.line,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  googleBtnText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
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
