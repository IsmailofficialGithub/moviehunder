import { dbConfigured, getPrisma } from "./db.js";
import { requireUser } from "./auth.js";

function asIso(d) {
  if (!d) return null;
  return d instanceof Date ? d.toISOString() : d;
}

function progressToPublic(row) {
  return {
    key: row.progressKey,
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

function extractProfileId(request, opts = {}) {
  if (opts.profileIdOverride !== undefined) return opts.profileIdOverride;
  const h = request.headers.get("x-profile-id");
  if (h && h.trim()) return h.trim();
  try {
    const u = new URL(request.url);
    return u.searchParams.get("profileId") || null;
  } catch {
    return null;
  }
}

async function resolveSyncAuth(request, opts = {}) {
  if (opts.authUser) return { ok: true, user: opts.authUser };
  return await requireUser(request);
}

export async function handleGetWatchProgress(request, opts = {}) {
  const auth = await resolveSyncAuth(request, opts);
  if (!auth.ok) return { status: auth.status, body: { error: auth.error } };
  if (!opts.dbConfiguredOverride && !dbConfigured()) {
    return { status: 503, body: { error: "Database not configured" } };
  }
  const prisma = opts.prismaOverride || getPrisma();
  const profileId = extractProfileId(request, opts);

  const where = { userId: auth.user.id };
  if (profileId) {
    where.profileId = profileId;
  }

  const rows = await prisma.watchProgress.findMany({
    where,
    orderBy: { updatedAt: "desc" },
  });
  return {
    status: 200,
    body: { ok: true, items: rows.map(progressToPublic) },
  };
}

export async function handlePutWatchProgress(request, opts = {}) {
  const auth = await resolveSyncAuth(request, opts);
  if (!auth.ok) return { status: auth.status, body: { error: auth.error } };
  if (!opts.dbConfiguredOverride && !dbConfigured()) {
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
  const prisma = opts.prismaOverride || getPrisma();
  const profileId = extractProfileId(request, opts);
  let upserted = 0;

  for (const item of items) {
    const key = String(item.key || item.progressKey || "").trim();
    if (!key) continue;
    const updatedAt = new Date(
      Number(item.updatedAt) || Date.parse(item.updatedAt) || Date.now()
    );

    const lookupWhere = { userId: auth.user.id, progressKey: key };
    if (profileId) {
      lookupWhere.profileId = profileId;
    }

    const existing = await prisma.watchProgress.findFirst({
      where: lookupWhere,
    });

    const incomingPos = Number(item.position) || 0;
    const isRewind = Boolean(item.rewind || incomingPos < 15);
    let finalPos = incomingPos;
    let finalCompleted = Boolean(item.completed);

    if (existing) {
      if (existing.updatedAt && existing.updatedAt.getTime() - updatedAt.getTime() > 10000) {
        continue;
      }

      const timeDiff = Math.abs(updatedAt.getTime() - existing.updatedAt.getTime());
      if (timeDiff < 180000 && existing.position > incomingPos && !isRewind) {
        finalPos = existing.position;
        if (existing.completed) finalCompleted = true;
      }
    }

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

    const payload = {
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
    };

    if (existing) {
      await prisma.watchProgress.update({
        where: { id: existing.id },
        data: {
          ...payload,
          ...(profileId ? { profileId } : {}),
        },
      });
    } else {
      await prisma.watchProgress.create({
        data: {
          userId: auth.user.id,
          profileId: profileId || null,
          progressKey: key,
          ...payload,
        },
      });
    }
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
  const prisma = getPrisma();
  let upserted = 0;

  for (const item of items) {
    if (!item.subjectId) continue;
    const updatedAt = new Date(Number(item.lastWatched) || Date.now());
    const key = (item.se && item.ep && item.se !== "0" && item.ep !== "0") ? `${item.subjectId}_${item.se}_${item.ep}` : String(item.subjectId);

    const existing = await prisma.watchProgress.findUnique({
      where: {
        userId_progressKey: { userId: auth.user.id, progressKey: key },
      },
    });

    if (existing && existing.updatedAt.getTime() >= updatedAt.getTime()) {
      continue;
    }

    await prisma.watchProgress.upsert({
      where: {
        userId_progressKey: { userId: auth.user.id, progressKey: key },
      },
      create: {
        userId: auth.user.id,
        progressKey: key,
        subjectId: item.subjectId,
        detailPath: item.detailPath || null,
        title: item.title || null,
        poster: item.poster || null,
        se: item.se != null ? String(item.se) : null,
        ep: item.ep != null ? String(item.ep) : null,
        updatedAt,
      },
      update: {
        title: item.title || existing?.title || null,
        poster: item.poster || existing?.poster || null,
        updatedAt,
      },
    });
    upserted += 1;
  }

  return { status: 200, body: { ok: true, upserted } };
}

export async function handleDeleteWatchProgress(request, opts = {}) {
  const auth = await resolveSyncAuth(request, opts);
  if (!auth.ok) return { status: auth.status, body: { error: auth.error } };
  if (!opts.dbConfiguredOverride && !dbConfigured()) {
    return { status: 503, body: { error: "Database not configured" } };
  }
  const url = new URL(request.url);
  const key = url.searchParams.get("key") || url.searchParams.get("progressKey");
  const prisma = opts.prismaOverride || getPrisma();
  const profileId = extractProfileId(request, opts);

  const where = { userId: auth.user.id };
  if (key) {
    where.progressKey = key;
  }
  if (profileId) {
    where.profileId = profileId;
  }

  const result = await prisma.watchProgress.deleteMany({ where });
  return { status: 200, body: { ok: true, deleted: key || null, deletedCount: result.count } };
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

export { asIso };
