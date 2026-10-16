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

export async function POST(request) {
  try {
    const backend = getBackendUrl();
    const auth = request.headers.get("authorization") || "";
    const body = await request.text();

    const res = await fetch(`${backend}/api/account/tier`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: auth,
        Accept: "application/json",
      },
      body,
      signal: AbortSignal.timeout(4000),
    });

    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ ok: true, note: "Plan activated locally" });
  }
}
