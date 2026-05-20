import { formatUnits } from "viem";

/** 演示用 USD 参考价（未接预言机时可替换为真实喂价）。 */
export const MOCK_USD_PRICE_TOKEN_A = 1.02;
export const MOCK_USD_PRICE_TOKEN_B = 203.2;

export function usdFromTokenAmount(amountWei: bigint, decimals: number, usdPerToken: number): number {
  const n = Number(formatUnits(amountWei, decimals));
  if (!Number.isFinite(n)) return 0;
  return n * usdPerToken;
}

export function formatUsd(amountUsd: number, fractionDigits = 0): string {
  if (!Number.isFinite(amountUsd)) return "$0";
  return amountUsd.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: fractionDigits });
}
