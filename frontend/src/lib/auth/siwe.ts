import { SiweMessage, type SiweMessage as SiweMessageT } from "siwe";

import { consumeNonce, generateNonce, isNonceUsed } from "@/lib/auth/nonceStore";

/**
 * SIWE 配置。
 * - domain / uri 用于消息绑定，防止钓鱼。
 * - statement 是用户会在签名对话框里看到的文字。
 */
export const SIWE_CONFIG = {
  domain: process.env.NEXT_PUBLIC_APP_DOMAIN ?? "localhost",
  uri: process.env.NEXT_PUBLIC_APP_URI ?? "http://localhost:3000",
  statement: "Sign in to SuperAdmin Console",
  version: "1",
};

export type ComposeInput = {
  address: string;
  chainId: number;
  nonce?: string;
  issuedAt?: Date;
};

/**
 * 构造一条 SIWE 消息（明文），供钱包签名。
 *
 * - 如果未传 `nonce`，自动生成一个并在服务端登记。
 * - 如果传了 `nonce`，视为客户端预请求过（用于防重放）。
 */
export function composeSiweMessage(input: ComposeInput): { message: string; nonce: string } {
  const nonce = input.nonce ?? generateNonce();
  const fields: Partial<SiweMessageT> = {
    domain: SIWE_CONFIG.domain,
    address: input.address,
    statement: SIWE_CONFIG.statement,
    uri: SIWE_CONFIG.uri,
    version: SIWE_CONFIG.version,
    chainId: input.chainId,
    nonce,
    issuedAt: (input.issuedAt ?? new Date()).toISOString(),
    expirationTime: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 分钟有效
  };
  const msg = new SiweMessage(fields);
  return { message: msg.prepareMessage(), nonce };
}

export type VerifyInput = {
  message: string;
  signature: string;
};

export type VerifyResult =
  | { ok: true; address: `0x${string}`; nonce: string }
  | { ok: false; error: string };

/**
 * 验证钱包签名。
 *
 * 检查项：
 * - SIWE 消息格式
 * - 域名 / URI / 版本匹配
 * - 消息未过期
 * - nonce 未使用
 * - 签名正确（恢复出 message.address）
 */
export async function verifySiweMessage(input: VerifyInput): Promise<VerifyResult> {
  let msg: SiweMessage;
  try {
    msg = new SiweMessage(input.message);
  } catch (e) {
    return { ok: false, error: `Invalid message: ${(e as Error).message}` };
  }

  if (msg.domain !== SIWE_CONFIG.domain) {
    return { ok: false, error: "Domain mismatch" };
  }
  if (msg.uri !== SIWE_CONFIG.uri) {
    return { ok: false, error: "URI mismatch" };
  }

  // 检查过期
  if (msg.expirationTime) {
    const exp = new Date(msg.expirationTime).getTime();
    if (exp < Date.now()) return { ok: false, error: "Message expired" };
  }

  // 检查 nonce 是否已被使用（重放）
  if (isNonceUsed(msg.nonce)) {
    return { ok: false, error: "Nonce already used" };
  }

  let verifyResult;
  try {
    verifyResult = await msg.verify({ signature: input.signature });
  } catch (e) {
    return { ok: false, error: `Verify failed: ${(e as Error).message}` };
  }

  if (!verifyResult.success) {
    return { ok: false, error: (verifyResult.error?.type as string | undefined) ?? "Verification failed" };
  }

  // 标记 nonce 为已用
  consumeNonce(msg.nonce);

  return {
    ok: true,
    address: msg.address as `0x${string}`,
    nonce: msg.nonce,
  };
}
