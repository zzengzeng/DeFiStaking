/** Mirrors `ForceClaimAllLib.computeProportionalPay` for UI liquidity previews. */
export function computeProportionalPay(
  rA: bigint,
  rB: bigint,
  remain: bigint,
): { payA: bigint; payB: bigint } {
  const totalReward = rA + rB;
  if (totalReward === 0n || remain === 0n) return { payA: 0n, payB: 0n };
  const paidTotal = totalReward <= remain ? totalReward : remain;
  if (paidTotal === totalReward) return { payA: rA, payB: rB };

  let payA = (paidTotal * rA) / totalReward;
  if (payA > rA) payA = rA;
  let payB = paidTotal - payA;
  if (payB > rB) {
    payB = rB;
    payA = paidTotal - payB;
  }
  return { payA, payB };
}

/** `remain` in `forceClaimAll`: `balance(TokenB) - (poolB.totalStaked + unclaimedFeesB)`. */
export function estimateForceClaimSpendable(
  tokenBBalance: bigint,
  poolBTotalStaked: bigint,
  unclaimedFeesB: bigint,
): bigint {
  const locked = poolBTotalStaked + unclaimedFeesB;
  return tokenBBalance > locked ? tokenBBalance - locked : 0n;
}

export type ForceClaimLiquidityStatus = "full" | "partial" | "zero" | "unknown";

export function classifyForceClaimLiquidity(
  totalRewards: bigint,
  estimatedPayTotal: bigint,
  spendableRemain: bigint | null,
): ForceClaimLiquidityStatus {
  if (spendableRemain === null) return "unknown";
  if (totalRewards === 0n) return "full";
  if (spendableRemain === 0n) return "zero";
  if (estimatedPayTotal < totalRewards) return "partial";
  return "full";
}
