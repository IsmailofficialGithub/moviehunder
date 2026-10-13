import { createClient } from "redis";

let redisClient = null;

export function getRedisConfig(targetPort) {
  if (process.env.REDIS_URL) {
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
  client.on("error", (err) => console.error("Redis Client Error", err));
  try {
    await client.connect();
    await client.ping();
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
    const config = getRedisConfig();
    redisClient = await tryConnect(config);
    return redisClient;
  }

  // Default: try 6380 (moviehunter-redis container default), then fallback to 6379
  try {
    redisClient = await tryConnect(getRedisConfig("6380"));
    return redisClient;
  } catch (err6380) {
    try {
      redisClient = await tryConnect(getRedisConfig("6379"));
      return redisClient;
    } catch {
      redisClient = null;
      throw err6380;
    }
  }
}

