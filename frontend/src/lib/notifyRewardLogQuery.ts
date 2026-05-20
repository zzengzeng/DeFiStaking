import { getAddress, parseAbiItem, type PublicClient } from "viem";

import type { IndexedNotifyReward } from "@/types/notifyRewardLog";

export const rewardNotifiedEvent = parseAbiItem(
  "event RewardNotified(uint8 indexed pool, uint256 amount, uint256 duration, uint256 rate)",
);

function sortNotifyRows(rows: IndexedNotifyReward[]): IndexedNotifyReward[] {
  return [...rows].sort((a, b) => {
    const bn = BigInt(b.blockNumber) - BigInt(a.blockNumber);
    if (bn !== 0n) return Number(bn);
    return b.logIndex - a.logIndex;
  });
}

/** 使用任意 viem `PublicClient` 拉取质押合约上的 `RewardNotified` 日志（浏览器 / 服务端共用）。 */
export async function fetchNotifyRewardLogs(
  client: PublicClient,
  stakingAddress: `0x${string}`,
  fromBlock: bigint,
): Promise<IndexedNotifyReward[]> {
  const logs = await client.getLogs({
    address: getAddress(stakingAddress),
    event: rewardNotifiedEvent,
    fromBlock,
    toBlock: "latest",
  });
  const rows: IndexedNotifyReward[] = logs.map((log) => ({
    pool: Number(log.args.pool ?? 0) === 1 ? 1 : 0,
    amount: (log.args.amount ?? 0n).toString(),
    duration: (log.args.duration ?? 0n).toString(),
    rate: (log.args.rate ?? 0n).toString(),
    blockNumber: (log.blockNumber ?? 0n).toString(),
    transactionHash: log.transactionHash,
    logIndex: log.logIndex,
  }));
  return sortNotifyRows(rows);
}
