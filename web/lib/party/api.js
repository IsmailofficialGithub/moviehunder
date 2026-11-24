"use client";

import { authFetch } from "../auth";

export const createParty = (body) => authFetch("/api/party", { method: "POST", body });
export const joinParty = ({ code, password, invite }) =>
  authFetch("/api/party/join", { method: "POST", body: { code, password, invite } });
export const getParty = (code) => authFetch(`/api/party/room/${encodeURIComponent(code)}`);
export const endParty = (code) => authFetch(`/api/party/room/${encodeURIComponent(code)}/end`, { method: "POST" });
export const listPublicParties = () => authFetch("/api/party/public");
export const partyHistory = (limit = 30) => authFetch(`/api/party/history?limit=${limit}`);

export function partyWsUrl() {
  const env = (process.env.NEXT_PUBLIC_PARTY_WS_URL || "").trim();
  if (env) return env;
  if (typeof window === "undefined") return "";
  const secure = window.location.protocol === "https:";
  return `${secure ? "wss" : "ws"}://${window.location.hostname}:8790/party`;
}

export function partyShareLink(room) {
  if (typeof window === "undefined" || !room) return "";
  const base = `${window.location.origin}/party/${room.code}`;
  return room.inviteToken ? `${base}?invite=${encodeURIComponent(room.inviteToken)}` : base;
}
