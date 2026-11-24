import { authRequest } from "../auth";

export const createParty = (body) => authRequest("/api/party", { method: "POST", body });
export const joinParty = ({ code, password, invite }) =>
  authRequest("/api/party/join", { method: "POST", body: { code, password, invite } });
export const listPublicParties = () => authRequest("/api/party/public");
export const partyHistory = (limit = 30) => authRequest(`/api/party/history?limit=${limit}`);

// Public web origin used for shareable links (same as web getSiteUrl default).
const SITE_URL = (process.env.EXPO_PUBLIC_SITE_URL || "https://offstream.co").replace(/\/+$/, "");

export function partyShareLink(room) {
  if (!room?.code) return "";
  const base = `${SITE_URL}/party/${room.code}`;
  return room.inviteToken ? `${base}?invite=${encodeURIComponent(room.inviteToken)}` : base;
}

export function normalizeRoomCode(code) {
  return String(code || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}
