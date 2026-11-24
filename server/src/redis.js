import { createClient } from "redis";

let redisClient = null;

export function getRedisConfig(targetPort, { ignoreUrl = false } = {}) {
  if (process.env.REDIS_URL && !ignoreUrl) {
    return { url: process.env.REDIS_URL };
  }

  const host = process.env.REDIS_HOST || "127.0.0.1";
  const port = targetPort || process.env.REDIS_PORT || "6380";
  const password = process.env.REDIS_PASSWORD;

  const url = password
    ? `redis://:${encodeURIComponent(password)}@${host}:${port}`
    : `redis://${host}:${port}`;

  const config = { url };
  if (password) {
    config.password = password;
  }
  return config;
}

async function tryConnect(config) {
  const client = createClient({
    ...config,
    socket: {
      connectTimeout: 2000,
      reconnectStrategy: false,
    },
  });
  // Prevent unhandled error event crash during probe
  client.on("error", () => {});
  try {
    await client.connect();
    await client.ping();
    client.removeAllListeners("error");
    client.on("error", (err) => console.error("Redis Runtime Error:", err?.message || err));
    return client;
  } catch (err) {
    try {
      if (client.isOpen) await client.disconnect();
    } catch {}
    throw err;
  }
}

export async function getRedis() {
  if (redisClient && redisClient.isOpen) return redisClient;

  // If explicit URL or PORT is configured, use it
  if (process.env.REDIS_URL || process.env.REDIS_PORT) {
    try {
      redisClient = await tryConnect(getRedisConfig());
      return redisClient;
    } catch (err) {
      // A stale REDIS_URL (wrong port/password) must not hide a working
      // REDIS_HOST/REDIS_PORT/REDIS_PASSWORD setup — fall back to that.
      if (!process.env.REDIS_URL) throw err;
      redisClient = await tryConnect(getRedisConfig(undefined, { ignoreUrl: true }));
      console.warn("[redis] REDIS_URL failed (" + (err?.message || err) + "); using REDIS_HOST/REDIS_PORT instead");
      return redisClient;
    }
  }

  // Default: try 6380 (moviehunter-redis container default)
  try {
    redisClient = await tryConnect(getRedisConfig("6380"));
    return redisClient;
  } catch (err6380) {
    // If WRONGPASS or NOAUTH, try 6380 without password
    if (String(err6380?.message).includes("WRONGPASS") || String(err6380?.message).includes("NOAUTH")) {
      try {
        redisClient = await tryConnect({
          url: `redis://${process.env.REDIS_HOST || "127.0.0.1"}:6380`,
        });
        return redisClient;
      } catch {}
    }

    // Fallback to 6379
    try {
      redisClient = await tryConnect(getRedisConfig("6379"));
      return redisClient;
    } catch {
      redisClient = null;
      throw err6380;
    }
  }
}

