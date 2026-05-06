"use client";

import { useQuery } from "@tanstack/react-query";
import { parseAbiItem } from "viem";
import { useAccount, useChainId, usePublicClient } from "wagmi";

import { contractAddresses, sepoliaDeploymentMeta } from "@/contracts/addresses";

const stakedEvent = parseAbiItem("event Staked(address indexed user, uint256 amount, uint256 unlockTime, uint8 indexed pool)");

async function findFirstStakeBlock(
  publicClient: NonNullable<ReturnType<typeof usePublicClient>>,
  user: `0x${string}`,
  fromBlock: bigint,
): Promise<bigint | null> {
  const latest = await publicClient.getBlockNumber();
  try {
    const logs = await publicClient.getLogs({
      address: contractAddresses.staking,
      event: stakedEvent,
      args: { user, pool: 0 },
      fromBlock,
      toBlock: latest,
    });
    return logs.length > 0 ? logs[0].blockNumber ?? null : null;
  } catch {
    // 某些 RPC 对 getLogs 区块跨度有限制，退化为分片扫描。
    const step = 2000n;
    for (let start = fromBlock; start <= latest; start += step) {
      const end = start + step - 1n > latest ? latest : start + step - 1n;
      const logs = await publicClient.getLogs({
        address: contractAddresses.staking,
        event: stakedEvent,
        args: { user, pool: 0 },
        fromBlock: start,
        toBlock: end,
      });
      if (logs.length > 0) return logs[0].blockNumber ?? null;
    }
    return null;
  }
}

/** Pool A 当前地址首次质押时间（用于展示“已质押多久”）。 */
export function usePoolAStakeSince(activeStakeWei: bigint) {
  const publicClient = usePublicClient();
  const { address } = useAccount();
  const chainId = useChainId();

  return useQuery({
    queryKey: ["pool-a-stake-since", chainId, address, activeStakeWei.toString(), contractAddresses.staking],
    enabled: Boolean(publicClient && address && activeStakeWei > 0n),
    staleTime: 60_000,
    queryFn: async () => {
      if (!publicClient || !address || activeStakeWei <= 0n) return null;
      const fromBlock = chainId === sepoliaDeploymentMeta.chainId ? BigInt(sepoliaDeploymentMeta.stakingDeployBlock) : 0n;
      const firstStakeBlock = await findFirstStakeBlock(publicClient, address, fromBlock);
      if (!firstStakeBlock) return null;
      const blk = await publicClient.getBlock({ blockNumber: firstStakeBlock });
      return Number(blk.timestamp);
    },
  });
}

