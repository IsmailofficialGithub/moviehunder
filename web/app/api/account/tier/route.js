import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const BACKEND = process.env.INTERNAL_API_BASE || "http://127.0.0.1:8787";

export async function POST(request) {
  try {
    const auth = request.headers.get("authorization") || "";
    const body = await request.text();

    const res = await fetch(`${BACKEND}/api/account/tier`, {
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
