export type TokenSymbol = "TokenA" | "TokenB";

export function normalizeTokenSymbol(symbol: string): TokenSymbol | null {
  if (symbol === "TokenA" || symbol === "A") return "TokenA";
  if (symbol === "TokenB" || symbol === "B") return "TokenB";
  return null;
}

export const TOKEN_META: Record<
  TokenSymbol,
  { short: string; label: string; from: string; to: string; shadow: string }
> = {
  TokenA: {
    short: "A",
    label: "TokenA",
    from: "#38bdf8",
    to: "#0ea5e9",
    shadow: "rgba(56, 189, 248, 0.35)",
  },
  TokenB: {
    short: "B",
    label: "TokenB",
    from: "#a78bfa",
    to: "#7c3aed",
    shadow: "rgba(167, 139, 250, 0.35)",
  },
};
