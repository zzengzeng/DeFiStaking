import { NextResponse } from "next/server";

import { destroySession } from "@/lib/auth/session";

/**
 * DELETE /api/auth/logout — 销毁当前 session（退出登录）。
 */
export async function DELETE() {
  await destroySession();
  return NextResponse.json({ ok: true });
}
