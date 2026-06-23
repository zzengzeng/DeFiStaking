import { contractAddresses, sepoliaAuxAddresses } from "@/contracts/addresses";

function norm(addr: string | undefined): string | null {
  if (!addr) return null;
  const s = addr.trim().toLowerCase();
  if (s === "0x0000000000000000000000000000000000000000") return null;
  return /^0x[a-f0-9]{40}$/.test(s) ? s : null;
}

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

/** 链上 Core 指向的模块地址是否与前端 env 配置一致 */
export function hasDeploymentModuleMismatch(
  onChainUserModule: `0x${string}` | undefined,
  onChainAdminModule: `0x${string}` | undefined,
): boolean {
  const chainUser = norm(onChainUserModule);
  const chainAdmin = norm(onChainAdminModule);
  const envUser = norm(sepoliaAuxAddresses.dualPoolUserModule);
  const envAdmin = norm(sepoliaAuxAddresses.dualPoolAdminModule);
  if (!chainUser || !chainAdmin || !envUser || !envAdmin) return false;
  return chainUser !== envUser || chainAdmin !== envAdmin;
}

export type DeploymentMismatchKind = "token" | "module";

export function getDeploymentMismatchKinds(
  poolAStakingToken: `0x${string}` | undefined,
  poolBStakingToken: `0x${string}` | undefined,
  onChainUserModule: `0x${string}` | undefined,
  onChainAdminModule: `0x${string}` | undefined,
): DeploymentMismatchKind[] {
  const kinds: DeploymentMismatchKind[] = [];
  if (hasDeploymentTokenMismatch(poolAStakingToken, poolBStakingToken)) kinds.push("token");
  if (hasDeploymentModuleMismatch(onChainUserModule, onChainAdminModule)) kinds.push("module");
  return kinds;
}
