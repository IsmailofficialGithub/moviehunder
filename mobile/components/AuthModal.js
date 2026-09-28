import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useAuth } from "../lib/AuthProvider";
import { googleStartUrl } from "../lib/auth";
import { colors, radii, spacing } from "../lib/theme";

export default function AuthModal({ visible, onClose, initialMode = "login" }) {
  const { user, login, signup } = useAuth();
  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPasswordField] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      setMode(initialMode);
      setError("");
      setMsg("");
      setBusy(false);
    }
  }, [visible, initialMode]);

  useEffect(() => {
    if (user && visible) {
      onClose?.();
    }
  }, [user, visible, onClose]);

  async function onSubmit() {
    setError("");
    setMsg("");
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError("Please enter your email address and password.");
      return;
    }
    if (mode === "signup" && password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "signup") {
        const res = await signup({
          email: trimmedEmail,
          password,
          display_name: displayName.trim() || undefined,
        });
        if (res?.message) {
          setMsg(res.message);
        } else {
          setMsg("Account created successfully! Please check your inbox for verification.");
        }
      } else {
        await login({ email: trimmedEmail, password });
        onClose?.();
      }
    } catch (e) {
      setError(e.message || "Sign up failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <Pressable style={styles.backdrop} onPress={onClose}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            {/* Top Grab Handle */}
            <View style={styles.handle} />

            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.headerTitle}>
                {mode === "signup" ? "Create Account" : "Sign In"}
              </Text>
              <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={10} accessibilityLabel="Close modal">
                <Ionicons name="close" size={20} color="rgba(255,255,255,0.7)" />
              </Pressable>
            </View>

            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
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

              {/* Form Fields */}
              <View style={styles.formGroup}>
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
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  keyboardContainer: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#16161c",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 36,
    maxHeight: "85%",
    borderWidth: 1,
    borderColor: colors.line,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255, 255, 255, 0.25)",
    alignSelf: "center",
    marginBottom: 14,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.text,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: {
    maxHeight: 460,
  },
  scrollContent: {
    gap: spacing.md,
    paddingBottom: 12,
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
  formGroup: {
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
