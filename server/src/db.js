import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis;

/** @type {PrismaClient | undefined} */
let prisma = globalForPrisma.__moviehunterPrisma;

export function dbConfigured() {
  const url = String(process.env.DATABASE_URL || "").trim();
  if (!url) return false;
  if (/YOUR_|example\.com|user:pass@/i.test(url)) return false;
  return true;
}

export function getPrisma() {
  if (!dbConfigured()) {
    throw new Error("DATABASE_URL not configured");
  }
  if (!prisma) {
    prisma = new PrismaClient();
    globalForPrisma.__moviehunterPrisma = prisma;
  }
  return prisma;
}

export async function disconnectPrisma() {
  if (prisma) {
    await prisma.$disconnect().catch(() => {});
    prisma = undefined;
    globalForPrisma.__moviehunterPrisma = undefined;
  }
}
