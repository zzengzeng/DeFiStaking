/** userInfoA / userInfoB 元组：staked, rewards, rewardPaid（与 ABI 一致）。 */
export function parseUserInfoTuple(u: unknown): { staked: bigint; rewards: bigint; rewardPaid: bigint } {
  if (!u) return { staked: 0n, rewards: 0n, rewardPaid: 0n };
  if (Array.isArray(u)) {
    return {
      staked: (u[0] as bigint) ?? 0n,
      rewards: (u[1] as bigint) ?? 0n,
      rewardPaid: (u[2] as bigint) ?? 0n,
    };
  }
  const o = u as { staked?: bigint; rewards?: bigint; rewardPaid?: bigint };
  return { staked: o.staked ?? 0n, rewards: o.rewards ?? 0n, rewardPaid: o.rewardPaid ?? 0n };
}
