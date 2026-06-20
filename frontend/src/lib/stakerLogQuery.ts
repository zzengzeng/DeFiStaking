import { getAddress, parseAbiItem, type PublicClient } from "viem";

import { getLogsInChunks } from "@/lib/chunkedGetLogs";

export type StakerStats = {
  total: number;
  poolA: number;
  poolB: number;
};

export const stakedEvent = parseAbiItem(
  "event Staked(address indexed user, uint256 amount, uint256 newUnlockTime, uint8 indexed pool)",
);

/**
 * 扫描 `Staked` 事件以统计独立 staker 数量（分块 getLogs）。
 */
export async function fetchStakerStats(
  client: PublicClient,
  stakingAddress: `0x${string}`,
  fromBlock: bigint,
): Promise<StakerStats> {
  const addr = getAddress(stakingAddress);
  const logs = await getLogsInChunks(client, fromBlock, (from, to) =>
    client.getLogs({
      address: addr,
      event: stakedEvent,
      fromBlock: from,
      toBlock: to,
    }),
  );

  const a = new Set<string>();
  const b = new Set<string>();
  const all = new Set<string>();

  for (const log of logs) {
    const user = (log.args.user ?? "0x") as string;
    const pool = Number(log.args.pool ?? 0);
    const key = user.toLowerCase();
    all.add(key);
    if (pool === 1) b.add(key);
    else a.add(key);
  }

  return { total: all.size, poolA: a.size, poolB: b.size };
}
