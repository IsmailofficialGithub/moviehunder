// Node.js server-side media token encryption and verification
// Uses AES-256-GCM to seal upstream stream URLs into opaque, tamper-proof tickets
import crypto from "node:crypto";

// 32-byte secret key derived from APP_CLIENT_KEY or fallback internal secret
function getSecretKey() {
  const secret =
    process.env.APP_CLIENT_KEY ||
    process.env.MEDIA_TICKET_SECRET ||
    "moviehunter-internal-streaming-secret-key-32b";
  return crypto.createHash("sha256").update(String(secret)).digest();
}

// Encrypt target upstream URL into an opaque URL-safe ticket
// ticket expires in 6 hours by default
export function createPlaybackTicket(targetUrl, ttlSeconds = 21600) {
  if (!targetUrl) return "";
  const key = getSecretKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  const payload = JSON.stringify({
    u: targetUrl,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  });

  const encrypted = Buffer.concat([
    cipher.update(payload, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  // Combine iv + tag + encrypted payload into a single buffer
  const combined = Buffer.concat([iv, tag, encrypted]);
  return combined.toString("base64url");
}

// Decrypt and validate ticket, returns target URL or throws
export function verifyPlaybackTicket(ticket) {
  if (!ticket || typeof ticket !== "string") {
    throw new Error("Missing or invalid ticket");
  }

  const key = getSecretKey();
  const buf = Buffer.from(ticket, "base64url");

  // Must have at least 12 (iv) + 16 (tag) + 1 byte payload
  if (buf.length < 29) {
    throw new Error("Corrupted ticket");
  }

  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  const data = JSON.parse(decrypted.toString("utf8"));
  if (!data.u || typeof data.u !== "string") {
    throw new Error("Invalid ticket payload");
  }

  if (typeof data.exp === "number" && data.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("Ticket expired");
  }

  return data.u;
}
