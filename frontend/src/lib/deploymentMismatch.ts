import { contractAddresses } from "@/contracts/addresses";

/** 配置中的 Token 地址是否与链上 poolA/poolB.stakingToken 一致。 */
export function hasDeploymentTokenMismatch(
  poolAStakingToken: `0x${string}` | undefined,
  poolBStakingToken: `0x${string}` | undefined,
): boolean {
  if (!poolAStakingToken || !poolBStakingToken) return false;
  const a = contractAddresses.tokenA.toLowerCase();
  const b = contractAddresses.tokenB.toLowerCase();
  return poolAStakingToken.toLowerCase() !== a || poolBStakingToken.toLowerCase() !== b;
}

export const DEPLOYMENT_MISMATCH_HINT =
  "前端配置的 Token 地址与当前 Staking 合约不一致。请核对 NEXT_PUBLIC_DUAL_STAKING_ADDRESS 与 TOKEN_A/TOKEN_B，或按 README 用 TOKEN_A/TOKEN_B 环境变量重新部署后再同步地址。";
