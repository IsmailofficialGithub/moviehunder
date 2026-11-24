// Watch-party REST API (runs in play-relay via nodeApi.js).
// Rooms are created/joined here; the realtime part lives in server/party/party-server.mjs.
// Joining returns a short-lived signed "ticket" that the WebSocket accepts.

import crypto from "node:crypto";
import argon2 from "argon2";
import { SignJWT, jwtVerify } from "jose";
import { getPrisma } from "./db.js";
import { getRedis } from "./redis.js";
import { jwtSecret, requireUser } from "./auth.js";
import { getPlanLimits } from "./planLimits.js";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;
const TICKET_TTL = "10m";
const JOIN_FAIL_LIMIT = 10;
const JOIN_FAIL_WINDOW_S = 600;
const PUBLIC_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const ONLINE_HASH = "party:online";

export function generateRoomCode() {
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) out += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return out;
}

export function normalizeCode(code) {
  return String(code || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, CODE_LENGTH);
}

export async function signPartyTicket(userId, roomId) {
  return new SignJWT({ sub: userId, roomId, type: "party_ticket" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(TICKET_TTL)
    .sign(jwtSecret());
}

/** @returns {Promise<{ userId: string, roomId: string } | null>} */
export async function verifyPartyTicket(ticket) {
  try {
    const { payload } = await jwtVerify(String(ticket || ""), jwtSecret());
    if (payload.type !== "party_ticket" || !payload.sub || !payload.roomId) return null;
    return { userId: String(payload.sub), roomId: String(payload.roomId) };
  } catch {
    return null;
  }
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function str(v, max) {
  const s = String(v ?? "").trim();
  return s ? s.slice(0, max) : "";
}

async function userPlan(prisma, userId) {
  try {
    const account = await prisma.account.findFirst({
      where: { OR: [{ ownerUserId: userId }, { members: { some: { userId } } }] },
    });
    return getPlanLimits(account?.tier);
  } catch {
    return getPlanLimits("STANDARD");
  }
}

async function onlineCounts(roomIds) {
  if (!roomIds.length) return {};
  try {
    const redis = await getRedis();
    const vals = await redis.hmGet(ONLINE_HASH, roomIds);
    return Object.fromEntries(roomIds.map((id, i) => [id, Number(vals[i]) || 0]));
  } catch {
    return {};
  }
}

/** Public-safe room view. Includes secrets only for the host. */
export function roomView(room, { viewerId, online } = {}) {
  const isHost = viewerId && room.hostUserId === viewerId;
  return {
    id: room.id,
    code: room.code,
    name: room.name,
    visibility: room.visibility,
    needsPassword: room.visibility === "PRIVATE" && Boolean(room.passwordHash),
    host: room.host
      ? { id: room.host.id, name: room.host.displayName || "Host", avatarUrl: room.host.avatarUrl || null }
      : { id: room.hostUserId },
    content: {
      subjectId: room.subjectId,
      detailPath: room.detailPath,
      se: room.se,
      ep: room.ep,
      title: room.title,
      poster: room.poster,
    },
    maxMembers: room.maxMembers,
    online: online ?? null,
    createdAt: room.createdAt,
    endedAt: room.endedAt,
    ...(isHost ? { inviteToken: room.inviteToken } : {}),
  };
}

// POST /api/party
export async function handleCreateParty(request) {
  const auth = await requireUser(request);
  if (!auth.ok) return { status: auth.status, body: { error: auth.error } };
  const body = await readJson(request);

  const subjectId = str(body.subjectId, 40);
  const detailPath = str(body.detailPath ?? body.detail_path, 300);
  if (!/^\d+$/.test(subjectId) || !detailPath) {
    return { status: 400, body: { error: "subjectId and detailPath are required" } };
  }
  const visibility = String(body.visibility || "").toUpperCase() === "PUBLIC" ? "PUBLIC" : "PRIVATE";
  const password = String(body.password ?? "");
  if (visibility === "PRIVATE" && (password.length < 4 || password.length > 64)) {
    return { status: 400, body: { error: "Private rooms need a password of 4–64 characters" } };
  }

  const prisma = getPrisma();
  const plan = await userPlan(prisma, auth.user.id);
  const requested = Number(body.maxMembers) || plan.partyMaxMembers;
  const maxMembers = Math.max(2, Math.min(requested, plan.partyMaxMembers));
  const passwordHash = visibility === "PRIVATE" ? await argon2.hash(password, { type: argon2.argon2id }) : null;

  let room = null;
  for (let attempt = 0; attempt < 5 && !room; attempt++) {
    try {
      room = await prisma.partyRoom.create({
        data: {
          code: generateRoomCode(),
          visibility,
          passwordHash,
          inviteToken: crypto.randomBytes(18).toString("base64url"),
          hostUserId: auth.user.id,
          name: str(body.name, 80) || null,
          subjectId,
          detailPath,
          se: str(body.se, 6) || "0",
          ep: str(body.ep, 6) || "0",
          title: str(body.title, 200) || null,
          poster: str(body.poster, 500) || null,
          maxMembers,
          members: { create: { userId: auth.user.id, role: "HOST" } },
          events: { create: { userId: auth.user.id, type: "created" } },
        },
        include: { host: true },
      });
    } catch (err) {
      if (err?.code !== "P2002") throw err; // unique collision on code → retry
    }
  }
  if (!room) return { status: 503, body: { error: "Could not allocate a room code" } };

  return {
    status: 201,
    body: { room: roomView(room, { viewerId: auth.user.id, online: 0 }), ticket: await signPartyTicket(auth.user.id, room.id) },
  };
}

// GET /api/party/room/:code — join-gate info
export async function handleGetParty(request, code) {
  const auth = await requireUser(request);
  if (!auth.ok) return { status: auth.status, body: { error: auth.error } };
  const room = await getPrisma().partyRoom.findUnique({
    where: { code: normalizeCode(code) },
    include: { host: true },
  });
  if (!room || room.endedAt) return { status: 404, body: { error: "Room not found or ended" } };
  const online = (await onlineCounts([room.id]))[room.id] ?? null;
  return { status: 200, body: { room: roomView(room, { viewerId: auth.user.id, online }) } };
}

// POST /api/party/join  { code, password } | { invite }
export async function handleJoinParty(request) {
  const auth = await requireUser(request);
  if (!auth.ok) return { status: auth.status, body: { error: auth.error } };
  const body = await readJson(request);
  const prisma = getPrisma();
  const userId = auth.user.id;

  const invite = str(body.invite, 64);
  const room = invite
    ? await prisma.partyRoom.findUnique({ where: { inviteToken: invite }, include: { host: true } })
    : await prisma.partyRoom.findUnique({ where: { code: normalizeCode(body.code) }, include: { host: true } });
  if (!room || room.endedAt) return { status: 404, body: { error: "Room not found or ended" } };

  const existing = await prisma.partyMember.findUnique({ where: { roomId_userId: { roomId: room.id, userId } } });
  if (existing?.banned) return { status: 403, body: { error: "You were removed from this room" } };

  const isHost = room.hostUserId === userId;
  if (!isHost && !invite && !existing && room.visibility === "PRIVATE" && room.passwordHash) {
    const failKey = `party:joinfail:${userId}`;
    let redis = null;
    try {
      redis = await getRedis();
      if ((Number(await redis.get(failKey)) || 0) >= JOIN_FAIL_LIMIT) {
        return { status: 429, body: { error: "Too many wrong passwords — try again later" } };
      }
    } catch {
      redis = null;
    }
    const good = await argon2.verify(room.passwordHash, String(body.password ?? "")).catch(() => false);
    if (!good) {
      if (redis) {
        await redis.incr(failKey).catch(() => {});
        await redis.expire(failKey, JOIN_FAIL_WINDOW_S).catch(() => {});
      }
      return { status: 401, body: { error: "Wrong room password" } };
    }
  }

  const online = (await onlineCounts([room.id]))[room.id] ?? 0;
  if (!isHost && !existing && online >= room.maxMembers) {
    return { status: 409, body: { error: "Room is full" } };
  }

  await prisma.partyMember.upsert({
    where: { roomId_userId: { roomId: room.id, userId } },
    create: { roomId: room.id, userId, role: isHost ? "HOST" : "VIEWER" },
    update: { leftAt: null },
  });

  return {
    status: 200,
    body: { room: roomView(room, { viewerId: userId, online }), ticket: await signPartyTicket(userId, room.id) },
  };
}

// GET /api/party/public
export async function handlePublicParties(request) {
  const auth = await requireUser(request);
  if (!auth.ok) return { status: auth.status, body: { error: auth.error } };
  const rooms = await getPrisma().partyRoom.findMany({
    where: { visibility: "PUBLIC", endedAt: null, createdAt: { gte: new Date(Date.now() - PUBLIC_MAX_AGE_MS) } },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { host: true },
  });
  const counts = await onlineCounts(rooms.map((r) => r.id));
  const list = rooms
    .map((r) => roomView(r, { viewerId: auth.user.id, online: counts[r.id] ?? 0 }))
    .filter((r) => r.online > 0)
    .sort((a, b) => b.online - a.online);
  return { status: 200, body: { rooms: list } };
}

// GET /api/party/history
export async function handlePartyHistory(request) {
  const auth = await requireUser(request);
  if (!auth.ok) return { status: auth.status, body: { error: auth.error } };
  const url = new URL(request.url);
  const take = Math.min(Math.max(Number(url.searchParams.get("limit")) || 30, 1), 100);
  const rows = await getPrisma().partyMember.findMany({
    where: { userId: auth.user.id },
    orderBy: { joinedAt: "desc" },
    take,
    include: { room: { include: { host: true, _count: { select: { members: true } } } } },
  });
  return {
    status: 200,
    body: {
      parties: rows.map((m) => ({
        ...roomView(m.room, { viewerId: auth.user.id }),
        role: m.role,
        joinedAt: m.joinedAt,
        leftAt: m.leftAt,
        memberCount: m.room._count.members,
      })),
    },
  };
}

// POST /api/party/room/:code/end — host only
export async function handleEndParty(request, code) {
  const auth = await requireUser(request);
  if (!auth.ok) return { status: auth.status, body: { error: auth.error } };
  const prisma = getPrisma();
  const room = await prisma.partyRoom.findUnique({ where: { code: normalizeCode(code) } });
  if (!room) return { status: 404, body: { error: "Room not found" } };
  if (room.hostUserId !== auth.user.id) return { status: 403, body: { error: "Only the host can end the room" } };
  if (!room.endedAt) {
    await prisma.partyRoom.update({ where: { id: room.id }, data: { endedAt: new Date() } });
    await prisma.partyEvent.create({ data: { roomId: room.id, userId: auth.user.id, type: "ended" } });
    try {
      const redis = await getRedis();
      await redis.publish("party:control", JSON.stringify({ type: "ended", roomId: room.id }));
    } catch {
      /* party server also notices on next load */
    }
  }
  return { status: 200, body: { ok: true } };
}
