import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/session";

/**
 * GET /api/auth/session — 返回当前 session 信息（脱敏）。
 *
 * 未登录或 session 已销毁返回 { address: null }。
 */
export async function GET() {
  const session = await getSession();
  if (!session.address) {
    return NextResponse.json({ address: null });
  }
  return NextResponse.json({
    address: session.address,
    iat: session.iat ?? null,
    lat: session.lat ?? null,
  });
}
