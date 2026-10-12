// Backfill script: ensures all users have a primary profile and assigns profileId to all watch_progress rows.

import { dbConfigured, getPrisma, disconnectPrisma } from "../src/db.js";

async function runBackfill() {
  if (!dbConfigured()) {
    console.log("[backfill] Database not configured, skipping.");
    return;
  }

  const prisma = getPrisma();
  console.log("[backfill] Starting Phase 0 profiles and watch progress backfill...");

  // 1. Ensure all users have a primary profile
  const users = await prisma.user.findMany({
    select: { id: true, email: true, displayName: true, avatarUrl: true },
  });

  console.log(`[backfill] Checking ${users.length} users for primary profiles...`);
  let createdProfiles = 0;

  for (const user of users) {
    const existing = await prisma.profile.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
    });

    if (!existing) {
      const name = user.displayName || user.email.split("@")[0] || "Profile 1";
      await prisma.profile.create({
        data: {
          userId: user.id,
          name,
          avatarUrl: user.avatarUrl || "https://api.dicebear.com/7.x/avataaars/svg?seed=Justin&backgroundColor=e50914",
          isKids: false,
          isPrimary: true,
        },
      });
      createdProfiles += 1;
    } else if (!existing.isPrimary) {
      // Check if another profile is primary
      const hasPrimary = await prisma.profile.findFirst({
        where: { userId: user.id, isPrimary: true },
      });
      if (!hasPrimary) {
        await prisma.profile.update({
          where: { id: existing.id },
          data: { isPrimary: true },
        });
      }
    }
  }

  console.log(`[backfill] Created ${createdProfiles} primary profiles.`);

  // 2. Backfill watch_progress rows where profileId is null
  const unassigned = await prisma.watchProgress.findMany({
    where: { profileId: null },
    select: { id: true, userId: true, progressKey: true },
  });

  console.log(`[backfill] Found ${unassigned.length} unassigned watch_progress rows.`);
  let updatedRows = 0;

  // Cache user primary profile IDs to minimize queries
  const userPrimaryProfileCache = new Map();

  for (const row of unassigned) {
    let targetProfileId = null;

    // Check if progressKey was encoded with p:<profileId>:
    if (row.progressKey?.startsWith("p:")) {
      const parts = row.progressKey.split(":");
      const candidatePid = parts[1];
      if (candidatePid) {
        const found = await prisma.profile.findFirst({
          where: { id: candidatePid, userId: row.userId },
        });
        if (found) {
          targetProfileId = found.id;
        }
      }
    }

    if (!targetProfileId) {
      if (!userPrimaryProfileCache.has(row.userId)) {
        const primary = await prisma.profile.findFirst({
          where: { userId: row.userId, isPrimary: true },
        });
        userPrimaryProfileCache.set(row.userId, primary?.id || null);
      }
      targetProfileId = userPrimaryProfileCache.get(row.userId);
    }

    if (targetProfileId) {
      await prisma.watchProgress.update({
        where: { id: row.id },
        data: { profileId: targetProfileId },
      });
      updatedRows += 1;
    }
  }

  console.log(`[backfill] Backfilled profileId on ${updatedRows} watch_progress rows.`);
  console.log("[backfill] Phase 0 backfill completed successfully.");
}

runBackfill()
  .catch((err) => {
    console.error("[backfill] Error during backfill:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectPrisma();
  });
