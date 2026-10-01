import { getRedis } from "./redis.js";
import { db, getPrisma } from "./db.js";
import { requireUser } from "./auth.js";

// Mock Lua script for concurrency
const luaScript = `
  redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[2])
  local count = redis.call('ZCARD', KEYS[1])
  local limit = tonumber(ARGV[4])
  if count < limit then
    redis.call('ZADD', KEYS[1], ARGV[1], ARGV[3])
    return 1
  else
    local rank = redis.call('ZRANK', KEYS[1], ARGV[3])
    if rank ~= false then
      redis.call('ZADD', KEYS[1], ARGV[1], ARGV[3])
      return 1
    end
    return 0
  end
`;

export async function handlePlaybackStart(request) {
  const auth = await requireUser(request);
  if (!auth.ok) return { status: auth.status, body: { error: auth.error } };
  
  const body = await request.json().catch(() => ({}));
  const { deviceId } = body;
  if (!deviceId) return { status: 400, body: { error: "Missing deviceId" } };

  const userId = auth.user.id;
  const limit = 2; // Hardcoded Standard Plan
  const redis = await getRedis();
  const now = Math.floor(Date.now() / 1000);
  const staleCutoff = now - 120; // 2 min

  // SHADOW MODE Household Verification
  const prisma = getPrisma();
  const member = await prisma.accountMember.findUnique({
    where: { userId },
    include: { account: { include: { households: true } } }
  });

  if (member && member.account.households.length > 0) {
    const household = member.account.households[0];
    const currentIp = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "0.0.0.0";
    
    // Auto-assign primary subnet if this is their first time watching
    if (!household.primarySubnet) {
      await prisma.household.update({
        where: { id: household.id },
        data: { primarySubnet: currentIp, lastUpdated: new Date() }
      }).catch(() => {});
      household.primarySubnet = currentIp;
    }

    const isHomeNetwork = (household.primarySubnet === currentIp);
    
    const deviceVerif = await prisma.deviceVerification.findUnique({
      where: { householdId_deviceId: { householdId: household.id, deviceId } }
    });
    
    let verificationFailed = false;
    let failureReason = "";

    if (isHomeNetwork) {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      if (!deviceVerif || deviceVerif.lastVerifiedAt < twentyFourHoursAgo) {
        prisma.deviceVerification.upsert({
          where: { householdId_deviceId: { householdId: household.id, deviceId } },
          update: { lastVerifiedAt: new Date() },
          create: { householdId: household.id, deviceId, lastVerifiedAt: new Date() }
        }).catch(() => {});
      }
    } else {
      const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
      const hasValidCheckin = deviceVerif && deviceVerif.lastVerifiedAt >= thirtyOneDaysAgo;
      const hasTravelPass = deviceVerif && deviceVerif.temporaryAccessUntil && deviceVerif.temporaryAccessUntil > new Date();
      
      if (!hasValidCheckin && !hasTravelPass) {
        verificationFailed = true;
        failureReason = "OUT_OF_HOUSEHOLD_NO_PASS";
      }
    }

    if (verificationFailed) {
      console.warn(`[ENFORCEMENT MODE] Blocked. Device ${deviceId} failed verification: ${failureReason}`);
      
      return {
        status: 403,
        body: {
          ok: false,
          error: {
            code: "DEVICE_VERIFICATION_REQUIRED",
            userFriendly: "This device isn't part of your primary Household. To keep watching, please verify this device.",
            action: "SHOW_VERIFICATION_PROMPT"
          }
        }
      };
    }
  }

  // Concurrency Check
  const authorized = await redis.eval(luaScript, {
    keys: [`active_streams:${userId}`],
    arguments: [now.toString(), staleCutoff.toString(), deviceId, limit.toString()],
  });

  if (authorized === 1) {
    return { status: 200, body: { ok: true, message: "Playback started" } };
  } else {
    return {
      status: 409,
      body: {
        ok: false,
        error: {
          code: "STREAM_LIMIT_REACHED",
          userFriendly: `Your account is already playing on ${limit} devices. Please stop playing on another device to continue.`,
          action: "SHOW_UPGRADE_PROMPT"
        }
      }
    };
  }
}

export async function handlePlaybackHeartbeat(request) {
  const auth = await requireUser(request);
  if (!auth.ok) return { status: auth.status, body: { error: auth.error } };
  
  const body = await request.json().catch(() => ({}));
  const { deviceId } = body;
  if (!deviceId) return { status: 400, body: { error: "Missing deviceId" } };

  const userId = auth.user.id;
  const redis = await getRedis();
  const now = Math.floor(Date.now() / 1000);

  const rank = await redis.zRank(`active_streams:${userId}`, deviceId);
  if (rank !== null) {
    await redis.zAdd(`active_streams:${userId}`, { score: now, value: deviceId });
    return { status: 200, body: { ok: true } };
  }

  return { status: 404, body: { ok: false, error: "Stream session not found" } };
}

export async function handlePlaybackStop(request) {
  const auth = await requireUser(request);
  if (!auth.ok) return { status: auth.status, body: { error: auth.error } };
  
  const body = await request.json().catch(() => ({}));
  const { deviceId } = body;
  if (!deviceId) return { status: 400, body: { error: "Missing deviceId" } };

  const userId = auth.user.id;
  const redis = await getRedis();
  await redis.zRem(`active_streams:${userId}`, deviceId);
  
  return { status: 200, body: { ok: true } };
}

export async function handleRequestCode(request) {
  const auth = await requireUser(request);
  if (!auth.ok) return { status: auth.status, body: { error: auth.error } };
  
  const body = await request.json().catch(() => ({}));
  const { deviceId } = body;
  if (!deviceId) return { status: 400, body: { error: "Missing deviceId" } };

  const accountId = auth.user.id; // Using userId as accountId for MVP
  const redis = await getRedis();
  
  const rateLimitKey = `code_rate_limit:${accountId}:${deviceId}`;
  const reqCount = await redis.incr(rateLimitKey);
  if (reqCount === 1) await redis.expire(rateLimitKey, 3600);
  
  if (reqCount > 3) {
    return {
      status: 429,
      body: {
        ok: false,
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          userFriendly: "You've requested too many codes recently.",
          action: "DISABLE_RESEND_BUTTON"
        }
      }
    };
  }

  const code = Math.floor(1000 + Math.random() * 9000).toString();
  const key = `verify_code:${accountId}:${deviceId}`;
  await redis.setEx(key, 900, code);
  await redis.del(`verify_attempts:${accountId}:${deviceId}`);

  console.log(`[EMAIL MOCK] Verification Code for ${deviceId} is: ${code}`);

  return { status: 200, body: { ok: true, message: "Verification code sent." } };
}

export async function handleVerifyCode(request) {
  const auth = await requireUser(request);
  if (!auth.ok) return { status: auth.status, body: { error: auth.error } };
  
  const body = await request.json().catch(() => ({}));
  const { deviceId, code } = body;
  if (!deviceId || !code) return { status: 400, body: { error: "Missing parameters" } };

  const accountId = auth.user.id; // Using userId as accountId for MVP
  const redis = await getRedis();
  
  const attemptsKey = `verify_attempts:${accountId}:${deviceId}`;
  const attempts = await redis.incr(attemptsKey);
  if (attempts === 1) await redis.expire(attemptsKey, 900); 

  if (attempts > 5) {
    await redis.del(`verify_code:${accountId}:${deviceId}`);
    return {
      status: 429,
      body: {
        ok: false,
        error: {
          code: "TOO_MANY_ATTEMPTS",
          userFriendly: "Too many incorrect attempts. Code invalidated.",
          action: "REQUIRE_NEW_CODE"
        }
      }
    };
  }

  const key = `verify_code:${accountId}:${deviceId}`;
  const storedCode = await redis.get(key);

  if (!storedCode || storedCode !== code.toString()) {
    return {
      status: 400,
      body: {
        ok: false,
        error: {
          code: "INVALID_VERIFICATION_CODE",
          userFriendly: "The code is incorrect or expired.",
          action: "RETRY_INPUT"
        }
      }
    };
  }

  await redis.del(key);
  await redis.del(attemptsKey);

  const prisma = getPrisma();
  // Fetch household via accountMember
  const member = await prisma.accountMember.findUnique({
    where: { userId: accountId },
    include: { account: { include: { households: true } } }
  });

  if (member && member.account.households.length > 0) {
    const household = member.account.households[0];
    const temporaryAccessUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); 

    await prisma.deviceVerification.upsert({
      where: { householdId_deviceId: { householdId: household.id, deviceId: deviceId } },
      update: { temporaryAccessUntil },
      create: { householdId: household.id, deviceId: deviceId, temporaryAccessUntil }
    });
  }

  return { status: 200, body: { ok: true, message: "Device successfully verified." } };
}
