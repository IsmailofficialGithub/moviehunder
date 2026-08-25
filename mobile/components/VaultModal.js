import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  setupVaultPassword,
  unlockVault,
  vaultIsConfigured,
} from "../lib/vault";
import { colors, radii, spacing } from "../lib/theme";

/**
 * Password sheet for Movie Safe — create on first unlock, enter thereafter.
 */
export default function VaultModal({
  visible,
  mode, // 'setup' | 'unlock'
  onClose,
  onUnlocked,
}) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isSetup = mode === "setup";

  useEffect(() => {
    if (visible) {
      setPw("");
      setPw2("");
      setError("");
      setBusy(false);
    }
  }, [visible, mode]);

  const submit = async () => {
    setError("");
    setBusy(true);
    try {
      if (isSetup) {
        if (pw.length < 4) throw new Error("Use at least 4 characters");
        if (pw !== pw2) throw new Error("Passwords do not match");
        await setupVaultPassword(pw);
      } else {
        await unlockVault(pw);
      }
      onUnlocked?.();
      onClose?.();
    } catch (e) {
      setError(e?.message || "Could not open vault");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <View style={styles.iconWrap}>
            <Ionicons name="shield-checkmark" size={28} color={colors.accent} />
          </View>
          <Text style={styles.title}>
            {isSetup ? "Create Movie Safe" : "Unlock Movie Safe"}
          </Text>
          <Text style={styles.sub}>
            {isSetup
              ? "Set a password. Vault downloads stay hidden and sealed on this device."
              : "Enter your vault password to continue."}
          </Text>

          <TextInput
            value={pw}
            onChangeText={setPw}
            placeholder="Password"
            placeholderTextColor={colors.muted}
            secureTextEntry
            style={styles.input}
            autoFocus
            editable={!busy}
          />
          {isSetup ? (
            <TextInput
              value={pw2}
              onChangeText={setPw2}
              placeholder="Confirm password"
              placeholderTextColor={colors.muted}
              secureTextEntry
              style={styles.input}
              editable={!busy}
            />
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            style={[styles.btn, busy && styles.btnDisabled]}
            onPress={submit}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color={colors.accentInk} />
            ) : (
              <Text style={styles.btnText}>
                {isSetup ? "Create vault" : "Unlock"}
              </Text>
            )}
          </Pressable>
          <Pressable onPress={onClose} style={styles.cancel}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export async function resolveVaultModalMode() {
  return (await vaultIsConfigured()) ? "unlock" : "setup";
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    justifyContent: "center",
    padding: spacing.lg,
  },
  card: {
    backgroundColor: colors.panel,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.lg,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.accentMuted,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  sub: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 6,
    marginBottom: spacing.md,
    lineHeight: 18,
  },
  input: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    color: colors.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: spacing.sm,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    marginBottom: spacing.sm,
  },
  btn: {
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  btnDisabled: {
    opacity: 0.7,
  },
  btnText: {
    color: colors.accentInk,
    fontWeight: "800",
    fontSize: 15,
  },
  cancel: {
    alignItems: "center",
    paddingVertical: 12,
  },
  cancelText: {
    color: colors.muted,
    fontWeight: "600",
  },
});
