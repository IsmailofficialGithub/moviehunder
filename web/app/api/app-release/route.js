import { NextResponse } from "next/server";
import { getVersionJsonUrl } from "../../../lib/config";

export const dynamic = "force-dynamic";

async function loadVersionJson() {
  const remote = getVersionJsonUrl();
  try {
    const res = await fetch(remote, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      next: { revalidate: 0 },
    });
    if (res.ok) return await res.json();
  } catch {
    /* fall through */
  }

  // Same-origin fallback shipped with the web app
  const origin = process.env.NEXT_PUBLIC_SITE_URL || "";
  const localUrl = origin
    ? `${origin.replace(/\/+$/, "")}/version.json`
    : null;

  if (localUrl) {
    try {
      const res = await fetch(localUrl, { cache: "no-store" });
      if (res.ok) return await res.json();
    } catch {
      /* ignore */
    }
  }

  // Built-in fallback matching repo version.json
  return {
    latest_version: "0.0.1",
    min_supported_version: "0.0.1",
    release_notes: "MovieHunter v0.0.1 — first release.",
    android: {
      version_code: 1,
      apk_url:
        "https://github.com/IsmailofficialGithub/moviehunder/releases/download/v0.0.1/moviehunter-0.0.1.apk",
      force: false,
    },
  };
}

async function assetExists(url) {
  if (!url) return false;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (res.ok) return true;
    // Some hosts disallow HEAD — try a tiny GET range
    if (res.status === 403 || res.status === 405) {
      const getRes = await fetch(url, {
        method: "GET",
        headers: { Range: "bytes=0-0" },
        redirect: "follow",
      });
      return getRes.ok || getRes.status === 206;
    }
    return false;
  } catch {
    // Network errors: still allow if URL is configured (client can try download)
    return true;
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const platform = String(searchParams.get("platform") || "desktop").toLowerCase();

  try {
    const data = await loadVersionJson();
    const version = String(data.latest_version || data.version || "").trim();
    const notes = String(data.release_notes || data.releaseNotes || "").trim();
    const androidUrl = String(
      data.android?.apk_url || data.android?.apkUrl || data.apk_url || ""
    ).trim();
    const iosUrl = String(
      data.ios?.ipa_url ||
        data.ios?.ipaUrl ||
        data.ios?.download_url ||
        data.ios?.app_store_url ||
        data.ios?.url ||
        ""
    ).trim();

    if (platform === "android") {
      const available = Boolean(androidUrl) && (await assetExists(androidUrl));
      return NextResponse.json({
        platform: "android",
        available,
        downloadUrl: available ? androidUrl : null,
        version,
        notes,
        label: "Android APK",
      });
    }

    if (platform === "ios") {
      const available = Boolean(iosUrl) && (await assetExists(iosUrl));
      return NextResponse.json({
        platform: "ios",
        available,
        downloadUrl: available ? iosUrl : null,
        version,
        notes,
        label: "iPhone / iPad",
      });
    }

    const [androidOk, iosOk] = await Promise.all([
      androidUrl ? assetExists(androidUrl) : Promise.resolve(false),
      iosUrl ? assetExists(iosUrl) : Promise.resolve(false),
    ]);

    return NextResponse.json({
      platform: "desktop",
      available: androidOk || iosOk,
      android: {
        available: androidOk,
        downloadUrl: androidOk ? androidUrl : null,
        label: "Android APK",
      },
      ios: {
        available: iosOk,
        downloadUrl: iosOk ? iosUrl : null,
        label: "iPhone / iPad",
      },
      version,
      notes,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e?.message || "Failed to check releases" },
      { status: 500 }
    );
  }
}
