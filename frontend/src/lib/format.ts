import { formatUnits } from "viem";

import { formatUsd, usdFromTokenAmount } from "@/lib/usd";

/** 将 bigint 金额格式化为可读小数。 */
export function formatToken(amount: bigint, decimals = 18, fractionDigits = 4): string {
  const raw = Number(formatUnits(amount, decimals));
  if (!Number.isFinite(raw)) return "0";
  return raw.toLocaleString(undefined, { maximumFractionDigits: fractionDigits });
}

/** Token 数量 + 演示 USD，如 `10.5 TokenB ($2,134)`。 */
export function formatTokenWithUsd(amount: bigint, symbol: string, usdPerToken: number, decimals = 18, fractionDigits = 4): string {
  const tok = formatToken(amount, decimals, fractionDigits);
  const usd = formatUsd(usdFromTokenAmount(amount, decimals, usdPerToken), 0);
  return `${tok} ${symbol} (${usd})`;
}

/** 计算协议是否存在资不抵债风险。 */
export function isInsolvent(balance: bigint, required: bigint): boolean {
  return balance < required;
}

/** 百分比 basis points 转字符串（避免 bigint 转 number 溢出与 NaN）。 */
export function bpToPercent(bp: bigint | number): string {
  if (typeof bp === "bigint") {
    if (bp < 0n) return "0.00%";
    const intPart = bp / 100n;
    const frac = bp % 100n;
    return `${intPart}.${frac.toString().padStart(2, "0")}%`;
  }
  if (!Number.isFinite(bp) || bp < 0) return "0.00%";
  return `${(bp / 100).toFixed(2)}%`;
}

/** 有限数字，否则 0（用于 APY 等展示）。 */
export function safeNumber(n: number, fallback = 0): number {
  return Number.isFinite(n) ? n : fallback;
}
