"use client";

import { useEffect } from "react";
import { useChainId } from "wagmi";

import { getTxActivityScopeKey } from "@/lib/txActivityScope";
import { useTxStore } from "@/store/useTxStore";

/** 链或质押合约地址变化时，重置 Activity 本地记录，避免与旧部署混显。 */
export function TxActivityScopeSync() {
  const chainId = useChainId();
  const scopeKey = getTxActivityScopeKey(chainId);
  const syncActivityScope = useTxStore((s) => s.syncActivityScope);

  useEffect(() => {
    syncActivityScope(scopeKey);
  }, [scopeKey, syncActivityScope]);

  return null;
}
