import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const BACKEND = process.env.INTERNAL_API_BASE || "http://127.0.0.1:8787";

export async function DELETE(request, { params }) {
  try {
    const auth = request.headers.get("authorization") || "";
    const resolvedParams = await params;
    const slugParts = resolvedParams?.slug || [];
    const subPath = Array.isArray(slugParts) ? slugParts.join("/") : slugParts;

    const res = await fetch(`${BACKEND}/api/watchlist/${subPath}`, {
      method: "DELETE",
      headers: {
        Authorization: auth,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(4000),
    });

    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
