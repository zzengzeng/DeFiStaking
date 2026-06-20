/** 可选 USD 参考价：未配置或 ≤0 时不展示美元估值（主网可接预言机/API 后写入 env）。 */
function readUsdPrice(envKey: string): number | null {
  const raw = process.env[envKey]?.trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

const PRICES = {
  TokenA: readUsdPrice("NEXT_PUBLIC_USD_PRICE_TOKEN_A"),
  TokenB: readUsdPrice("NEXT_PUBLIC_USD_PRICE_TOKEN_B"),
} as const;

export function getTokenUsdPrice(symbol: string): number | null {
  if (symbol === "TokenA") return PRICES.TokenA;
  if (symbol === "TokenB") return PRICES.TokenB;
  return null;
}

export const showsUsdEstimates = PRICES.TokenA !== null || PRICES.TokenB !== null;
