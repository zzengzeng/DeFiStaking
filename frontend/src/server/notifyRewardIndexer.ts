import { sepoliaDeploymentMeta } from "@/contracts/addresses";
import { enrichWithBlockTimestamps } from "@/lib/enrichBlockTimestamps";
import { fetchNotifyRewardLogs } from "@/lib/notifyRewardLogQuery";
import { withIndexerRpc } from "@/lib/serverRpc";
import type { IndexedNotifyReward } from "@/types/notifyRewardLog";

/** 从链上 `RewardNotified` 日志拉取运营注资（notify）记录，按区块从新到旧排序。 */
export async function indexNotifyRewardLogs(
  stakingAddress: `0x${string}`,
  chainId: number,
): Promise<IndexedNotifyReward[]> {
  const defaultFromBlock =
    chainId === sepoliaDeploymentMeta.chainId ? String(sepoliaDeploymentMeta.stakingDeployBlock) : "0";
  const fromBlock = BigInt(process.env.NEXT_PUBLIC_STAKING_DEPLOY_BLOCK ?? defaultFromBlock);

  return withIndexerRpc(chainId, async (client) => {
    const rows = await fetchNotifyRewardLogs(client, stakingAddress, fromBlock);
    return enrichWithBlockTimestamps(client, rows);
  });
}
