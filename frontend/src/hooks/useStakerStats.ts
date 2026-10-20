"use client";

import { useQuery } from "@tanstack/react-query";
import { useChainId } from "wagmi";

import type { StakerStats } from "@/lib/stakerLogQuery";

/** 首页「质押人数」：服务端扫描 Staked 事件，经 `/api/stakers` 聚合。 */
export function useStakerStats(enabled = true) {
  const chainId = useChainId();

  return useQuery({
    queryKey: ["staker-stats", chainId],
    queryFn: async (): Promise<{ stats: StakerStats; error?: string }> => {
      try {
        const res = await fetch(`/api/stakers?chainId=${chainId}`, { cache: "no-store" });
        const json = (await res.json()) as { stats?: StakerStats; error?: string };
        return {
          stats: json.stats ?? { total: 0, poolA: 0, poolB: 0 },
          error: json.error,
        };
      } catch (e) {
        return { stats: { total: 0, poolA: 0, poolB: 0 }, error: e instanceof Error ? e.message : "Unknown error" };
      }
    },
    enabled,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

