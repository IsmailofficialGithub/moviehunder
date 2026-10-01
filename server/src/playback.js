import express from "express";
import { getRedis } from "./redis.js";
import { db } from "./db.js";

const router = express.Router();

const luaScript = `
  local activeKey = KEYS[1]
  local now = tonumber(ARGV[1])
  local staleCutoff = tonumber(ARGV[2])
  local deviceId = ARGV[3]
  local limit = tonumber(ARGV[4])

  -- 1. Prune dead streams
  redis.call('ZREMRANGEBYSCORE', activeKey, '-inf', staleCutoff)

  -- 2. Check if this device is already an active stream
  local already = redis.call('ZSCORE', activeKey, deviceId)
  
  -- 3. Check total active streams
  local count = redis.call('ZCARD', activeKey)

  -- 4. Authorize if within limit or if it's just refreshing an existing session
  if already or count < limit then
    redis.call('ZADD', activeKey, now, deviceId)
    return 1
  end

  return 0
`;

// Middleware to ensure user is logged in
function requireAuth(req, res, next) {
  if (!req.user || !req.user.id) {
    return res.status(401).json({
      ok: false,
      error: {
        code: "INVALID_DEVICE_IDENTITY",
        userFriendly: "Your device session has expired. Please sign in again.",
        action: "FORCE_LOGOUT",
      },
    });
  }
  next();
}

router.post("/start", requireAuth, async (req, res) => {
  try {
    const { deviceId } = req.body;
    if (!deviceId) {
      return res.status(400).json({ ok: false, error: "Missing deviceId" });
    }

    const userId = req.user.id;

    // TODO: Phase 1 -> Query real 'Account' limit once migration is done.
    // For now, we fallback to a hardcoded limit for tests
    const limit = 2; // PlanTier.STANDARD

    const redis = await getRedis();
    const now = Math.floor(Date.now() / 1000);
    const staleCutoff = now - 120; // 2 minutes
    
    // --- Phase 3: Household Verification (Shadow Mode) ---
    // Fetch user account binding
    const member = await db.accountMember.findUnique({
      where: { userId },
      include: { account: { include: { households: true } } }
    });
    
    if (member && member.account.households.length > 0) {
      const household = member.account.households[0];
      const currentIp = req.headers["x-forwarded-for"] || req.connection.remoteAddress || "0.0.0.0";
      const isHomeNetwork = (household.primarySubnet === currentIp); // MVP: Simple IP match instead of real ASN logic
      
      const deviceVerif = await db.deviceVerification.findUnique({
        where: { householdId_deviceId: { householdId: household.id, deviceId } }
      });
      
      let verificationFailed = false;
      let failureReason = "";

      if (isHomeNetwork) {
        // Debounced DB Write: Only update if older than 24h
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        if (!deviceVerif || deviceVerif.lastVerifiedAt < twentyFourHoursAgo) {
          // Fire async, don't await blocking the critical path
          db.deviceVerification.upsert({
            where: { householdId_deviceId: { householdId: household.id, deviceId } },
            update: { lastVerifiedAt: new Date() },
            create: { householdId: household.id, deviceId, lastVerifiedAt: new Date() }
          }).catch(err => console.error("Async Verification Update Error:", err));
        }
      } else {
        // Away logic
        const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
        const hasValidCheckin = deviceVerif && deviceVerif.lastVerifiedAt >= thirtyOneDaysAgo;
        const hasTravelPass = deviceVerif && deviceVerif.temporaryAccessUntil && deviceVerif.temporaryAccessUntil > new Date();
        
        if (!hasValidCheckin && !hasTravelPass) {
          verificationFailed = true;
          failureReason = "OUT_OF_HOUSEHOLD_NO_PASS";
        }
      }

      if (verificationFailed) {
        // SHADOW MODE: We log the failure but do not actually block the stream.
        // In Hard Enforce mode, we would uncomment the block below:
        console.warn(`[SHADOW MODE] Block Prevented. Device ${deviceId} failed household verification: ${failureReason}`);
        
        /* 
        return res.status(403).json({
          ok: false,
          error: {
            code: "DEVICE_VERIFICATION_REQUIRED",
            userFriendly: "This device isn't part of your primary Household. To keep watching, please verify this device or update your Household location.",
            action: "SHOW_VERIFICATION_PROMPT"
          }
        });
        */
      }
    }
    // --- End Household Verification ---

    // Ensure script is loaded for EVALSHA for better performance, but EVAL works for MVP
    const authorized = await redis.eval(luaScript, {
      keys: [`active_streams:${userId}`],
      arguments: [now.toString(), staleCutoff.toString(), deviceId, limit.toString()],
    });

    if (authorized === 1) {
      // Stream allowed!
      return res.json({ ok: true, message: "Playback started" });
    } else {
      // Limit exceeded
      return res.status(409).json({
        ok: false,
        error: {
          code: "STREAM_LIMIT_REACHED",
          userFriendly: "Too many people are using your account right now. Please stop playing on another device or upgrade your plan.",
          action: "SHOW_UPGRADE_PROMPT",
        },
      });
    }
  } catch (error) {
    console.error("Playback Start Error:", error);
    res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
});

router.post("/heartbeat", requireAuth, async (req, res) => {
  try {
    const { deviceId } = req.body;
    if (!deviceId) {
      return res.status(400).json({ ok: false, error: "Missing deviceId" });
    }

    const userId = req.user.id;
    const now = Math.floor(Date.now() / 1000);

    const redis = await getRedis();
    await redis.zAdd(`active_streams:${userId}`, [{ score: now, value: deviceId }]);

    res.json({ ok: true });
  } catch (error) {
    console.error("Playback Heartbeat Error:", error);
    res.status(500).json({ ok: false });
  }
});

router.post("/stop", requireAuth, async (req, res) => {
  try {
    const { deviceId } = req.body;
    if (!deviceId) {
      return res.status(400).json({ ok: false, error: "Missing deviceId" });
    }

    const userId = req.user.id;

    const redis = await getRedis();
    await redis.zRem(`active_streams:${userId}`, deviceId);

    res.json({ ok: true });
  } catch (error) {
    console.error("Playback Stop Error:", error);
    res.status(500).json({ ok: false });
  }
});

export const playbackRoutes = router;
