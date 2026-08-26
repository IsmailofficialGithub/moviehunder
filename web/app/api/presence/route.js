import { NextResponse } from "next/server";
import { presenceSnapshot } from "../../../lib/presenceStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(presenceSnapshot());
}
