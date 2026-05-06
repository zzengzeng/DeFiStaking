"use client";

import { useMemo } from "react";
import type { Hash } from "viem";
import { useChainId } from "wagmi";

import { getTxExplorerUrl } from "@/lib/explorerLink";

export { getTxExplorerUrl } from "@/lib/explorerLink";

export function useExplorerLink(hash?: Hash | null) {
  const chainId = useChainId();
  return useMemo(() => {
    if (!hash) return null;
    return getTxExplorerUrl(chainId, hash);
  }, [chainId, hash]);
}
