import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useAuth } from "../lib/AuthProvider";
import { radii, spacing } from "../lib/theme";
import { BrandLogoSymbol } from "./BrandLogo";

export default function HomeHeader() {
  const { user } = useAuth();
  const avatarUrl =
    user?.avatar_url ||
    user?.avatarUrl ||
    user?.picture ||
    user?.user_metadata?.avatar_url ||
    user?.image ||
    user?.avatar ||
    null;
  const displayName =
    user?.display_name || user?.name || user?.email?.split("@")[0] || "";
  const initialLetter = displayName ? displayName.charAt(0).toUpperCase() : "";

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <BrandLogoSymbol size={44} />

        <Pressable
          style={styles.searchPill}
          onPress={() =>
            router.push({
              pathname: "/(tabs)/search",
              params: { focus: "1" },
            })
          }
          accessibilityRole="button"
          accessibilityLabel="Search movies, shows"
        >
          <Ionicons name="search" size={17} color="rgba(255,255,255,0.6)" />
          <Text style={styles.searchPlaceholder} numberOfLines={1}>
            Search movies, shows…
          </Text>
        </Pressable>

        <Pressable
          onPress={() => router.push("/account")}
          style={styles.avatarBtn}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Account profile"
        >
          {avatarUrl ? (
            <Image
              source={{ uri: avatarUrl }}
              style={styles.avatarImg}
              resizeMode="cover"
            />
          ) : initialLetter ? (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarInitial}>{initialLetter}</Text>
            </View>
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Ionicons
                name="person"
                size={17}
                color="rgba(255,255,255,0.85)"
              />
            </View>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    zIndex: 50,
    elevation: 20,
    paddingBottom: spacing.xs,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
  },
  searchPill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1c1c20",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.14)",
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    height: 38,
    gap: 8,
  },
  searchPlaceholder: {
    flex: 1,
    fontSize: 13.5,
    lineHeight: 18,
    color: "rgba(255, 255, 255, 0.55)",
    fontWeight: "400",
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  avatarBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.18)",
    backgroundColor: "#1e1e24",
  },
  avatarImg: {
    width: "100%",
    height: "100%",
    borderRadius: 17,
  },
  avatarPlaceholder: {
    width: "100%",
    height: "100%",
    backgroundColor: "#3d0081",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
    lineHeight: 18,
    includeFontPadding: false,
    textAlignVertical: "center",
  },
});

