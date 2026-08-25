/**
 * Device access via Supabase REST.
 * If SUPABASE_URL / SUPABASE_SERVICE_KEY are missing, access is open (dev).
 */

function sbConfigured(env) {
  const url = String(env?.SUPABASE_URL || "").trim();
  const key = String(env?.SUPABASE_SERVICE_KEY || "").trim();
  if (!url || !key) return false;
  if (/YOUR_PROJECT|your_service_role/i.test(url + key)) return false;
  return true;
}

function sbHeaders(env) {
  const key = String(env.SUPABASE_SERVICE_KEY).trim();
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
}

function sbUrl(env, path) {
  return `${String(env.SUPABASE_URL).replace(/\/+$/, "")}/rest/v1${path}`;
}

function normalizeDeviceId(raw) {
  const id = String(raw || "").trim();
  if (!id || id.length < 8 || id.length > 128) return null;
  if (!/^[a-zA-Z0-9._:-]+$/.test(id)) return null;
  return id;
}

/**
 * Upsert device, refresh last_seen, return access decision.
 * @returns {Promise<{ allowed: boolean, mode: string, device?: object, reason?: string }>}
 */
export async function verifyDeviceAccess(env, body = {}) {
  if (!sbConfigured(env)) {
    return {
      allowed: true,
      mode: "open",
      hint: "Supabase not configured — access open",
    };
  }

  const deviceId = normalizeDeviceId(body.device_id);
  if (!deviceId) {
    return {
      allowed: false,
      mode: "supabase",
      reason: "Invalid device_id",
    };
  }

  const now = new Date().toISOString();
  const platform = String(body.platform || "").slice(0, 32) || null;
  const appVersion = String(body.app_version || "").slice(0, 64) || null;
  const deviceName = String(body.device_name || "").slice(0, 120) || null;
  const model = String(body.model || "").slice(0, 120) || null;

  // Existing row?
  const getRes = await fetch(
    sbUrl(env, `/app_devices?device_id=eq.${encodeURIComponent(deviceId)}&select=*`),
    { headers: sbHeaders(env) }
  );
  if (!getRes.ok) {
    const text = await getRes.text().catch(() => "");
    throw new Error(`Supabase read failed (${getRes.status}): ${text.slice(0, 200)}`);
  }
  const existing = await getRes.json();
  const row = Array.isArray(existing) ? existing[0] : null;

  if (row) {
    const patchRes = await fetch(
      sbUrl(env, `/app_devices?device_id=eq.${encodeURIComponent(deviceId)}`),
      {
        method: "PATCH",
        headers: sbHeaders(env),
        body: JSON.stringify({
          last_seen_at: now,
          platform: platform || row.platform,
          app_version: appVersion || row.app_version,
          device_name: deviceName || row.device_name,
          model: model || row.model,
        }),
      }
    );
    if (!patchRes.ok) {
      const text = await patchRes.text().catch(() => "");
      throw new Error(`Supabase update failed (${patchRes.status}): ${text.slice(0, 200)}`);
    }

    if (row.blocked) {
      return {
        allowed: false,
        mode: "supabase",
        reason:
          row.blocked_reason?.trim() ||
          "Your access to this app has been removed.",
        device: {
          device_id: row.device_id,
          blocked: true,
          first_seen_at: row.first_seen_at,
        },
      };
    }

    return {
      allowed: true,
      mode: "supabase",
      device: {
        device_id: row.device_id,
        blocked: false,
        first_seen_at: row.first_seen_at,
      },
    };
  }

  // New device
  const insertRes = await fetch(sbUrl(env, "/app_devices"), {
    method: "POST",
    headers: {
      ...sbHeaders(env),
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      device_id: deviceId,
      platform,
      app_version: appVersion,
      device_name: deviceName,
      model,
      first_seen_at: now,
      last_seen_at: now,
      blocked: false,
    }),
  });

  if (!insertRes.ok) {
    const text = await insertRes.text().catch(() => "");
    throw new Error(`Supabase insert failed (${insertRes.status}): ${text.slice(0, 200)}`);
  }

  const created = await insertRes.json();
  const createdRow = Array.isArray(created) ? created[0] : created;

  return {
    allowed: true,
    mode: "supabase",
    device: {
      device_id: createdRow?.device_id || deviceId,
      blocked: false,
      first_seen_at: createdRow?.first_seen_at || now,
    },
  };
}

export async function setDeviceBlocked(env, { device_id, blocked, reason } = {}) {
  if (!sbConfigured(env)) {
    throw new Error("Supabase not configured");
  }
  const deviceId = normalizeDeviceId(device_id);
  if (!deviceId) throw new Error("Invalid device_id");

  const payload = {
    blocked: Boolean(blocked),
    blocked_reason: blocked ? String(reason || "Blocked by admin").slice(0, 240) : null,
    blocked_at: blocked ? new Date().toISOString() : null,
  };

  const res = await fetch(
    sbUrl(env, `/app_devices?device_id=eq.${encodeURIComponent(deviceId)}`),
    {
      method: "PATCH",
      headers: sbHeaders(env),
      body: JSON.stringify(payload),
    }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase block failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const rows = await res.json();
  return Array.isArray(rows) ? rows[0] : rows;
}

export async function listDevices(env, { limit = 50 } = {}) {
  if (!sbConfigured(env)) {
    throw new Error("Supabase not configured");
  }
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const res = await fetch(
    sbUrl(
      env,
      `/app_devices?select=*&order=last_seen_at.desc&limit=${lim}`
    ),
    { headers: sbHeaders(env) }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase list failed (${res.status}): ${text.slice(0, 200)}`);
  }
  return res.json();
}

export function assertAdmin(env, request) {
  const expected = String(env?.ADMIN_API_KEY || "").trim();
  if (!expected) {
    return { ok: false, error: "ADMIN_API_KEY not set on server" };
  }
  const got =
    request.headers.get("x-admin-key") ||
    new URL(request.url).searchParams.get("key") ||
    "";
  if (got !== expected) {
    return { ok: false, error: "Unauthorized" };
  }
  return { ok: true };
}

export { sbConfigured };
