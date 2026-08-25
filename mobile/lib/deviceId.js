import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import Constants from "expo-constants";

const STORE_KEY = "flick.device_id.v1";

function uuidv4() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Stable install id — created once and kept on the device. */
export async function getDeviceId() {
  try {
    const existing = await AsyncStorage.getItem(STORE_KEY);
    if (existing && existing.length >= 8) return existing;
  } catch {
    /* ignore */
  }
  const id = uuidv4();
  try {
    await AsyncStorage.setItem(STORE_KEY, id);
  } catch {
    /* ignore */
  }
  return id;
}

export function getDeviceMeta() {
  const appVersion =
    Constants.expoConfig?.version ||
    Constants.nativeAppVersion ||
    "1.0.0";
  const model =
    Constants.deviceName ||
    Constants.platform?.android?.model ||
    Constants.platform?.ios?.model ||
    null;
  return {
    platform: Platform.OS,
    app_version: String(appVersion),
    device_name: model ? String(model).slice(0, 120) : Platform.OS,
    model: model ? String(model).slice(0, 120) : null,
  };
}
