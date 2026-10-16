import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function getBackendUrl() {
  const env = (
    process.env.INTERNAL_API_BASE ||
    process.env.NEXT_PUBLIC_API_BASE ||
    ""
  ).replace(/\/+$/, "");

  const isProd = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
  if (isProd && (!env || env.includes("127.0.0.1") || env.includes("localhost"))) {
    return "https://api.offstream.co";
  }
  return env || "http://127.0.0.1:8787";
}

export async function DELETE(request, { params }) {
  try {
    const backend = getBackendUrl();
    const auth = request.headers.get("authorization") || "";
    const resolvedParams = await params;
    const slugParts = resolvedParams?.slug || [];
    const subPath = Array.isArray(slugParts) ? slugParts.join("/") : slugParts;

    const appKey = String(process.env.APP_CLIENT_KEY || "").trim();
    const headers = {
      Accept: "application/json",
      ...(auth ? { Authorization: auth } : {}),
      ...(appKey ? { "X-App-Key": appKey } : {}),
    };

    const res = await fetch(`${backend}/api/watchlist/${subPath}`, {
      method: "DELETE",
      headers,
      signal: AbortSignal.timeout(4000),
    });

    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
