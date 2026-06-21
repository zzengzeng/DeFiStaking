import { contractAddresses } from "@/contracts/addresses";

/** 配置中的 Token 地址是否与链上 poolA/poolB.stakingToken 一致（env 与部署不同步时提示） */
export function hasDeploymentTokenMismatch(
  poolAStakingToken: `0x${string}` | undefined,
  poolBStakingToken: `0x${string}` | undefined,
): boolean {
  if (!poolAStakingToken || !poolBStakingToken) return false;
  const a = contractAddresses.tokenA.toLowerCase();
  const b = contractAddresses.tokenB.toLowerCase();
  return poolAStakingToken.toLowerCase() !== a || poolBStakingToken.toLowerCase() !== b;
}
