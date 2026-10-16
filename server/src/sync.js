import { dbConfigured, getPrisma } from "./db.js";
import { requireUser } from "./auth.js";

function asIso(d) {
  if (!d) return null;
  return d instanceof Date ? d.toISOString() : d;
}

function progressToPublic(row) {
  return {
    key: row.progressKey,
    profileId: row.profileId || null,
    position: row.position,
    duration: row.duration,
    title: row.title,
    subjectId: row.subjectId,
    detailPath: row.detailPath,
    se: row.se,
    ep: row.ep,
    poster: row.poster,
    kind: row.kind,
    completed: row.completed,
    updatedAt: row.updatedAt?.getTime?.() || Date.parse(row.updatedAt) || 0,
  };
}

export async function handleGetWatchProgress(request) {
  const auth = await requireUser(request);
  if (!auth.ok) return { status: auth.status, body: { error: auth.error } };
  if (!dbConfigured()) {
    return { status: 503, body: { error: "Database not configured" } };
  }
  const url = new URL(request.url);
  const targetProfileId = url.searchParams.get("profileId") || url.searchParams.get("profile_id");
  const prisma = getPrisma();

  const whereClause = { userId: auth.user.id };
  if (targetProfileId) {
    let profile = null;
    if (targetProfileId !== "1") {
      profile = await prisma.profile.findFirst({
        where: { id: targetProfileId, userId: auth.user.id },
        select: { id: true },
      });
      if (!profile) {
        return { status: 403, body: { error: "Profile access forbidden" } };
      }
    } else {
      // Profile ID "1" is client alias for primary profile
      profile =
        (await prisma.profile.findFirst({
          where: { userId: auth.user.id, isPrimary: true },
          select: { id: true },
        })) ||
        (await prisma.profile.findFirst({
          where: { userId: auth.user.id },
          select: { id: true },
        }));
    }
    if (profile) {
      whereClause.profileId = profile.id;
    }
  }

  const rows = await prisma.watchProgress.findMany({
    where: whereClause,
    orderBy: { updatedAt: "desc" },
  });
  return {
    status: 200,
    body: { ok: true, items: rows.map(progressToPublic) },
  };
}

export async function handlePutWatchProgress(request) {
  const auth = await requireUser(request);
  if (!auth.ok) return { status: auth.status, body: { error: auth.error } };
  if (!dbConfigured()) {
    return { status: 503, body: { error: "Database not configured" } };
  }
  const body = await request.json().catch(() => ({}));
  const items = Array.isArray(body.items)
    ? body.items
    : body.item
    ? [body.item]
    : (body.key || body.progressKey)
    ? [body]
    : [];
  const url = new URL(request.url);
  const queryProfileId = url.searchParams.get("profileId") || url.searchParams.get("profile_id");
  const prisma = getPrisma();
  let upserted = 0;

  // Lazily resolve or create the user's primary profile for unassigned writes
  let cachedPrimaryProfileId = null;
  const getPrimaryProfileId = async () => {
    if (cachedPrimaryProfileId) return cachedPrimaryProfileId;
    const primary = await prisma.profile.findFirst({
      where: { userId: auth.user.id, isPrimary: true },
      select: { id: true },
    });
    if (primary) {
      cachedPrimaryProfileId = primary.id;
      return primary.id;
    }
    const fallbackName = auth.user.displayName || auth.user.email?.split("@")[0] || "Profile 1";
    const created = await prisma.profile.create({
      data: {
        userId: auth.user.id,
        name: fallbackName,
        avatarUrl: auth.user.avatarUrl || "https://api.dicebear.com/7.x/avataaars/svg?seed=Justin&backgroundColor=e50914",
        isKids: false,
        isPrimary: true,
      },
      select: { id: true },
    });
    cachedPrimaryProfileId = created.id;
    return created.id;
  };

  for (const item of items) {
    const rawKey = String(item.key || item.progressKey || "").trim();
    if (!rawKey) continue;

    // Resolve target profileId: item.profileId > query parameter > key prefix
    let candidatePid = item.profileId || queryProfileId || null;
    let cleanKey = rawKey;

    if (!candidatePid && rawKey.startsWith("p:")) {
      const parts = rawKey.split(":");
      if (parts[1]) {
        candidatePid = parts[1];
      }
    }

    let resolvedProfileId = null;
    if (candidatePid && candidatePid !== "1") {
      // IDOR Protection: verify target profile belongs to this user
      const owned = await prisma.profile.findFirst({
        where: { id: candidatePid, userId: auth.user.id },
        select: { id: true },
      });
      if (owned) {
        resolvedProfileId = owned.id;
      } else {
        // Log security warning tripwire if someone tries to write to unowned profile
        console.warn("[CANARY] IDOR attempt on WatchProgress write", {
          userId: auth.user.id,
          candidatePid,
          progressKey: rawKey,
        });
        continue;
      }
    }

    if (!resolvedProfileId) {
      resolvedProfileId = await getPrimaryProfileId();
    }

    const updatedAt = new Date(
      Number(item.updatedAt) || Date.parse(item.updatedAt) || Date.now()
    );
    const existing = await prisma.watchProgress.findUnique({
      where: {
        userId_profileId_progressKey: {
          userId: auth.user.id,
          profileId: resolvedProfileId,
          progressKey: cleanKey,
        },
      },
    });

    const incomingPos = Number(item.position) || 0;
    const isRewind = Boolean(item.rewind || incomingPos < 15);
    let finalPos = incomingPos;
    let finalCompleted = Boolean(item.completed);

    if (existing) {
      // 1. If existing record is newer than incoming update by > 10s, keep existing
      if (existing.updatedAt.getTime() - updatedAt.getTime() > 10000) {
        continue;
      }

      // 2. Multi-device concurrent watching:
      // If two devices are actively watching at the same time (within 3 mins),
      // do not let a lagging background device overwrite a further progress
      const timeDiff = Math.abs(updatedAt.getTime() - existing.updatedAt.getTime());
      if (timeDiff < 180000 && existing.position > incomingPos && !isRewind) {
        finalPos = existing.position;
        if (existing.completed) finalCompleted = true;
      }
    }

    // Resolve poster & title: never let numeric digits replace a real title,
    // and inherit poster/title from sibling episodes if missing
    let finalTitle = item.title;
    if (finalTitle && /^\d+$/.test(String(finalTitle).trim())) {
      finalTitle = existing?.title || null;
    } else if (!finalTitle) {
      finalTitle = existing?.title || null;
    }

    let finalPoster = item.poster || existing?.poster || null;
    let finalDetailPath = item.detailPath || existing?.detailPath || null;

    if ((!finalPoster || !finalTitle || /^\d+$/.test(String(finalTitle))) && (item.subjectId || existing?.subjectId)) {
      const subId = item.subjectId || existing?.subjectId;
      try {
        const sibling = await prisma.watchProgress.findFirst({
          where: {
            userId: auth.user.id,
            profileId: resolvedProfileId,
            subjectId: subId,
            NOT: { poster: null },
          },
          select: { title: true, poster: true, detailPath: true },
        });
        if (sibling) {
          if (!finalPoster && sibling.poster) finalPoster = sibling.poster;
          if ((!finalTitle || /^\d+$/.test(String(finalTitle))) && sibling.title && !/^\d+$/.test(sibling.title)) {
            finalTitle = sibling.title;
          }
          if (!finalDetailPath && sibling.detailPath) finalDetailPath = sibling.detailPath;
        }
      } catch {}
    }

    await prisma.watchProgress.upsert({
      where: {
        userId_profileId_progressKey: {
          userId: auth.user.id,
          profileId: resolvedProfileId,
          progressKey: cleanKey,
        },
      },
      create: {
        userId: auth.user.id,
        profileId: resolvedProfileId,
        progressKey: cleanKey,
        position: finalPos,
        duration: Number(item.duration) || 0,
        title: finalTitle,
        subjectId: item.subjectId || null,
        detailPath: finalDetailPath,
        se: item.se != null ? String(item.se) : null,
        ep: item.ep != null ? String(item.ep) : null,
        poster: finalPoster,
        kind: item.kind || null,
        completed: finalCompleted,
        updatedAt,
      },
      update: {
        position: finalPos,
        duration: Number(item.duration) || existing?.duration || 0,
        title: finalTitle,
        subjectId: item.subjectId || existing?.subjectId || null,
        detailPath: finalDetailPath,
        se: item.se != null ? String(item.se) : (existing?.se || null),
        ep: item.ep != null ? String(item.ep) : (existing?.ep || null),
        poster: finalPoster,
        kind: item.kind || existing?.kind || null,
        completed: finalCompleted,
        updatedAt,
      },
    });
    upserted += 1;
  }

  return { status: 200, body: { ok: true, upserted } };
}

export async function handleSyncGuestHistory(request) {
  const auth = await requireUser(request);
  if (!auth.ok) return { status: auth.status, body: { error: auth.error } };
  if (!dbConfigured()) {
    return { status: 503, body: { error: "Database not configured" } };
  }
  const body = await request.json().catch(() => ({}));
  const items = Array.isArray(body.items) ? body.items : [];
  const url = new URL(request.url);
  const targetProfileId = url.searchParams.get("profileId") || url.searchParams.get("profile_id");
  const prisma = getPrisma();
  let upserted = 0;

  // Resolve target profile (or primary profile)
  let resolvedProfileId = null;
  if (targetProfileId) {
    const owned = await prisma.profile.findFirst({
      where: { id: targetProfileId, userId: auth.user.id },
      select: { id: true },
    });
    if (owned) resolvedProfileId = owned.id;
  }

  if (!resolvedProfileId) {
    const primary = await prisma.profile.findFirst({
      where: { userId: auth.user.id, isPrimary: true },
      select: { id: true },
    });
    resolvedProfileId = primary?.id || null;
  }

  if (!resolvedProfileId) {
    const created = await prisma.profile.create({
      data: {
        userId: auth.user.id,
        name: auth.user.displayName || "Profile 1",
        avatarUrl: auth.user.avatarUrl || "https://api.dicebear.com/7.x/avataaars/svg?seed=Justin&backgroundColor=e50914",
        isKids: false,
        isPrimary: true,
      },
      select: { id: true },
    });
    resolvedProfileId = created.id;
  }

  for (const item of items) {
    const meta = item.metadata || {};
    const subId = item.subjectId || item.movieId || meta.subjectId || meta.movieId;
    if (!subId) continue;
    const updatedAt = new Date(Number(item.lastWatched) || Date.parse(item.lastWatched) || Date.now());
    const se = item.se ?? meta.se ?? "0";
    const ep = item.ep ?? meta.ep ?? "0";
    const key = (se !== "0" && ep !== "0") ? `t:${subId}:s${se}:e${ep}` : `t:${subId}:s0:e0`;
    const cleanTitle = item.title || meta.title || null;
    const cleanPoster = item.poster || meta.poster || null;
    const cleanDetailPath = item.detailPath || meta.detailPath || null;

    const existing = await prisma.watchProgress.findUnique({
      where: {
        userId_profileId_progressKey: {
          userId: auth.user.id,
          profileId: resolvedProfileId,
          progressKey: key,
        },
      },
    });

    if (existing && existing.updatedAt.getTime() >= updatedAt.getTime()) {
      continue;
    }

    await prisma.watchProgress.upsert({
      where: {
        userId_profileId_progressKey: {
          userId: auth.user.id,
          profileId: resolvedProfileId,
          progressKey: key,
        },
      },
      create: {
        userId: auth.user.id,
        profileId: resolvedProfileId,
        progressKey: key,
        subjectId: String(subId),
        detailPath: cleanDetailPath,
        title: cleanTitle,
        poster: cleanPoster,
        se: String(se),
        ep: String(ep),
        updatedAt,
      },
      update: {
        title: cleanTitle || existing?.title || null,
        poster: cleanPoster || existing?.poster || null,
        updatedAt,
      },
    });
    upserted += 1;
  }

  return { status: 200, body: { ok: true, upserted } };
}

export async function handleDeleteWatchProgress(request) {
  const auth = await requireUser(request);
  if (!auth.ok) return { status: auth.status, body: { error: auth.error } };
  if (!dbConfigured()) {
    return { status: 503, body: { error: "Database not configured" } };
  }
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  const targetProfileId = url.searchParams.get("profileId") || url.searchParams.get("profile_id");
  const prisma = getPrisma();

  const whereClause = { userId: auth.user.id };
  if (targetProfileId) {
    let userProfile = null;
    if (targetProfileId !== "1") {
      userProfile = await prisma.profile.findFirst({
        where: { id: targetProfileId, userId: auth.user.id },
        select: { id: true },
      });
      if (!userProfile) {
        return { status: 403, body: { error: "Profile access forbidden" } };
      }
    } else {
      userProfile =
        (await prisma.profile.findFirst({
          where: { userId: auth.user.id, isPrimary: true },
          select: { id: true },
        })) ||
        (await prisma.profile.findFirst({
          where: { userId: auth.user.id },
          select: { id: true },
        }));
    }
    if (userProfile) {
      whereClause.profileId = userProfile.id;
    }
  }

  if (key) {
    whereClause.progressKey = key;
    await prisma.watchProgress.deleteMany({
      where: whereClause,
    });
    return { status: 200, body: { ok: true, deleted: key } };
  }
  const result = await prisma.watchProgress.deleteMany({
    where: whereClause,
  });
  return { status: 200, body: { ok: true, deletedCount: result.count } };
}

function playlistToPublic(pl) {
  return {
    id: pl.id,
    name: pl.name,
    system: pl.system || undefined,
    created_at: pl.createdAt?.getTime?.() || Date.parse(pl.createdAt) || 0,
    updated_at: pl.updatedAt?.getTime?.() || Date.parse(pl.updatedAt) || 0,
    tracks: (pl.tracks || [])
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((t) => ({
        ...(typeof t.snapshot === "object" && t.snapshot ? t.snapshot : {}),
        id: t.trackId,
      })),
  };
}

export async function handleGetPlaylists(request) {
  const auth = await requireUser(request);
  if (!auth.ok) return { status: auth.status, body: { error: auth.error } };
  if (!dbConfigured()) {
    return { status: 503, body: { error: "Database not configured" } };
  }
  const rows = await getPrisma().playlist.findMany({
    where: { userId: auth.user.id },
    include: { tracks: true },
    orderBy: { updatedAt: "desc" },
  });
  return {
    status: 200,
    body: { ok: true, items: rows.map(playlistToPublic) },
  };
}

export async function handlePutPlaylists(request) {
  const auth = await requireUser(request);
  if (!auth.ok) return { status: auth.status, body: { error: auth.error } };
  if (!dbConfigured()) {
    return { status: 503, body: { error: "Database not configured" } };
  }
  const body = await request.json().catch(() => ({}));
  const items = Array.isArray(body.items) ? body.items : [];
  const prisma = getPrisma();
  let upserted = 0;

  for (const item of items) {
    const id = String(item.id || "").trim();
    if (!id) continue;
    const updatedAt = new Date(
      Number(item.updated_at || item.updatedAt) || Date.now()
    );
    const existing = await prisma.playlist.findUnique({ where: { id } });
    if (existing && existing.userId !== auth.user.id) continue;
    if (existing && existing.updatedAt > updatedAt) continue;

    await prisma.playlist.upsert({
      where: { id },
      create: {
        id,
        userId: auth.user.id,
        name: String(item.name || "Playlist").slice(0, 120),
        system: item.system || null,
        createdAt: new Date(
          Number(item.created_at || item.createdAt) || Date.now()
        ),
        updatedAt,
      },
      update: {
        name: String(item.name || "Playlist").slice(0, 120),
        system: item.system || null,
        updatedAt,
      },
    });

    const tracks = Array.isArray(item.tracks) ? item.tracks : [];
    await prisma.playlistTrack.deleteMany({ where: { playlistId: id } });
    for (let i = 0; i < tracks.length; i++) {
      const t = tracks[i];
      const trackId = String(t?.id || "").trim();
      if (!trackId) continue;
      await prisma.playlistTrack.create({
        data: {
          playlistId: id,
          trackId,
          sortOrder: i,
          snapshot: t,
        },
      });
    }
    upserted += 1;
  }

  return { status: 200, body: { ok: true, upserted } };
}

export async function handleGetLikes(request) {
  const auth = await requireUser(request);
  if (!auth.ok) return { status: auth.status, body: { error: auth.error } };
  if (!dbConfigured()) {
    return { status: 503, body: { error: "Database not configured" } };
  }
  const rows = await getPrisma().trackLike.findMany({
    where: { userId: auth.user.id },
    orderBy: { updatedAt: "desc" },
  });
  return {
    status: 200,
    body: {
      ok: true,
      items: rows.map((r) => ({
        trackId: r.trackId,
        snapshot: r.snapshot,
        updatedAt: r.updatedAt?.getTime?.() || 0,
      })),
      ids: rows.map((r) => r.trackId),
    },
  };
}

export async function handlePutLikes(request) {
  const auth = await requireUser(request);
  if (!auth.ok) return { status: auth.status, body: { error: auth.error } };
  if (!dbConfigured()) {
    return { status: 503, body: { error: "Database not configured" } };
  }
  const body = await request.json().catch(() => ({}));
  const items = Array.isArray(body.items)
    ? body.items
    : Array.isArray(body.ids)
      ? body.ids.map((id) => ({ trackId: id }))
      : [];
  const prisma = getPrisma();
  let upserted = 0;

  for (const item of items) {
    const trackId = String(item.trackId || item.id || "").trim();
    if (!trackId) continue;
    const updatedAt = new Date(Number(item.updatedAt) || Date.now());
    await prisma.trackLike.upsert({
      where: {
        userId_trackId: { userId: auth.user.id, trackId },
      },
      create: {
        userId: auth.user.id,
        trackId,
        snapshot: item.snapshot || item || null,
        updatedAt,
      },
      update: {
        snapshot: item.snapshot || item || null,
        updatedAt,
      },
    });
    upserted += 1;
  }

  if (body.replace === true && Array.isArray(body.ids)) {
    const keep = new Set(body.ids.map(String));
    const all = await prisma.trackLike.findMany({
      where: { userId: auth.user.id },
      select: { trackId: true },
    });
    const remove = all.filter((r) => !keep.has(r.trackId)).map((r) => r.trackId);
    if (remove.length) {
      await prisma.trackLike.deleteMany({
        where: { userId: auth.user.id, trackId: { in: remove } },
      });
    }
  }

  return { status: 200, body: { ok: true, upserted } };
}

export async function handleGetDownloads(request) {
  const auth = await requireUser(request);
  if (!auth.ok) return { status: auth.status, body: { error: auth.error } };
  if (!dbConfigured()) {
    return { status: 503, body: { error: "Database not configured" } };
  }
  const rows = await getPrisma().downloadItem.findMany({
    where: { userId: auth.user.id },
    orderBy: { updatedAt: "desc" },
  });
  return {
    status: 200,
    body: {
      ok: true,
      items: rows.map((r) => ({
        downloadId: r.downloadId,
        kind: r.kind,
        ...(typeof r.payload === "object" && r.payload ? r.payload : {}),
        id: r.downloadId,
        updatedAt: r.updatedAt?.getTime?.() || 0,
      })),
    },
  };
}

export async function handlePutDownloads(request) {
  const auth = await requireUser(request);
  if (!auth.ok) return { status: auth.status, body: { error: auth.error } };
  if (!dbConfigured()) {
    return { status: 503, body: { error: "Database not configured" } };
  }
  const body = await request.json().catch(() => ({}));
  const items = Array.isArray(body.items) ? body.items : [];
  const prisma = getPrisma();
  let upserted = 0;

  for (const item of items) {
    const downloadId = String(item.downloadId || item.id || "").trim();
    if (!downloadId) continue;
    const updatedAt = new Date(Number(item.updatedAt) || Date.now());
    const existing = await prisma.downloadItem.findUnique({
      where: {
        userId_downloadId: { userId: auth.user.id, downloadId },
      },
    });
    if (existing && existing.updatedAt > updatedAt) continue;

    // Strip local file URIs from synced metadata
    const payload = { ...item };
    delete payload.fileUri;
    delete payload.openFileUri;
    delete payload.resumeData;
    delete payload.subtitleUri;

    await prisma.downloadItem.upsert({
      where: {
        userId_downloadId: { userId: auth.user.id, downloadId },
      },
      create: {
        userId: auth.user.id,
        downloadId,
        kind: item.kind || null,
        payload,
        updatedAt,
      },
      update: {
        kind: item.kind || null,
        payload,
        updatedAt,
      },
    });
    upserted += 1;
  }

  return { status: 200, body: { ok: true, upserted } };
}

export async function handleGetWatchlist(request) {
  const auth = await requireUser(request);
  if (!auth.ok) return { status: auth.status, body: { error: auth.error } };
  if (!dbConfigured()) {
    return { status: 503, body: { error: "Database not configured" } };
  }
  const url = new URL(request.url);
  const targetProfileId = url.searchParams.get("profileId") || url.searchParams.get("profile_id");
  const sort = url.searchParams.get("sort") || "date";
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") || 100)));
  const prisma = getPrisma();

  const resolved = await resolveAuthProfileId(prisma, auth.user.id, targetProfileId);
  if (resolved.error) return { status: resolved.status, body: { error: resolved.error } };

  let orderBy = { addedAt: "desc" };
  if (sort === "az") orderBy = { title: "asc" };
  else if (sort === "year") orderBy = { year: "desc" };
  else if (sort === "rating") orderBy = { rating: "desc" };

  const rows = await prisma.watchlist.findMany({
    where: { profileId: resolved.profileId, userId: auth.user.id },
    orderBy,
    take: limit,
  });

  return {
    status: 200,
    body: {
      ok: true,
      items: rows.map((r) => ({
        id: r.subjectId,
        subjectId: r.subjectId,
        slug: r.subjectId,
        name: r.title || "Untitled",
        title: r.title || "Untitled",
        poster: r.poster,
        poster_url: r.poster,
        detailPath: r.detailPath,
        type: r.type,
        year: r.year,
        rating: r.rating,
        badge: r.badge,
        addedAt: r.addedAt ? r.addedAt.toISOString() : new Date().toISOString(),
      })),
    },
  };
}

export async function handlePostWatchlist(request) {
  const auth = await requireUser(request);
  if (!auth.ok) return { status: auth.status, body: { error: auth.error } };
  if (!dbConfigured()) {
    return { status: 503, body: { error: "Database not configured" } };
  }
  const body = await request.json().catch(() => ({}));
  const subjectId = String(body.subjectId || body.id || body.slug || "").trim();
  if (!subjectId) {
    return { status: 400, body: { error: "subjectId is required" } };
  }
  const targetProfileId = body.profileId || body.profile_id;
  const prisma = getPrisma();

  const resolved = await resolveAuthProfileId(prisma, auth.user.id, targetProfileId);
  if (resolved.error) return { status: resolved.status, body: { error: resolved.error } };

  const row = await prisma.watchlist.upsert({
    where: {
      profileId_subjectId: {
        profileId: resolved.profileId,
        subjectId,
      },
    },
    create: {
      userId: auth.user.id,
      profileId: resolved.profileId,
      subjectId,
      type: body.type === "tv" ? "tv" : "movie",
      title: body.title || body.name || null,
      poster: body.poster || body.poster_url || null,
      detailPath: body.detailPath || null,
      year: body.year ? String(body.year) : null,
      rating: body.rating ? String(body.rating) : null,
      badge: body.badge ? String(body.badge) : null,
      addedAt: new Date(),
    },
    update: {
      title: body.title || body.name || undefined,
      poster: body.poster || body.poster_url || undefined,
      detailPath: body.detailPath || undefined,
      year: body.year ? String(body.year) : undefined,
      rating: body.rating ? String(body.rating) : undefined,
      badge: body.badge ? String(body.badge) : undefined,
    },
  });

  return { status: 200, body: { ok: true, item: row } };
}

export async function handleDeleteWatchlist(request, pathname = "") {
  const auth = await requireUser(request);
  if (!auth.ok) return { status: auth.status, body: { error: auth.error } };
  if (!dbConfigured()) {
    return { status: 503, body: { error: "Database not configured" } };
  }
  const url = new URL(request.url);
  const targetProfileId = url.searchParams.get("profileId") || url.searchParams.get("profile_id");
  let subjectId = url.searchParams.get("subjectId") || url.searchParams.get("id");

  // Also support /api/watchlist/:subjectId format
  if (!subjectId && pathname) {
    const parts = pathname.replace(/^\/api\/watchlist\/?/, "").split("/");
    if (parts[0]) subjectId = decodeURIComponent(parts[0]);
  }

  const prisma = getPrisma();
  const resolved = await resolveAuthProfileId(prisma, auth.user.id, targetProfileId);
  if (resolved.error) return { status: resolved.status, body: { error: resolved.error } };

  // Check if bulk deletion body was sent
  let body = {};
  if (request.method === "DELETE" && !subjectId) {
    body = await request.json().catch(() => ({}));
  }

  if (Array.isArray(body.subjectIds) && body.subjectIds.length > 0) {
    const res = await prisma.watchlist.deleteMany({
      where: {
        profileId: resolved.profileId,
        userId: auth.user.id,
        subjectId: { in: body.subjectIds.map(String) },
      },
    });
    return { status: 200, body: { ok: true, deletedCount: res.count } };
  }

  if (!subjectId) {
    return { status: 400, body: { error: "subjectId is required" } };
  }

  await prisma.watchlist.deleteMany({
    where: {
      profileId: resolved.profileId,
      userId: auth.user.id,
      subjectId: String(subjectId),
    },
  });

  return { status: 200, body: { ok: true, deleted: subjectId } };
}

async function resolveAuthProfileId(prisma, userId, targetProfileId) {
  if (targetProfileId && targetProfileId !== "1") {
    const profile = await prisma.profile.findFirst({
      where: { id: targetProfileId, userId },
      select: { id: true },
    });
    if (!profile) return { error: "Profile access forbidden", status: 403 };
    return { profileId: profile.id };
  }
  let primary = await prisma.profile.findFirst({
    where: { userId, isPrimary: true },
    select: { id: true },
  });
  if (!primary) {
    primary = await prisma.profile.findFirst({
      where: { userId },
      select: { id: true },
    });
  }
  if (!primary) {
    primary = await prisma.profile.create({
      data: {
        userId,
        name: "Profile 1",
        isPrimary: true,
      },
      select: { id: true },
    });
  }
  return { profileId: primary.id };
}

export { asIso };

