import { Platform } from "react-native";
import { Tabs } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../../lib/theme";

const TAB_BAR_CONTENT_HEIGHT = 56;
/** Fallback when Android edge-to-edge reports insets.bottom === 0 (3-button nav). */
const ANDROID_NAV_FALLBACK = 48;

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const bottomPad =
    Platform.OS === "android"
      ? Math.max(insets.bottom, ANDROID_NAV_FALLBACK)
      : Math.max(insets.bottom, 8);

  return (
    <Tabs
      safeAreaInsets={{ bottom: 0, top: 0 }}
      screenOptions={{
        headerShown: false,
        lazy: false,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          backgroundColor: "#0b0b10",
          borderTopColor: colors.line,
          borderTopWidth: 1,
          height: TAB_BAR_CONTENT_HEIGHT + bottomPad,
          paddingBottom: bottomPad,
          paddingTop: 8,
          elevation: 12,
        },
        tabBarActiveTintColor: colors.accentLight,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
          marginBottom: 2,
        },
        tabBarItemStyle: {
          paddingTop: 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="movies"
        options={{
          title: "Movies",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="film-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: "Search",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="search" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="songs"
        options={{
          title: "Songs",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="musical-notes" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="downloads"
        options={{
          title: "Downloads",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="download-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
