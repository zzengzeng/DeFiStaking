"use client";

import { useQuery } from "@tanstack/react-query";
import { useChainId } from "wagmi";

export type TimelockIndexedOp = {
  opId: `0x${string}`;
  paramsHash: `0x${string}`;
  executeAfter: string;
  executedAt?: string;
  cancelledAt?: string;
  state: "CREATED" | "READY" | "EXECUTED" | "CANCELLED";
  createdBlock: string;
  /** API 附加：可读函数名 */
  functionLabel?: string;
  /** API 附加：参数摘要（链下未知具体 ABI 参数时用 paramsHash 缩写） */
  paramsDisplay?: string;
};

/** 通过后端索引服务获取完整 timelock 操作列表。 */
export function useTimelockOps() {
  const chainId = useChainId();
  return useQuery({
    queryKey: ["timelock-ops", chainId],
    queryFn: async () => {
      const res = await fetch(`/api/timelock-ops?chainId=${chainId}`);
      if (!res.ok) throw new Error("Failed to fetch timelock ops");
      const data = (await res.json()) as { ops: TimelockIndexedOp[] };
      return data.ops;
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}
