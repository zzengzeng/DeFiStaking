/** 可选 USD 参考价：未配置时默认 1.00（测试网演示）；≤0 时不展示美元估值。 */
const DEFAULT_USD_PRICE = 1;

function readUsdPrice(raw: string | undefined): number | null {
  const trimmed = raw?.trim();
  if (!trimmed) return DEFAULT_USD_PRICE;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

const PRICES = {
  TokenA: readUsdPrice(process.env.NEXT_PUBLIC_USD_PRICE_TOKEN_A),
  TokenB: readUsdPrice(process.env.NEXT_PUBLIC_USD_PRICE_TOKEN_B),
} as const;

export function getTokenUsdPrice(symbol: string): number | null {
  if (symbol === "TokenA") return PRICES.TokenA;
  if (symbol === "TokenB") return PRICES.TokenB;
  return null;
}

export const showsUsdEstimates = PRICES.TokenA !== null || PRICES.TokenB !== null;
