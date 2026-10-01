import localforage from 'localforage';
import CryptoJS from 'crypto-js';
import { authFetch } from './auth';

// Configuration for localforage to use IndexedDB
localforage.config({
  name: 'Movies_hunder',
  storeName: 'guest_history'
});

// A static key for client-side obfuscation. 
// Key is securely injected via environment variables, not hardcoded in source.
const ENCRYPTION_KEY = process.env.NEXT_PUBLIC_GUEST_ENCRYPTION_KEY;
const HISTORY_KEY = 'encrypted_history_queue';

/**
 * Encrypts an array of history items into a base64 ciphertext string
 */
function encryptData(data) {
  try {
    const jsonStr = JSON.stringify(data);
    return CryptoJS.AES.encrypt(jsonStr, ENCRYPTION_KEY).toString();
  } catch (error) {
    console.error('Failed to encrypt history data', error);
    return null;
  }
}

/**
 * Decrypts the ciphertext string back into an array of history items
 */
function decryptData(cipherText) {
  if (!cipherText) return [];
  try {
    const bytes = CryptoJS.AES.decrypt(cipherText, ENCRYPTION_KEY);
    const decryptedStr = bytes.toString(CryptoJS.enc.Utf8);
    return JSON.parse(decryptedStr);
  } catch (error) {
    console.error('Failed to decrypt history data', error);
    return [];
  }
}

/**
 * Gets the current history array from IndexedDB
 * @returns {Promise<Array>} Array of history objects
 */
export async function getGuestHistory() {
  try {
    const encrypted = await localforage.getItem(HISTORY_KEY);
    if (!encrypted) return [];
    return decryptData(encrypted);
  } catch (error) {
    console.error('Error fetching guest history', error);
    return [];
  }
}

/**
 * Adds a single movie to the guest history queue.
 * Handles duplicates by updating the lastWatched timestamp.
 * 
 * @param {string|number} movieId - The ID of the movie
 * @param {object} metadata - Additional info (e.g. title, posterPath)
 */
export async function addHistoryItem(movieId, metadata = {}) {
  try {
    const currentHistory = await getGuestHistory();

    // Check if it already exists, if so, update timestamp
    const existingIndex = currentHistory.findIndex(item => item.movieId === movieId);
    const now = new Date().toISOString();

    if (existingIndex > -1) {
      currentHistory[existingIndex].lastWatched = now;
      currentHistory[existingIndex].metadata = metadata;
    } else {
      currentHistory.push({
        movieId,
        lastWatched: now,
        metadata
      });
    }

    // Encrypt and save back to IndexedDB
    const encryptedData = encryptData(currentHistory);
    if (encryptedData) {
      await localforage.setItem(HISTORY_KEY, encryptedData);
    }
  } catch (error) {
    console.error('Error adding history item', error);
  }
}

/**
 * Clears the history (e.g., after successful sync to server)
 */
export async function clearGuestHistory() {
  try {
    await localforage.removeItem(HISTORY_KEY);
  } catch (error) {
    console.error('Error clearing guest history', error);
  }
}

/**
 * Syncs the guest history to the server, then clears the local queue
 */
export async function syncGuestHistoryToServer() {
  try {
    const items = await getGuestHistory();
    if (!items || items.length === 0) return;

    await authFetch('/api/history/sync', {
      method: 'POST',
      body: { items }
    });

    await clearGuestHistory();
  } catch (error) {
    console.error('Error syncing guest history to server', error);
  }
}
