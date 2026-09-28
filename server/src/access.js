/**
 * Device access via Prisma / Postgres.
 * If DATABASE_URL is missing, access is open (dev).
 */

import { dbConfigured, getPrisma } from "./db.js";

function normalizeDeviceId(raw) {
  const id = String(raw || "").trim();
  if (!id || id.length < 8 || id.length > 128) return null;
  if (!/^[a-zA-Z0-9._:-]+$/.test(id)) return null;
  return id;
}

function toPublicDevice(row) {
  if (!row) return null;
  return {
    device_id: row.deviceId,
    platform: row.platform,
    app_version: row.appVersion,
    device_name: row.deviceName,
    model: row.model,
    first_seen_at: row.firstSeenAt?.toISOString?.() || row.firstSeenAt,
    last_seen_at: row.lastSeenAt?.toISOString?.() || row.lastSeenAt,
    blocked: row.blocked,
    blocked_reason: row.blockedReason,
    blocked_at: row.blockedAt?.toISOString?.() || row.blockedAt,
    notes: row.notes,
  };
}

/**
 * Upsert device, refresh last_seen, return access decision.
 * @returns {Promise<{ allowed: boolean, mode: string, device?: object, reason?: string, hint?: string }>}
 */
export async function verifyDeviceAccess(_env, body = {}) {
  if (!dbConfigured()) {
    return {
      allowed: true,
      mode: "open",
      hint: "DATABASE_URL not configured — access open",
    };
  }

  const deviceId = normalizeDeviceId(body.device_id);
  if (!deviceId) {
    return {
      allowed: false,
      mode: "postgres",
      reason: "Invalid device_id",
    };
  }

  const prisma = getPrisma();
  const now = new Date();
  const platform = String(body.platform || "").slice(0, 32) || null;
  const appVersion = String(body.app_version || "").slice(0, 64) || null;
  const deviceName = String(body.device_name || "").slice(0, 120) || null;
  const model = String(body.model || "").slice(0, 120) || null;

  const existing = await prisma.appDevice.findUnique({
    where: { deviceId },
  });

  if (existing) {
    const row = await prisma.appDevice.update({
      where: { deviceId },
      data: {
        lastSeenAt: now,
        platform: platform || existing.platform,
        appVersion: appVersion || existing.appVersion,
        deviceName: deviceName || existing.deviceName,
        model: model || existing.model,
      },
    });

    if (row.blocked) {
      return {
        allowed: false,
        mode: "postgres",
        reason:
          row.blockedReason?.trim() ||
          "Your access to this app has been removed.",
        device: {
          device_id: row.deviceId,
          blocked: true,
          first_seen_at: row.firstSeenAt?.toISOString?.() || row.firstSeenAt,
        },
      };
    }

    return {
      allowed: true,
      mode: "postgres",
      device: {
        device_id: row.deviceId,
        blocked: false,
        first_seen_at: row.firstSeenAt?.toISOString?.() || row.firstSeenAt,
      },
    };
  }

  const created = await prisma.appDevice.create({
    data: {
      deviceId,
      platform,
      appVersion,
      deviceName,
      model,
      firstSeenAt: now,
      lastSeenAt: now,
      blocked: false,
    },
  });

  return {
    allowed: true,
    mode: "postgres",
    device: {
      device_id: created.deviceId,
      blocked: false,
      first_seen_at: created.firstSeenAt?.toISOString?.() || created.firstSeenAt,
    },
  };
}

export async function setDeviceBlocked(_env, { device_id, blocked, reason } = {}) {
  if (!dbConfigured()) {
    throw new Error("DATABASE_URL not configured");
  }
  const deviceId = normalizeDeviceId(device_id);
  if (!deviceId) throw new Error("Invalid device_id");

  const prisma = getPrisma();
  const row = await prisma.appDevice.update({
    where: { deviceId },
    data: {
      blocked: Boolean(blocked),
      blockedReason: blocked
        ? String(reason || "Blocked by admin").slice(0, 240)
        : null,
      blockedAt: blocked ? new Date() : null,
    },
  });
  return toPublicDevice(row);
}

export async function listDevices(_env, { limit = 50 } = {}) {
  if (!dbConfigured()) {
    throw new Error("DATABASE_URL not configured");
  }
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const prisma = getPrisma();
  const rows = await prisma.appDevice.findMany({
    orderBy: { lastSeenAt: "desc" },
    take: lim,
  });
  return rows.map(toPublicDevice);
}

export function assertAdmin(env, request) {
  const expected = String(
    env?.ADMIN_API_KEY || process.env.ADMIN_API_KEY || ""
  ).trim();
  if (!expected) {
    return { ok: false, error: "ADMIN_API_KEY not set on server" };
  }
  const got =
    request.headers.get("x-admin-key") ||
    new URL(request.url).searchParams.get("key") ||
    "";
  if (got !== expected) {
    return { ok: false, error: "Unauthorized" };
  }
  return { ok: true };
}

/** @deprecated use dbConfigured */
export function sbConfigured() {
  return dbConfigured();
}

export { dbConfigured };
