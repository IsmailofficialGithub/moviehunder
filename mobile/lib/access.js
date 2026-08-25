import { getApiBase, apiClientHeaders } from "./config";
import { getDeviceId, getDeviceMeta } from "./deviceId";

/**
 * Register / verify this install with the backend.
 * @returns {Promise<{ allowed: boolean, reason?: string, mode?: string, error?: string }>}
 */
export async function verifyAccess() {
  const device_id = await getDeviceId();
  const meta = getDeviceMeta();
  const url = `${getApiBase()}/api/access/verify`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: apiClientHeaders({
        "Content-Type": "application/json",
        Accept: "application/json",
      }),
      body: JSON.stringify({ device_id, ...meta }),
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => ({}));

    // CORS / client gate rejection — not a device block
    if (res.status === 403 && data.error === "Forbidden") {
      return {
        allowed: true,
        mode: "degraded",
        error: data.reason || "API client unauthorized",
      };
    }

    // Only block when admin explicitly blocked this device (403)
    if (res.status === 403) {
      return {
        allowed: false,
        reason:
          data.reason ||
          data.blocked_reason ||
          "Your access to this app has been removed.",
        mode: data.mode,
      };
    }

    if (!res.ok) {
      return {
        allowed: true,
        mode: data.mode || "degraded",
        error: data.error || data.hint || `Access check failed (${res.status})`,
      };
    }

    if (data.allowed === false) {
      return {
        allowed: false,
        reason:
          data.reason ||
          data.blocked_reason ||
          "Your access to this app has been removed.",
        mode: data.mode,
      };
    }

    return {
      allowed: data.allowed !== false,
      mode: data.mode || "ok",
    };
  } catch (err) {
    return {
      allowed: true,
      mode: "offline",
      error: err?.message || "Network error",
    };
  } finally {
    clearTimeout(timer);
  }
}
