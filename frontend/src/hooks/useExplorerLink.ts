"use client";

import { useMemo } from "react";
import type { Hash } from "viem";
import { useChainId } from "wagmi";

import { getTxExplorerUrl } from "@/lib/explorerLink";

export { getTxExplorerUrl } from "@/lib/explorerLink";

/** 当前链 + tx hash → Etherscan 类浏览器链接（无 hash 时返回 null）。 */
export function useExplorerLink(hash?: Hash | null) {
  const chainId = useChainId();
  return useMemo(() => {
    if (!hash) return null;
    return getTxExplorerUrl(chainId, hash);
  }, [chainId, hash]);
}
