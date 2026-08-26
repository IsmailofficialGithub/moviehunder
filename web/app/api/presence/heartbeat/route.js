import { NextResponse } from "next/server";
import { presenceHeartbeat } from "../../../../lib/presenceStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request) {
  let body = {};
  try {
    const text = await request.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    body = {};
  }
  const out = presenceHeartbeat(body.id || body.sessionId);
  return NextResponse.json(out, { status: out.status || 200 });
}
