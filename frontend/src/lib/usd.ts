import { formatUnits } from "viem";

export function usdFromTokenAmount(amountWei: bigint, decimals: number, usdPerToken: number): number {
  const n = Number(formatUnits(amountWei, decimals));
  if (!Number.isFinite(n)) return 0;
  return n * usdPerToken;
}

export function formatUsd(amountUsd: number, fractionDigits = 0): string {
  if (!Number.isFinite(amountUsd)) return "$0";
  return amountUsd.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: fractionDigits });
}
