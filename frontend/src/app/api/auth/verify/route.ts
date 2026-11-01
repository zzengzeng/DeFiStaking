import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/session";
import { verifySiweMessage } from "@/lib/auth/siwe";

/**
 * POST /api/auth/verify — 验证 SIWE 消息 + 签名，成功后建立 session。
 *
 * Body: { message: string; signature: `0x${string}` }
 * 响应: { ok: true, address, expiresAt } | { ok: false, error }
 */
export async function POST(req: Request) {
  let body: { message?: string; signature?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.message || !body.signature) {
    return NextResponse.json({ ok: false, error: "message and signature required" }, { status: 400 });
  }

  const result = await verifySiweMessage({
    message: body.message,
    signature: body.signature,
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 401 });
  }

  const session = await getSession();
  const iat = Math.floor(Date.now() / 1000);
  session.address = result.address;
  session.iat = iat;
  session.lat = iat;
  await session.save();

  return NextResponse.json({
    ok: true,
    address: result.address,
    expiresAt: iat + 60 * 60 * 24,
  });
}
