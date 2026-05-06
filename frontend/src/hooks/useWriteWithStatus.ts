"use client";

import type { Hash } from "viem";

import { useTransactionFlow, type ExecuteTxOpts, type UseTransactionFlowOptions } from "@/hooks/useTransactionFlow";

/**
 * 兼容层：等价于 `useTransactionFlow` 的 `executeWrite`（非 ERC20 approve 专用路径）。
 */
export function useWriteWithStatus(options?: UseTransactionFlowOptions) {
  const flow = useTransactionFlow(options);

  const execute = (opts: ExecuteTxOpts, send: () => Promise<Hash>) => flow.executeWrite(opts, send);

  return {
    phase: flow.state,
    state: flow.state,
    hash: flow.txHash,
    txHash: flow.txHash,
    error: flow.error,
    reset: flow.reset,
    execute,
    executeWrite: flow.executeWrite,
    executeApprove: flow.executeApprove,
  };
}
