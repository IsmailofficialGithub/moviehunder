#!/usr/bin/env node
// Cleanup job: delete pin_reset_requests older than 24h.
// Run via cron: 0 * * * * node /srv/.../server/scripts/cleanup-pin-requests.mjs
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

try {
  const { count } = await prisma.pinResetRequest.deleteMany({
    where: { sentAt: { lt: cutoff } },
  });
  console.log(`[cleanup-pin-requests] deleted ${count} rows older than ${cutoff.toISOString()}`);
} finally {
  await prisma.$disconnect();
}
