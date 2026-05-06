"use client";

import { useQuery } from "@tanstack/react-query";
import { useChainId, usePublicClient } from "wagmi";

import { contractAddresses, sepoliaDeploymentMeta } from "@/contracts/addresses";
import { fetchNotifyRewardLogs } from "@/lib/notifyRewardLogQuery";
import type { IndexedNotifyReward } from "@/types/notifyRewardLog";

/** 运营 notify 注资链上记录（浏览器 `publicClient.getLogs`，与钱包同源 RPC）。 */
export function useNotifyRewardLogs(enabled = true) {
  const chainId = useChainId();
  const publicClient = usePublicClient();

  return useQuery({
    queryKey: ["notify-reward-logs", chainId, contractAddresses.staking],
    queryFn: async (): Promise<{ entries: IndexedNotifyReward[]; error?: string }> => {
      if (!publicClient) return { entries: [] };
      const defaultFromBlock =
        chainId === sepoliaDeploymentMeta.chainId ? String(sepoliaDeploymentMeta.stakingDeployBlock) : "0";
      const fromBlock = BigInt(process.env.NEXT_PUBLIC_STAKING_DEPLOY_BLOCK ?? defaultFromBlock);
      try {
        const entries = await fetchNotifyRewardLogs(publicClient, contractAddresses.staking, fromBlock);
        return { entries };
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        return { entries: [], error: msg };
      }
    },
    enabled: Boolean(publicClient) && enabled,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}
