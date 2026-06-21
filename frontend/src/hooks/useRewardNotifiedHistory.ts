"use client";

import { useQuery } from "@tanstack/react-query";
import { useChainId } from "wagmi";

import type { IndexedNotifyReward } from "@/types/notifyRewardLog";

/** 服务端索引的 RewardNotified 历史（`/api/notify-rewards`）；与 `useNotifyRewardLogs` 浏览器直扫互补。 */
export function useRewardNotifiedHistory(enabled = true) {
  const chainId = useChainId();
  return useQuery({
    queryKey: ["reward-notified-history", chainId],
    queryFn: async (): Promise<{ entries: IndexedNotifyReward[]; error?: string }> => {
      try {
        const res = await fetch(`/api/notify-rewards?chainId=${chainId}`, { cache: "no-store" });
        const json = (await res.json()) as { entries?: IndexedNotifyReward[]; error?: string };
        return { entries: json.entries ?? [], error: json.error };
      } catch (e) {
        return { entries: [], error: e instanceof Error ? e.message : "Unknown error" };
      }
    },
    enabled,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

