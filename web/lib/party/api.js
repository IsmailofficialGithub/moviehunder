"use client";

import { authFetch } from "../auth";

export const createParty = (body) => authFetch("/api/party", { method: "POST", body });
export const joinParty = ({ code, password, invite }) =>
  authFetch("/api/party/join", { method: "POST", body: { code, password, invite } });
export const getParty = (code) => authFetch(`/api/party/room/${encodeURIComponent(code)}`);
export const updatePartySettings = (code, body) =>
  authFetch(`/api/party/room/${encodeURIComponent(code)}/settings`, { method: "POST", body });
export const endParty = (code) => authFetch(`/api/party/room/${encodeURIComponent(code)}/end`, { method: "POST" });
export const listPublicParties = (exclude = []) =>
  authFetch(`/api/party/public${exclude.length ? `?exclude=${encodeURIComponent(exclude.slice(-200).join(","))}` : ""}`);
export const partyHistory = (limit = 30) => authFetch(`/api/party/history?limit=${limit}`);

export function partyWsUrl() {
  const env = (process.env.NEXT_PUBLIC_PARTY_WS_URL || "").trim();
  if (env) return env;
  if (typeof window === "undefined") return "";
  const host = window.location.hostname;
  // Local dev: party server runs next to the site.
  if (host === "localhost" || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    return `ws://${host}:8790/party`;
  }
  // Production: the site is on Vercel, so the party server is reached through
  // the API host's nginx (/party → 127.0.0.1:8790), never <site>:8790.
  return `wss://api.${host.replace(/^www\./, "")}/party`;
}

export function partyShareLink(room) {
  if (typeof window === "undefined" || !room) return "";
  const base = `${window.location.origin}/party/${room.code}`;
  return room.inviteToken ? `${base}?invite=${encodeURIComponent(room.inviteToken)}` : base;
}
