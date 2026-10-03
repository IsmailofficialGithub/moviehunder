import { getPrisma } from "./db.js";
import { requireUser } from "./auth.js";

export const PLAN_LIMITS = {
  STANDARD_ADS: { screens: 1, includedProfiles: 2, maxExtraProfiles: 1 },
  STANDARD: { screens: 2, includedProfiles: 4, maxExtraProfiles: 2 },
  PREMIUM: { screens: 4, includedProfiles: 5, maxExtraProfiles: 4 },
};

export const DEFAULT_AVATARS = [
  "https://api.dicebear.com/7.x/avataaars/svg?seed=Offstream&backgroundColor=3d0081",
  "https://api.dicebear.com/7.x/avataaars/svg?seed=Hunter&backgroundColor=5a00a2",
  "https://api.dicebear.com/7.x/avataaars/svg?seed=Lavender&backgroundColor=bd84db",
  "https://api.dicebear.com/7.x/avataaars/svg?seed=KidsZone&backgroundColor=38bdf8",
  "https://api.dicebear.com/7.x/avataaars/svg?seed=Neon&backgroundColor=1a1a1f",
];

export function getProfileLimits(account, currentCount = 0) {
  const tier = account?.tier || "STANDARD";
  const cfg = PLAN_LIMITS[tier] || PLAN_LIMITS.STANDARD;
  const extra = Math.max(0, Number(account?.extraProfilesPurchased) || 0);
  const total = cfg.includedProfiles + extra;

  return {
    tier,
    screens: cfg.screens,
    includedProfiles: cfg.includedProfiles,
    extraProfilesPurchased: extra,
    totalAllowedProfiles: total,
    currentCount,
    canAddMore: currentCount < total,
    canPurchaseExtra: extra < cfg.maxExtraProfiles,
  };
}

async function resolveAuthAndDb(request, injected = {}) {
  const db = injected.db || getPrisma();
  if (injected.authUser) {
    return { ok: true, user: injected.authUser, db };
  }
  const auth = await requireUser(request);
  if (!auth.ok) {
    return { ok: false, status: auth.status, error: auth.error };
  }
  return { ok: true, user: auth.user, db };
}

async function getOrCreateAccount(userId, db) {
  let account = await db.account.findUnique({
    where: { ownerUserId: userId },
  });
  if (!account) {
    account = await db.account.create({
      data: {
        ownerUserId: userId,
        tier: "STANDARD",
        extraProfilesPurchased: 0,
      },
    }).catch(async () => {
      // In case created concurrently
      return await db.account.findUnique({ where: { ownerUserId: userId } });
    });
  }
  return account;
}

export async function handleGetProfiles(request, opts = {}) {
  const ctx = await resolveAuthAndDb(request, opts);
  if (!ctx.ok) return { status: ctx.status, body: { error: ctx.error } };
  const { user, db } = ctx;

  const account = await getOrCreateAccount(user.id, db);
  let profiles = await db.profile.findMany({
    where: { userId: user.id },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
  });

  // Auto-seed primary profile if none exists
  if (!profiles || profiles.length === 0) {
    const defaultName = (user.displayName || user.email?.split("@")[0] || "Profile 1").trim();
    const seed = encodeURIComponent(defaultName);
    const defaultAvatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}&backgroundColor=5a00a2`;

    const primary = await db.profile.create({
      data: {
        userId: user.id,
        name: defaultName,
        avatarUrl: user.avatarUrl || defaultAvatar,
        isKids: false,
        isPrimary: true,
      },
    });
    profiles = [primary];
  }

  const limits = getProfileLimits(account, profiles.length);

  return {
    status: 200,
    body: {
      ok: true,
      profiles,
      limits,
      defaultAvatars: DEFAULT_AVATARS,
    },
  };
}

export async function handleCreateProfile(request, opts = {}) {
  const ctx = await resolveAuthAndDb(request, opts);
  if (!ctx.ok) return { status: ctx.status, body: { error: ctx.error } };
  const { user, db } = ctx;

  const body = await request.json().catch(() => ({}));
  const name = String(body.name || "").trim();
  if (!name || name.length > 30) {
    return { status: 400, body: { error: "Name must be between 1 and 30 characters" } };
  }

  const account = await getOrCreateAccount(user.id, db);
  const profiles = await db.profile.findMany({ where: { userId: user.id } });
  const limits = getProfileLimits(account, profiles.length);

  if (!limits.canAddMore) {
    return {
      status: 403,
      body: {
        error: "PROFILE_LIMIT_REACHED",
        message: `Plan limit reached (${limits.totalAllowedProfiles} profiles max). Please upgrade or purchase an extra profile slot.`,
        limits,
      },
    };
  }

  const seed = encodeURIComponent(name);
  const avatarUrl = body.avatarUrl || (body.isKids
    ? `https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}&backgroundColor=38bdf8`
    : `https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}&backgroundColor=5a00a2`);

  const created = await db.profile.create({
    data: {
      userId: user.id,
      name,
      avatarUrl,
      isKids: Boolean(body.isKids),
      isPrimary: profiles.length === 0,
    },
  });

  const updatedLimits = getProfileLimits(account, profiles.length + 1);

  return {
    status: 201,
    body: {
      ok: true,
      profile: created,
      limits: updatedLimits,
    },
  };
}

export async function handleUpdateProfile(request, profileId, opts = {}) {
  const ctx = await resolveAuthAndDb(request, opts);
  if (!ctx.ok) return { status: ctx.status, body: { error: ctx.error } };
  const { user, db } = ctx;

  if (!profileId) {
    return { status: 400, body: { error: "Missing profileId" } };
  }

  const existing = await db.profile.findUnique({ where: { id: profileId } });
  if (!existing || existing.userId !== user.id) {
    return { status: 404, body: { error: "Profile not found" } };
  }

  const body = await request.json().catch(() => ({}));
  const updateData = {};

  if (body.name !== undefined) {
    const name = String(body.name || "").trim();
    if (!name || name.length > 30) {
      return { status: 400, body: { error: "Name must be between 1 and 30 characters" } };
    }
    updateData.name = name;
  }

  if (body.avatarUrl !== undefined) {
    updateData.avatarUrl = String(body.avatarUrl || "").trim() || null;
  }

  if (body.isKids !== undefined) {
    updateData.isKids = Boolean(body.isKids);
  }

  const updated = await db.profile.update({
    where: { id: profileId },
    data: updateData,
  });

  return {
    status: 200,
    body: { ok: true, profile: updated },
  };
}

export async function handleDeleteProfile(request, profileId, opts = {}) {
  const ctx = await resolveAuthAndDb(request, opts);
  if (!ctx.ok) return { status: ctx.status, body: { error: ctx.error } };
  const { user, db } = ctx;

  if (!profileId) {
    return { status: 400, body: { error: "Missing profileId" } };
  }

  const profiles = await db.profile.findMany({ where: { userId: user.id } });
  const target = profiles.find((p) => p.id === profileId);
  if (!target) {
    return { status: 404, body: { error: "Profile not found" } };
  }

  if (profiles.length <= 1) {
    return {
      status: 400,
      body: {
        error: "CANNOT_DELETE_LAST_PROFILE",
        message: "You must have at least one viewing profile.",
      },
    };
  }

  await db.profile.delete({ where: { id: profileId } });

  // If deleted profile was primary, make the next earliest profile primary
  if (target.isPrimary) {
    const remaining = profiles.filter((p) => p.id !== profileId);
    if (remaining.length > 0) {
      await db.profile.update({
        where: { id: remaining[0].id },
        data: { isPrimary: true },
      });
    }
  }

  const account = await getOrCreateAccount(user.id, db);
  const updatedLimits = getProfileLimits(account, profiles.length - 1);

  return {
    status: 200,
    body: { ok: true, limits: updatedLimits },
  };
}

export async function handleBuyExtraSlot(request, opts = {}) {
  const ctx = await resolveAuthAndDb(request, opts);
  if (!ctx.ok) return { status: ctx.status, body: { error: ctx.error } };
  const { user, db } = ctx;

  const account = await getOrCreateAccount(user.id, db);
  const profileCount = db.profile.count
    ? await db.profile.count({ where: { userId: user.id } })
    : (await db.profile.findMany({ where: { userId: user.id } })).length;
  const limits = getProfileLimits(account, profileCount);

  if (!limits.canPurchaseExtra) {
    return {
      status: 400,
      body: {
        error: "MAX_EXTRA_SLOTS_REACHED",
        message: "Maximum extra profile add-on slots reached for your plan tier.",
        limits,
      },
    };
  }

  const updatedAccount = await db.account.update({
    where: { id: account.id },
    data: { extraProfilesPurchased: { increment: 1 } },
  });

  const updatedLimits = getProfileLimits(updatedAccount, profileCount);

  return {
    status: 200,
    body: {
      ok: true,
      message: "Extra profile slot activated successfully.",
      limits: updatedLimits,
    },
  };
}
