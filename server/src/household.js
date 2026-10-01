import express from "express";
import { getRedis } from "./redis.js";
import { db } from "./db.js";
import crypto from "crypto";

const router = express.Router();

// Mock middleware, real system would extract accountId/role from token
function requireOwner(req, res, next) {
  if (!req.user || !req.user.id) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }
  // Simplified for MVP, assumes req.user is populated with account role
  // if (req.user.role !== 'OWNER') return res.status(403).json({ ok: false, error: "Must be account owner" });
  next();
}

// Helper to extract IP
function getClientIp(req) {
  return req.headers["x-forwarded-for"] || req.connection.remoteAddress || "0.0.0.0";
}

// Set Primary Household
router.post("/set-primary", requireOwner, async (req, res) => {
  try {
    const userId = req.user.id;
    // MVP: In a real system, you query `AccountMember` -> `Account` to get the accountId.
    // For this prototype, we'll assume userId = accountId or grab it from DB.
    const member = await db.accountMember.findUnique({
      where: { userId },
      include: { account: true },
    });

    if (!member || member.role !== 'OWNER') {
      return res.status(403).json({ ok: false, error: "Only the account owner can update the household." });
    }

    const accountId = member.accountId;
    const currentIp = getClientIp(req);
    // In production, map currentIp to an ASN or /24 subnet. 
    // Here we'll just mock the ASN/Subnet based on the IP string for demonstration.
    const primarySubnet = currentIp; 

    // Upsert household
    let household = await db.household.findFirst({ where: { accountId } });
    if (household) {
      await db.household.update({
        where: { id: household.id },
        data: { primarySubnet, lastUpdated: new Date() }
      });
    } else {
      household = await db.household.create({
        data: { accountId, primarySubnet, lastUpdated: new Date() }
      });
    }

    res.json({ ok: true, message: "Household primary location updated." });
  } catch (error) {
    console.error("Household Set-Primary Error:", error);
    res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
});

router.post("/request-code", async (req, res) => {
  try {
    const { deviceId, accountId } = req.body;
    if (!deviceId || !accountId) return res.status(400).json({ ok: false, error: "Missing parameters" });

    const redis = await getRedis();
    
    // Rate limit check for code requests (e.g. max 3 requests per hour per device)
    const rateLimitKey = `code_rate_limit:${accountId}:${deviceId}`;
    const reqCount = await redis.incr(rateLimitKey);
    if (reqCount === 1) await redis.expire(rateLimitKey, 3600);
    
    if (reqCount > 3) {
      return res.status(429).json({
        ok: false,
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          userFriendly: "You've requested too many codes recently. Please wait a few minutes and try again.",
          action: "DISABLE_RESEND_BUTTON"
        }
      });
    }

    // Generate 4 digit code
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    
    // Store with 15 minute expiration
    const key = `verify_code:${accountId}:${deviceId}`;
    await redis.setEx(key, 900, code);
    
    // Reset attempts for this specific device/account combo
    await redis.del(`verify_attempts:${accountId}:${deviceId}`);

    // MOCK: Send email to account owner
    console.log(`[EMAIL MOCK] Verification Code for device ${deviceId} is: ${code}`);

    res.json({ ok: true, message: "Verification code sent to the primary account holder's email." });
  } catch (error) {
    console.error("Request Code Error:", error);
    res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
});

router.post("/verify-code", async (req, res) => {
  try {
    const { deviceId, accountId, code } = req.body;
    if (!deviceId || !accountId || !code) return res.status(400).json({ ok: false, error: "Missing parameters" });

    const redis = await getRedis();
    
    // Check brute force attempts
    const attemptsKey = `verify_attempts:${accountId}:${deviceId}`;
    const attempts = await redis.incr(attemptsKey);
    if (attempts === 1) await redis.expire(attemptsKey, 900); // match code TTL

    if (attempts > 5) {
      // Invalidate the code immediately upon hitting brute force limit
      await redis.del(`verify_code:${accountId}:${deviceId}`);
      return res.status(429).json({
        ok: false,
        error: {
          code: "TOO_MANY_ATTEMPTS",
          userFriendly: "Too many incorrect attempts. For your security, this code has been invalidated. Please request a new one.",
          action: "REQUIRE_NEW_CODE"
        }
      });
    }

    const key = `verify_code:${accountId}:${deviceId}`;
    const storedCode = await redis.get(key);

    if (!storedCode || storedCode !== code.toString()) {
      return res.status(400).json({
        ok: false,
        error: {
          code: "INVALID_VERIFICATION_CODE",
          userFriendly: "The code you entered is incorrect or has expired. Please check your email and try again.",
          action: "RETRY_INPUT"
        }
      });
    }

    // Success! Code matches.
    // 1. Delete code and attempts to prevent replay
    await redis.del(key);
    await redis.del(attemptsKey);

    // 2. Grant temporary 7-day access in DB
    const household = await db.household.findFirst({ where: { accountId } });
    if (!household) return res.status(404).json({ ok: false, error: "Household not found" });

    const temporaryAccessUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // +7 days

    await db.deviceVerification.upsert({
      where: {
        householdId_deviceId: { householdId: household.id, deviceId: deviceId }
      },
      update: { temporaryAccessUntil },
      create: { householdId: household.id, deviceId: deviceId, temporaryAccessUntil }
    });

    res.json({ ok: true, message: "Device successfully verified." });
  } catch (error) {
    console.error("Verify Code Error:", error);
    res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
});

export const householdRoutes = router;
