import { sepoliaDeploymentMeta } from "@/contracts/addresses";
import { fetchStakerStats, type StakerStats } from "@/lib/stakerLogQuery";
import { withIndexerRpc } from "@/lib/serverRpc";

export async function indexStakerStats(
  stakingAddress: `0x${string}`,
  chainId: number,
): Promise<StakerStats> {
  const defaultFromBlock =
    chainId === sepoliaDeploymentMeta.chainId ? String(sepoliaDeploymentMeta.stakingDeployBlock) : "0";
  const fromBlock = BigInt(process.env.NEXT_PUBLIC_STAKING_DEPLOY_BLOCK ?? defaultFromBlock);

  return withIndexerRpc(chainId, (client) => fetchStakerStats(client, stakingAddress, fromBlock));
}
