"use client";

import { useCallback, useMemo } from "react";
import type { Hash } from "viem";
import { useChainId, usePublicClient } from "wagmi";

import { buildTxItem, runTransactionPipeline } from "@/lib/executeTransaction";
import { type TxItem, useTxStore } from "@/store/useTxStore";

export type StartTransactionConfig = {
  type: string;
  title: string;
  description?: string;
  metadata?: TxItem["metadata"];
  execute: () => Promise<Hash>;
  /** 链上确认后触发（刷新余额 / 池子 / timelock 等） */
  onConfirmed?: () => void | Promise<unknown>;
};

/**
 * 全局 Transaction Center：入队 + 执行管道，支持多笔并发（每笔独立 id）。
 */
export function useTxCenter() {
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const txs = useTxStore((s) => s.txs);
  const filterType = useTxStore((s) => s.filterType);
  const panelOpen = useTxStore((s) => s.panelOpen);
  const setPanelOpen = useTxStore((s) => s.setPanelOpen);
  const togglePanel = useTxStore((s) => s.togglePanel);
  const setFilterType = useTxStore((s) => s.setFilterType);
  const clearFinishedTx = useTxStore((s) => s.clearFinishedTx);
  const removeTx = useTxStore((s) => s.removeTx);
  const getPendingTxs = useTxStore((s) => s.getPendingTxs);

  const startTransaction = useCallback(
    async (config: StartTransactionConfig): Promise<Hash> => {
      const item = buildTxItem({
        type: config.type,
        title: config.title,
        description: config.description,
        metadata: config.metadata,
        chainId,
      });
      useTxStore.getState().addTx(item);
      return runTransactionPipeline(item.id, config.execute, {
        publicClient,
        chainId,
        onAfterConfirmed: config.onConfirmed,
      });
    },
    [chainId, publicClient],
  );

  const getTxById = useCallback((id: string) => useTxStore.getState().txs.find((t) => t.id === id), []);

  const pendingCount = useMemo(
    () => txs.filter((t) => t.status === "awaiting_signature" || t.status === "pending").length,
    [txs],
  );

  const filteredTxs = useMemo(() => {
    if (filterType === "all") return txs;
    return txs.filter((t) => t.type === filterType);
  }, [txs, filterType]);

  return {
    startTransaction,
    getTxById,
    txList: filteredTxs,
    rawTxList: txs,
    pendingCount,
    panelOpen,
    setPanelOpen,
    togglePanel,
    filterType,
    setFilterType,
    clearFinishedTx,
    removeTx,
    getPendingTxs,
  };
}
