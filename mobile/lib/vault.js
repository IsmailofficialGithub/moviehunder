/**
 * Hidden Movie Safe (Vault) — local password + sealed private files.
 * Files live under app sandbox with opaque names; MP4 headers are XOR-sealed
 * so gallery / file browsers cannot play them as video.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import * as FileSystem from "expo-file-system/legacy";
import { File } from "expo-file-system";

const META_KEY = "moviehunter.vault.meta.v1";
const VAULT_ROOT = `${FileSystem.documentDirectory || ""}.mh_sys/`;
const HEADER_BYTES = 64 * 1024;

/** @type {{ salt: string, hash: string } | null} */
let meta = null;
/** @type {string | null} session password while unlocked */
let sessionPassword = null;
let hydrated = false;

/** @type {Set<(unlocked: boolean) => void>} */
const listeners = new Set();

function notify() {
  const on = isVaultUnlocked();
  for (const fn of listeners) {
    try {
      fn(on);
    } catch {
      /* ignore */
    }
  }
}

export function subscribeVault(fn) {
  listeners.add(fn);
  fn(isVaultUnlocked());
  return () => listeners.delete(fn);
}

export function isVaultUnlocked() {
  return Boolean(sessionPassword);
}

export function hasVaultPassword() {
  return Boolean(meta?.hash && meta?.salt);
}

async function hydrateMeta() {
  if (hydrated) return;
  try {
    const raw = await AsyncStorage.getItem(META_KEY);
    if (raw) meta = JSON.parse(raw);
  } catch {
    meta = null;
  } finally {
    hydrated = true;
  }
}

async function ensureVaultDir() {
  if (!FileSystem.documentDirectory) {
    throw new Error("Storage unavailable");
  }
  const info = await FileSystem.getInfoAsync(VAULT_ROOT);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(VAULT_ROOT, { intermediates: true });
  }
  // Android: tell media scanners to skip this folder
  const nomedia = `${VAULT_ROOT}.nomedia`;
  const nm = await FileSystem.getInfoAsync(nomedia);
  if (!nm.exists) {
    await FileSystem.writeAsStringAsync(nomedia, "");
  }
}

async function hashPassword(password, salt) {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${salt}:${password}`
  );
}

async function deriveKeyBytes(password, salt) {
  const hex = await hashPassword(password, salt);
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export async function vaultIsConfigured() {
  await hydrateMeta();
  return hasVaultPassword();
}

/** First-time setup after 5 taps. */
export async function setupVaultPassword(password) {
  const pw = String(password || "");
  if (pw.length < 4) throw new Error("Password must be at least 4 characters");
  await hydrateMeta();
  const saltBytes = await Crypto.getRandomBytesAsync(16);
  const salt = Array.from(saltBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const hash = await hashPassword(pw, salt);
  meta = { salt, hash };
  await AsyncStorage.setItem(META_KEY, JSON.stringify(meta));
  await ensureVaultDir();
  sessionPassword = pw;
  notify();
}

export async function unlockVault(password) {
  await hydrateMeta();
  if (!meta?.salt || !meta?.hash) {
    throw new Error("Vault is not set up yet");
  }
  const hash = await hashPassword(String(password || ""), meta.salt);
  if (hash !== meta.hash) {
    throw new Error("Wrong password");
  }
  sessionPassword = String(password);
  await ensureVaultDir();
  notify();
}

export function lockVault() {
  sessionPassword = null;
  notify();
}

function requireSession() {
  if (!sessionPassword || !meta?.salt) {
    throw new Error("Vault is locked");
  }
  return sessionPassword;
}

function xorHeader(chunk, keyBytes, fileOffset) {
  const out = new Uint8Array(chunk.byteLength);
  for (let i = 0; i < chunk.byteLength; i++) {
    const abs = fileOffset + i;
    if (abs < HEADER_BYTES) {
      out[i] = chunk[i] ^ keyBytes[abs % keyBytes.length];
    } else {
      out[i] = chunk[i];
    }
  }
  return out;
}

/**
 * Stream copy with XOR on the first HEADER_BYTES (seal and unseal are the same).
 * @returns {Promise<boolean>} true if header was XOR-sealed / processed
 */
async function streamXorHeader(srcUri, destUri, keyBytes, { allowCopyFallback = false } = {}) {
  const destDir = destUri.replace(/[^/]+$/, "");
  if (destDir) {
    const dinfo = await FileSystem.getInfoAsync(destDir);
    if (!dinfo.exists) {
      await FileSystem.makeDirectoryAsync(destDir, { intermediates: true });
    }
  }

  try {
    const src = new File(srcUri);
    const dest = new File(destUri);
    if (!src.exists) {
      throw new Error("Download file missing");
    }
    if (dest.exists) {
      dest.delete();
    }
    dest.create();
    const reader = src.readableStream().getReader();
    const writer = dest.writableStream().getWriter();
    let offset = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
        const out =
          offset < HEADER_BYTES ? xorHeader(chunk, keyBytes, offset) : chunk;
        await writer.write(out);
        offset += chunk.byteLength;
      }
    } finally {
      try {
        await writer.close();
      } catch {
        /* ignore */
      }
      try {
        reader.releaseLock();
      } catch {
        /* ignore */
      }
    }
    return true;
  } catch (streamErr) {
    if (!allowCopyFallback) throw streamErr;
    // Fallback: opaque vault path via legacy copy (no XOR — play must skip unseal)
    try {
      await FileSystem.deleteAsync(destUri, { idempotent: true });
    } catch {
      /* ignore */
    }
    await FileSystem.copyAsync({ from: srcUri, to: destUri });
    if (__DEV__) {
      console.warn("Vault used copy fallback (header XOR skipped)", streamErr);
    }
    return false;
  }
}

async function randomVaultName() {
  const bytes = await Crypto.getRandomBytesAsync(16);
  return (
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("") + ".bin"
  );
}

/**
 * Move a completed download into the vault (must be unlocked).
 * Seals the file so it is not a playable video on disk.
 */
export async function sealDownloadIntoVault(item) {
  const password = requireSession();
  if (!item?.fileUri) throw new Error("No file to vault");
  if (item.inVault) return item;
  if (item.status !== "completed" && !item.bytesWritten) {
    throw new Error("Finish downloading before moving to vault");
  }

  await ensureVaultDir();
  const keyBytes = await deriveKeyBytes(password, meta.salt);
  const name = await randomVaultName();
  const sealedUri = `${VAULT_ROOT}${name}`;
  const tmpUri = `${VAULT_ROOT}${name}.tmp`;

  const info = await FileSystem.getInfoAsync(item.fileUri);
  if (!info.exists) throw new Error("Download file missing");

  let didSeal = false;
  try {
    didSeal = await streamXorHeader(item.fileUri, tmpUri, keyBytes, {
      allowCopyFallback: true,
    });
    const sealedInfo = await FileSystem.getInfoAsync(tmpUri);
    if (!sealedInfo.exists) {
      throw new Error("Couldn’t seal file into the vault. Try again.");
    }
    await FileSystem.moveAsync({ from: tmpUri, to: sealedUri });
    try {
      await FileSystem.deleteAsync(item.fileUri, { idempotent: true });
    } catch {
      /* ignore */
    }
  } catch {
    // Last resort: move the original into the vault folder (hidden path)
    try {
      await FileSystem.deleteAsync(tmpUri, { idempotent: true });
    } catch {
      /* ignore */
    }
    await FileSystem.moveAsync({ from: item.fileUri, to: sealedUri });
    didSeal = false;
  }

  return {
    ...item,
    inVault: true,
    fileUri: sealedUri,
    vaultSealed: didSeal,
    openFileUri: item.fileUri,
  };
}

/**
 * Move a vault item back to normal downloads storage (unsealed .mp4).
 */
export async function unsealDownloadFromVault(item, destUri) {
  const password = requireSession();
  if (!item?.fileUri || !item.inVault) return item;

  const keyBytes = await deriveKeyBytes(password, meta.salt);
  const tmpUri = `${destUri}.tmp`;
  if (item.vaultSealed) {
    await streamXorHeader(item.fileUri, tmpUri, keyBytes);
    await FileSystem.moveAsync({ from: tmpUri, to: destUri });
  } else {
    await FileSystem.copyAsync({ from: item.fileUri, to: destUri });
  }
  try {
    await FileSystem.deleteAsync(item.fileUri, { idempotent: true });
  } catch {
    /* ignore */
  }

  return {
    ...item,
    inVault: false,
    vaultSealed: false,
    fileUri: destUri,
    openFileUri: undefined,
  };
}

/**
 * Prepare a playable URI for a vault item (temp unsealed copy in cache).
 * Caller should delete when done via releaseVaultPlayUri.
 */
export async function prepareVaultPlayUri(item) {
  const password = requireSession();
  if (!item?.inVault || !item.fileUri) {
    return item?.fileUri || "";
  }
  if (!item.vaultSealed) {
    return item.fileUri;
  }

  const keyBytes = await deriveKeyBytes(password, meta.salt);
  const cacheRoot = `${FileSystem.cacheDirectory || ""}vault-play/`;
  const cinfo = await FileSystem.getInfoAsync(cacheRoot);
  if (!cinfo.exists) {
    await FileSystem.makeDirectoryAsync(cacheRoot, { intermediates: true });
  }
  const safeId = String(item.id || "x")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(0, 80);
  const playUri = `${cacheRoot}${safeId}.mp4`;
  try {
    await FileSystem.deleteAsync(playUri, { idempotent: true });
  } catch {
    /* ignore */
  }
  await streamXorHeader(item.fileUri, playUri, keyBytes);
  return playUri;
}

export async function releaseVaultPlayUri(playUri) {
  if (!playUri || !String(playUri).includes("vault-play")) return;
  try {
    await FileSystem.deleteAsync(playUri, { idempotent: true });
  } catch {
    /* ignore */
  }
}

export async function deleteVaultFile(fileUri) {
  if (!fileUri) return;
  try {
    await FileSystem.deleteAsync(fileUri, { idempotent: true });
  } catch {
    /* ignore */
  }
}

hydrateMeta().catch(() => {});
