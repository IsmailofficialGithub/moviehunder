// Netflix-style profile management API handlers.
// Implements quota checking, Argon2id PIN hashing, rate-limited PIN verification,
// and server-side profile switching.

import crypto from "node:crypto";
import argon2 from "argon2";
import { SignJWT, jwtVerify } from "jose";
import { jwtSecret, requireUser } from "./auth.js";
import { getPrisma, dbConfigured } from "./db.js";
import { getRedis } from "./redis.js";
import { getPlanLimits } from "./planLimits.js";
import { sendPinResetEmail } from "./mail.js";

const PIN_MAX_ATTEMPTS = 5;
const PIN_LOCKOUT_SECONDS = 900; // 15 minutes

// Safely obtain Redis client without throwing if Redis is unavailable in dev/test
async function safeGetRedis() {
  try {
    return await getRedis();
  } catch {
    return null;
  }
}

// In-memory fallback map for PIN reset codes (TTL: 15 minutes)
const memoryResetCodes = new Map();

async function storeResetCode(profileId, code) {
  memoryResetCodes.set(profileId, { code, expiresAt: Date.now() + 15 * 60 * 1000 });
  safeGetRedis().then(redis => {
    if (redis) {
      redis.set(`pin_reset:${profileId}`, code, { EX: 900 }).catch(err => {
        console.error("[profiles/pin-reset] Redis set error:", err?.message);
      });
    }
  }).catch(() => {});
}

async function getStoredResetCode(profileId) {
  try {
    const redis = await safeGetRedis();
    if (redis) {
      const stored = await redis.get(`pin_reset:${profileId}`);
      if (stored) return stored;
    }
  } catch (err) {
    console.error("[profiles/pin-reset] Redis get error, checking memory fallback:", err?.message);
  }
  const mem = memoryResetCodes.get(profileId);
  if (mem) {
    if (Date.now() < mem.expiresAt) return mem.code;
    memoryResetCodes.delete(profileId);
  }
  return null;
}

async function clearStoredResetCode(profileId) {
  memoryResetCodes.delete(profileId);
  try {
    const redis = await safeGetRedis();
    if (redis) {
      await redis.del(`pin_reset:${profileId}`);
    }
  } catch (err) {
    console.error("[profiles/pin-reset] Redis del error:", err?.message);
  }
}

// Return sanitized profile object without exposing pin hash
function sanitizeProfile(p) {
  if (!p) return null;
  return {
    id: p.id,
    name: p.name,
    avatarUrl: p.avatarUrl,
    isKids: Boolean(p.isKids),
    isPrimary: Boolean(p.isPrimary),
    hasPin: Boolean(p.pin),
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

// Resolve profile by direct ID or alias (1 for primary, 2 for kids/second profile)
export async function resolveUserProfile(prisma, userId, profileId) {
  if (!profileId) return null;
  let profile = await prisma.profile.findFirst({ where: { id: profileId, userId } });
  if (profile) return profile;

  const all = await prisma.profile.findMany({
    where: { userId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
  });

  if (profileId === "1") {
    return all.find((p) => p.isPrimary) || all[0] || null;
  }

  if (profileId === "2") {
    profile = all.find((p) => p.isKids) || (all.length >= 2 ? all[1] : null);
    if (!profile) {
      return await prisma.profile.create({
        data: {
          userId,
          name: "Kids",
          avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Kids&backgroundColor=38bdf8",
          isKids: true,
          isPrimary: false,
        },
      });
    }
    return profile;
  }
  return null;
}

// Fetch user plan limits from Account or fallback to STANDARD
async function getUserPlanLimits(prisma, userId) {
  try {
    const account = await prisma.account.findFirst({
      where: {
        OR: [
          { ownerUserId: userId },
          { members: { some: { userId } } },
        ],
      },
    });
    return getPlanLimits(account?.tier);
  } catch {
    return getPlanLimits("STANDARD");
  }
}

// Read PIN attempts from Redis
async function getPinAttempts(redis, profileId, userId) {
  if (!redis) return 0;
  try {
    const val = await redis.get(`pin_attempts:${profileId}:${userId}`);
    return val ? parseInt(val, 10) : 0;
  } catch {
    return 0;
  }
}

// Increment failed PIN attempts in Redis with 15m expiration
async function recordFailedPinAttempt(redis, profileId, userId) {
  if (!redis) return 1;
  try {
    const key = `pin_attempts:${profileId}:${userId}`;
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, PIN_LOCKOUT_SECONDS);
    }
    return count;
  } catch {
    return 1;
  }
}

// Clear PIN attempts on successful verification
async function clearPinAttempts(redis, profileId, userId) {
  if (!redis) return;
  try {
    await redis.del(`pin_attempts:${profileId}:${userId}`);
  } catch {}
}

// GET /api/profiles
// Lists all profiles for current user, omitting PIN hashes, and returns plan quota.
export async function handleGetProfiles(request) {
  const auth = await requireUser(request);
  if (!auth.ok) return { status: auth.status, body: { error: auth.error } };

  if (!dbConfigured()) {
    return { status: 503, body: { error: "Database not configured" } };
  }

  const prisma = getPrisma();
  let profiles = await prisma.profile.findMany({
    where: { userId: auth.user.id },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      avatarUrl: true,
      isKids: true,
      isPrimary: true,
      pin: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  // Auto-provision primary profile if user has none
  if (profiles.length === 0) {
    try {
      const created = await prisma.profile.create({
        data: {
          userId: auth.user.id,
          name: auth.user.displayName || auth.user.email?.split("@")[0] || "Profile 1",
          avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Justin&backgroundColor=e50914",
          isKids: false,
          isPrimary: true,
        },
      });
      profiles = [created];
    } catch (err) {
      console.error("[profiles/get] auto-create error:", err);
    }
  }

  const plan = await getUserPlanLimits(prisma, auth.user.id);
  const currentCount = profiles.length;

  return {
    status: 200,
    body: {
      ok: true,
      profiles: profiles.map(sanitizeProfile),
      plan: {
        tier: plan.tier,
        label: plan.label,
        maxProfiles: plan.maxProfiles,
        currentCount,
        canAddProfile: currentCount < plan.maxProfiles,
      },
    },
  };
}

// POST /api/profiles
// Creates a new profile subject to plan quota limits and Argon2id PIN hashing.
export async function handleCreateProfile(request) {
  const auth = await requireUser(request);
  if (!auth.ok) return { status: auth.status, body: { error: auth.error } };

  if (!dbConfigured()) {
    return { status: 503, body: { error: "Database not configured" } };
  }

  const body = await request.json().catch(() => ({}));
  const name = String(body.name || "").trim();
  if (!name || name.length > 30) {
    return { status: 400, body: { error: "Profile name is required (1-30 characters)" } };
  }

  let pinHash = null;
  if (body.pin !== undefined && body.pin !== null && body.pin !== "") {
    const pinStr = String(body.pin).trim();
    if (!/^\d{4}$/.test(pinStr)) {
      return { status: 400, body: { error: "PIN must be a 4-digit number" } };
    }
    pinHash = await argon2.hash(pinStr, { type: argon2.argon2id });
  }

  const prisma = getPrisma();
  const existingCount = await prisma.profile.count({
    where: { userId: auth.user.id },
  });

  const plan = await getUserPlanLimits(prisma, auth.user.id);
  if (existingCount >= plan.maxProfiles) {
    return {
      status: 403,
      body: {
        error: `Profile limit reached (${plan.maxProfiles} maximum on ${plan.label} plan)`,
        maxProfiles: plan.maxProfiles,
        currentCount: existingCount,
        tier: plan.tier,
      },
    };
  }

  const isKids = Boolean(body.isKids);
  const avatarUrl = body.avatarUrl ? String(body.avatarUrl).trim() : null;
  const isPrimary = existingCount === 0;

  const created = await prisma.profile.create({
    data: {
      userId: auth.user.id,
      name,
      avatarUrl: avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name)}&backgroundColor=e50914`,
      isKids,
      pin: pinHash,
      isPrimary,
    },
  });

  return {
    status: 201,
    body: {
      ok: true,
      profile: sanitizeProfile(created),
    },
  };
}

// PUT /api/profiles/:id
// Updates an existing profile after validating ownership.
export async function handleUpdateProfile(request, profileId) {
  const auth = await requireUser(request);
  if (!auth.ok) return { status: auth.status, body: { error: auth.error } };

  if (!dbConfigured()) {
    return { status: 503, body: { error: "Database not configured" } };
  }

  if (!profileId) {
    return { status: 400, body: { error: "Missing profileId" } };
  }

  const prisma = getPrisma();
  const profile = await resolveUserProfile(prisma, auth.user.id, profileId);

  if (!profile) {
    return { status: 404, body: { error: "Profile not found" } };
  }

  const body = await request.json().catch(() => ({}));
  const data = {};

  if (body.name !== undefined) {
    const name = String(body.name || "").trim();
    if (!name || name.length > 30) {
      return { status: 400, body: { error: "Profile name must be 1-30 characters" } };
    }
    data.name = name;
  }

  if (body.avatarUrl !== undefined) {
    data.avatarUrl = body.avatarUrl ? String(body.avatarUrl).trim() : null;
  }

  if (body.isKids !== undefined) {
    data.isKids = Boolean(body.isKids);
  }

  if (body.pin !== undefined) {
    // If a PIN is currently set, require either oldPin verification or a valid resetCode
    if (profile.pin) {
      let authorized = false;
      if (body.resetCode) {
        const stored = await getStoredResetCode(profile.id);
        if (stored && stored === String(body.resetCode).trim()) {
          authorized = true;
          await clearStoredResetCode(profile.id);
        }
      } else if (body.oldPin) {
        const validOld = await argon2.verify(profile.pin, String(body.oldPin).trim()).catch(() => false);
        if (validOld) {
          authorized = true;
        }
      }
      if (!authorized) {
        return {
          status: 403,
          body: {
            error: "Current PIN is required to change or remove PIN",
            requiresOldPin: true,
          },
        };
      }
    }

    if (body.pin === null || body.pin === "") {
      data.pin = null; // Clear PIN lock
    } else {
      const pinStr = String(body.pin).trim();
      if (!/^\d{4}$/.test(pinStr)) {
        return { status: 400, body: { error: "PIN must be a 4-digit number" } };
      }
      data.pin = await argon2.hash(pinStr, { type: argon2.argon2id });
    }
  }

  const updated = await prisma.profile.update({
    where: { id: profile.id },
    data,
  });

  return {
    status: 200,
    body: {
      ok: true,
      profile: sanitizeProfile(updated),
    },
  };
}

// DELETE /api/profiles/:id
// Deletes a profile, preventing deletion of primary profile or sole remaining profile.
export async function handleDeleteProfile(request, profileId) {
  const auth = await requireUser(request);
  if (!auth.ok) return { status: auth.status, body: { error: auth.error } };

  if (!dbConfigured()) {
    return { status: 503, body: { error: "Database not configured" } };
  }

  if (!profileId) {
    return { status: 400, body: { error: "Missing profileId" } };
  }

  const prisma = getPrisma();
  const profile = await resolveUserProfile(prisma, auth.user.id, profileId);

  if (!profile) {
    return { status: 404, body: { error: "Profile not found" } };
  }

  if (profile.isPrimary) {
    return { status: 400, body: { error: "Cannot delete the primary profile" } };
  }

  const total = await prisma.profile.count({
    where: { userId: auth.user.id },
  });
  if (total <= 1) {
    return { status: 400, body: { error: "Cannot delete the only remaining profile" } };
  }

  await prisma.profile.delete({
    where: { id: profile.id },
  });

  return {
    status: 200,
    body: { ok: true, deletedId: profile.id },
  };
}

// POST /api/profiles/:id/verify-pin
// Rate-limited PIN verification returning short-lived unlock token.
export async function handleVerifyPin(request, profileId) {
  const auth = await requireUser(request);
  if (!auth.ok) return { status: auth.status, body: { error: auth.error } };

  if (!dbConfigured()) {
    return { status: 503, body: { error: "Database not configured" } };
  }

  if (!profileId) {
    return { status: 400, body: { error: "Missing profileId" } };
  }

  const prisma = getPrisma();
  const profile = await resolveUserProfile(prisma, auth.user.id, profileId);

  if (!profile) {
    return { status: 404, body: { error: "Profile not found" } };
  }

  // Profile does not require a PIN
  if (!profile.pin) {
    const unlockToken = await new SignJWT({
      sub: auth.user.id,
      profileId: profile.id,
      type: "profile_unlock",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("4h")
      .sign(jwtSecret());

    return { status: 200, body: { ok: true, unlockToken } };
  }

  const body = await request.json().catch(() => ({}));
  const pinStr = String(body.pin || "").trim();

  const redis = await safeGetRedis();
  const attempts = await getPinAttempts(redis, profile.id, auth.user.id);
  if (attempts >= PIN_MAX_ATTEMPTS) {
    return {
      status: 429,
      body: {
        error: "Too many failed attempts. Profile locked for 15 minutes.",
        lockoutSeconds: PIN_LOCKOUT_SECONDS,
      },
    };
  }

  const valid = await argon2.verify(profile.pin, pinStr).catch(() => false);
  if (!valid) {
    const newAttempts = await recordFailedPinAttempt(redis, profile.id, auth.user.id);
    const remaining = Math.max(0, PIN_MAX_ATTEMPTS - newAttempts);
    if (remaining === 0) {
      return {
        status: 429,
        body: {
          error: "Too many failed attempts. Profile locked for 15 minutes.",
          attemptsRemaining: 0,
        },
      };
    }
    return {
      status: 401,
      body: {
        error: "Incorrect PIN",
        attemptsRemaining: remaining,
      },
    };
  }

  await clearPinAttempts(redis, profile.id, auth.user.id);

  const unlockToken = await new SignJWT({
    sub: auth.user.id,
    profileId: profile.id,
    type: "profile_unlock",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("4h")
    .sign(jwtSecret());

  return {
    status: 200,
    body: {
      ok: true,
      unlockToken,
    },
  };
}

// POST /api/profiles/:id/switch
// Switches active profile on the server, enforcing PIN unlock if locked,
// and issues a 30d profile session token.
export async function handleSwitchProfile(request, profileId) {
  const auth = await requireUser(request);
  if (!auth.ok) return { status: auth.status, body: { error: auth.error } };

  if (!dbConfigured()) {
    return { status: 503, body: { error: "Database not configured" } };
  }

  if (!profileId) {
    return { status: 400, body: { error: "Missing profileId" } };
  }

  const prisma = getPrisma();
  const profile = await resolveUserProfile(prisma, auth.user.id, profileId);

  if (!profile) {
    return { status: 404, body: { error: "Profile not found" } };
  }

  // If profile is PIN locked, verify unlock token or raw PIN
  if (profile.pin) {
    const body = await request.json().catch(() => ({}));
    const unlockToken = body.unlockToken || request.headers.get("x-profile-unlock-token");
    const pin = body.pin;

    let isAuthorized = false;

    if (unlockToken) {
      try {
        const { payload } = await jwtVerify(unlockToken, jwtSecret());
        if (
          payload.sub === auth.user.id &&
          payload.profileId === profile.id &&
          payload.type === "profile_unlock"
        ) {
          isAuthorized = true;
        }
      } catch {}
    }

    if (!isAuthorized && pin) {
      const redis = await safeGetRedis();
      const attempts = await getPinAttempts(redis, profile.id, auth.user.id);
      if (attempts >= PIN_MAX_ATTEMPTS) {
        return {
          status: 429,
          body: { error: "Profile locked due to too many failed attempts" },
        };
      }
      const match = await argon2.verify(profile.pin, String(pin).trim()).catch(() => false);
      if (match) {
        await clearPinAttempts(redis, profile.id, auth.user.id);
        isAuthorized = true;
      } else {
        const count = await recordFailedPinAttempt(redis, profile.id, auth.user.id);
        const remaining = Math.max(0, PIN_MAX_ATTEMPTS - count);
        return {
          status: 401,
          body: { error: "Incorrect PIN", attemptsRemaining: remaining },
        };
      }
    }

    if (!isAuthorized) {
      return {
        status: 403,
        body: {
          error: "PIN verification required",
          requiresPin: true,
          profileId: profile.id,
        },
      };
    }
  }

  // Issue 30-day profile session token
  const sessionToken = await new SignJWT({
    sub: auth.user.id,
    profileId: profile.id,
    isKids: Boolean(profile.isKids),
    type: "profile_session",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(jwtSecret());

  return {
    status: 200,
    body: {
      ok: true,
      activeProfile: sanitizeProfile(profile),
      sessionToken,
    },
  };
}

// PIN reset rate-limit config — all env-overridable, feature-flag killswitch
const PIN_RATE_LIMIT_ENABLED = process.env.PIN_RESET_RATE_LIMIT_ENABLED !== "false";
const PIN_RATE_WINDOW_HOURS = Number(process.env.PIN_RESET_WINDOW_HOURS) || 3;
const PIN_RATE_MAX = Number(process.env.PIN_RESET_MAX_ATTEMPTS) || 3;

// POST /api/profiles/:id/forgot-pin
// Generates a 6-digit reset code, stores in Redis (15m), and emails to user.
// Rate-limited to PIN_RATE_MAX per PIN_RATE_WINDOW_HOURS (stored in DB, fail-open on DB error).
export async function handleForgotPin(request, profileId) {
  const auth = await requireUser(request);
  if (!auth.ok) return { status: auth.status, body: { error: auth.error } };

  if (!dbConfigured()) {
    return { status: 503, body: { error: "Database not configured" } };
  }

  if (!profileId) {
    return { status: 400, body: { error: "Missing profileId" } };
  }

  const prisma = getPrisma();
  const profile = await resolveUserProfile(prisma, auth.user.id, profileId);

  if (!profile) {
    return { status: 404, body: { error: "Profile not found" } };
  }

  if (!profile.pin) {
    return { status: 400, body: { error: "This profile has no PIN set" } };
  }

  // ── Rate limiting ────────────────────────────────────────────
  if (PIN_RATE_LIMIT_ENABLED) {
    try {
      const windowStart = new Date(Date.now() - PIN_RATE_WINDOW_HOURS * 60 * 60 * 1000);
      const count = await prisma.pinResetRequest.count({
        where: { profileId: profile.id, sentAt: { gte: windowStart } },
      });

      if (count >= PIN_RATE_MAX) {
        // Find when the oldest send in window expires so client knows when to retry
        const oldest = await prisma.pinResetRequest.findFirst({
          where: { profileId: profile.id, sentAt: { gte: windowStart } },
          orderBy: { sentAt: "asc" },
        });
        const nextResetAt = oldest
          ? new Date(oldest.sentAt.getTime() + PIN_RATE_WINDOW_HOURS * 60 * 60 * 1000)
          : new Date(Date.now() + PIN_RATE_WINDOW_HOURS * 60 * 60 * 1000);
        const retryAfterSeconds = Math.max(0, Math.ceil((nextResetAt - Date.now()) / 1000));

        console.log(
          `[profiles/forgot-pin] rate-limit hit profileId=${profile.id} count=${count} retryAfter=${retryAfterSeconds}s`
        );

        return {
          status: 429,
          headers: { "Retry-After": String(retryAfterSeconds) },
          body: {
            ok: false,
            error: `You've reached the maximum of ${PIN_RATE_MAX} reset emails per ${PIN_RATE_WINDOW_HOURS} hours. Try again later.`,
            attemptsUsed: count,
            attemptsMax: PIN_RATE_MAX,
            nextResetAt: nextResetAt.toISOString(),
            retryAfterSeconds,
          },
        };
      }

      // Record this send
      await prisma.pinResetRequest.create({ data: { profileId: profile.id } });

      const attemptsUsed = count + 1;
      const isLastAttempt = attemptsUsed >= PIN_RATE_MAX;

      // Next reset time = when first record in window expires
      const firstInWindow = await prisma.pinResetRequest.findFirst({
        where: { profileId: profile.id, sentAt: { gte: windowStart } },
        orderBy: { sentAt: "asc" },
      });
      const nextResetAt = firstInWindow
        ? new Date(firstInWindow.sentAt.getTime() + PIN_RATE_WINDOW_HOURS * 60 * 60 * 1000)
        : new Date(Date.now() + PIN_RATE_WINDOW_HOURS * 60 * 60 * 1000);

      const code = String(crypto.randomInt(100000, 999999));
      await storeResetCode(profile.id, code);

      let mailOk = true;
      try {
        await sendPinResetEmail({ to: auth.user.email, profileName: profile.name, code });
      } catch (err) {
        mailOk = false;
        console.error("[profiles/forgot-pin] mail error:", err?.message || err);
      }

      if (!mailOk) {
        return {
          status: 200,
          body: {
            ok: false,
            error: "mail_failed",
            attemptsUsed,
            attemptsMax: PIN_RATE_MAX,
            nextResetAt: nextResetAt.toISOString(),
          },
        };
      }

      return {
        status: 200,
        body: {
          ok: true,
          message: `A 6-digit reset code has been sent to ${auth.user.email}`,
          email: auth.user.email,
          attemptsUsed,
          attemptsMax: PIN_RATE_MAX,
          nextResetAt: nextResetAt.toISOString(),
          isLastAttempt,
        },
      };
    } catch (dbErr) {
      // shortcut: fail-open on rate-limit DB error, upgrade to circuit breaker if abuse is observed
      console.error("[profiles/forgot-pin] rate-limit DB error (failing open):", dbErr?.message);
    }
  }

  // Fallback (rate-limit disabled or DB failed): best-effort send, async
  const code = String(crypto.randomInt(100000, 999999));
  await storeResetCode(profile.id, code);
  sendPinResetEmail({ to: auth.user.email, profileName: profile.name, code }).catch((err) => {
    console.error("[profiles/forgot-pin] mail error:", err?.message || err);
  });

  return {
    status: 200,
    body: {
      ok: true,
      message: `A 6-digit reset code has been sent to ${auth.user.email}`,
      email: auth.user.email,
    },
  };
}

// POST /api/profiles/:id/reset-pin
// Verifies 6-digit reset code and sets a new PIN or clears PIN.
export async function handleResetPin(request, profileId) {
  const auth = await requireUser(request);
  if (!auth.ok) return { status: auth.status, body: { error: auth.error } };

  if (!dbConfigured()) {
    return { status: 503, body: { error: "Database not configured" } };
  }

  if (!profileId) {
    return { status: 400, body: { error: "Missing profileId" } };
  }

  const prisma = getPrisma();
  const profile = await resolveUserProfile(prisma, auth.user.id, profileId);

  if (!profile) {
    return { status: 404, body: { error: "Profile not found" } };
  }

  const body = await request.json().catch(() => ({}));
  const resetCode = String(body.resetCode || "").trim();

  const redis = await safeGetRedis();
  const stored = await getStoredResetCode(profile.id);
  if (!stored || stored !== resetCode) {
    return {
      status: 400,
      body: { error: "Invalid or expired reset code. Please request a new code." },
    };
  }

  let newPinHash = null;
  if (body.newPin !== undefined && body.newPin !== null && body.newPin !== "") {
    const pinStr = String(body.newPin).trim();
    if (!/^\d{4}$/.test(pinStr)) {
      return { status: 400, body: { error: "New PIN must be a 4-digit number" } };
    }
    newPinHash = await argon2.hash(pinStr, { type: argon2.argon2id });
  }

  const updated = await prisma.profile.update({
    where: { id: profile.id },
    data: { pin: newPinHash },
  });

  await clearStoredResetCode(profile.id);
  await clearPinAttempts(redis, profile.id, auth.user.id);

  return {
    status: 200,
    body: {
      ok: true,
      profile: sanitizeProfile(updated),
      message: newPinHash ? "PIN reset successfully" : "PIN removed successfully",
    },
  };
}

