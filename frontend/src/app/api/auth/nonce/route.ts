import { NextResponse } from "next/server";

import { generateNonce } from "@/lib/auth/nonceStore";

// 强制动态渲染：每个请求需要独立的 nonce。
export const dynamic = "force-dynamic";

/**
 * GET /api/auth/nonce — 返回一个一次性 nonce，供客户端构造 SIWE 消息。
 *
 * 这是可选步骤：客户端可以直接在后端验证时传入自生成的 nonce（后端会校验其是否已使用）。
 * 但预先签发可以让客户端知道服务端认可该 nonce，避免客户端盲签后被拒。
 */
export async function GET() {
  const nonce = generateNonce();
  return NextResponse.json({ nonce }, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
