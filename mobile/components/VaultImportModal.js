import { useMemo, useState, useEffect } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { formatBytes, progressOf } from "../lib/downloads";
import { colors, radii, spacing } from "../lib/theme";

function labelFor(item) {
  const series = item.kind === "series" || Number(item.se) > 0 || Number(item.ep) > 0;
  if (series) return `${item.title} · S${item.se}E${item.ep}`;
  return item.title || "Untitled";
}

/**
 * Pick finished downloads to seal into Movie Safe (multi-select).
 */
export default function VaultImportModal({
  visible,
  items = [],
  busy = false,
  onClose,
  onImport,
}) {
  const [selected, setSelected] = useState(() => new Set());

  useEffect(() => {
    if (!visible) setSelected(new Set());
  }, [visible]);

  const list = useMemo(
    () =>
      (items || []).filter(
        (d) => !d.inVault && d.status === "completed" && !d.pending
      ),
    [items]
  );

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === list.length) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(list.map((d) => d.id)));
  };

  const close = () => {
    setSelected(new Set());
    onClose?.();
  };

  const submit = async () => {
    const ids = [...selected];
    if (!ids.length || busy) return;
    await onImport?.(ids);
    setSelected(new Set());
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={close}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.head}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Import to vault</Text>
              <Text style={styles.sub}>
                Select finished downloads. They leave Downloads and stay only in
                Movie Safe.
              </Text>
            </View>
            <Pressable onPress={close} hitSlop={10} disabled={busy}>
              <Ionicons name="close" size={22} color={colors.text} />
            </Pressable>
          </View>

          {list.length ? (
            <View style={styles.toolbar}>
              <Pressable onPress={selectAll} disabled={busy}>
                <Text style={styles.toolbarText}>
                  {selected.size === list.length ? "Clear all" : "Select all"}
                </Text>
              </Pressable>
              <Text style={styles.toolbarCount}>
                {selected.size} selected
              </Text>
            </View>
          ) : null}

          {!list.length ? (
            <View style={styles.empty}>
              <Ionicons name="cloud-download-outline" size={36} color={colors.muted} />
              <Text style={styles.emptyTitle}>Nothing to import</Text>
              <Text style={styles.emptyHint}>
                Finish a movie or episode download first, then import it here.
              </Text>
            </View>
          ) : (
            <FlatList
              data={list}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.list}
              renderItem={({ item }) => {
                const on = selected.has(item.id);
                const q = item.height ? `${item.height}p` : item.resolution || "—";
                return (
                  <Pressable
                    style={[styles.row, on && styles.rowOn]}
                    onPress={() => toggle(item.id)}
                    disabled={busy}
                  >
                    {item.poster ? (
                      <Image source={{ uri: item.poster }} style={styles.poster} />
                    ) : (
                      <View style={[styles.poster, styles.posterPh]}>
                        <Ionicons name="film-outline" size={18} color={colors.muted} />
                      </View>
                    )}
                    <View style={styles.meta}>
                      <Text style={styles.name} numberOfLines={2}>
                        {labelFor(item)}
                      </Text>
                      <Text style={styles.detail}>
                        {q}
                        {item.bytesWritten
                          ? ` · ${formatBytes(item.bytesWritten)}`
                          : ""}
                        {` · ${Math.round(progressOf(item) * 100)}%`}
                      </Text>
                    </View>
                    <View style={[styles.check, on && styles.checkOn]}>
                      {on ? (
                        <Ionicons name="checkmark" size={16} color={colors.accentInk} />
                      ) : null}
                    </View>
                  </Pressable>
                );
              }}
            />
          )}

          <Pressable
            style={[
              styles.addBtn,
              (!selected.size || busy) && styles.addBtnDisabled,
            ]}
            disabled={!selected.size || busy}
            onPress={submit}
          >
            {busy ? (
              <ActivityIndicator color={colors.accentInk} />
            ) : (
              <>
                <Ionicons name="shield-checkmark" size={18} color={colors.accentInk} />
                <Text style={styles.addText}>
                  Add{selected.size ? ` (${selected.size})` : ""}
                </Text>
              </>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    maxHeight: "88%",
    paddingBottom: spacing.lg,
  },
  head: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  sub: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
  toolbar: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  toolbarText: {
    color: colors.accentLight,
    fontWeight: "700",
    fontSize: 13,
  },
  toolbarCount: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
  },
  list: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
    marginBottom: 8,
  },
  rowOn: {
    borderColor: colors.accentBorder,
    backgroundColor: colors.accentMuted,
  },
  poster: {
    width: 44,
    height: 64,
    borderRadius: 8,
    backgroundColor: colors.panelSoft,
  },
  posterPh: {
    alignItems: "center",
    justifyContent: "center",
  },
  meta: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 14,
  },
  detail: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 4,
  },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  checkOn: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  empty: {
    alignItems: "center",
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    gap: 8,
  },
  emptyTitle: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 16,
  },
  emptyHint: {
    color: colors.muted,
    textAlign: "center",
    fontSize: 13,
    lineHeight: 18,
  },
  addBtn: {
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  addBtnDisabled: {
    opacity: 0.45,
  },
  addText: {
    color: colors.accentInk,
    fontWeight: "800",
    fontSize: 15,
  },
});
