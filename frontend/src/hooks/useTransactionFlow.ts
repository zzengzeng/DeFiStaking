"use client";

import { useCallback, useMemo, useState } from "react";
import type { Hash } from "viem";

import { useTxCenter } from "@/hooks/useTxCenter";
import { mapContractError } from "@/lib/errors";
import type { TxState } from "@/lib/txFlowTypes";
import { isTxBusy } from "@/lib/txFlowTypes";
import type { TxItem } from "@/store/useTxStore";

export type ExecuteTxOpts = {
  actionLabel: string;
  /** Activity 分类与筛选 */
  txType?: string;
  metadata?: TxItem["metadata"];
  description?: string;
  sessionId?: string;
  /** 链上确认成功后刷新数据 */
  onConfirmed?: () => void | Promise<unknown>;
  /** @deprecated 已统一走 Tx Center，忽略 */
  syncGlobal?: boolean;
};

export type StakeTxFlowConfig = {
  amountWei: bigint;
  needsApproval: boolean;
  refetchAllowance: () => Promise<unknown>;
  approve: (amountWei: bigint) => Promise<Hash>;
  stake: (humanAmount: string) => Promise<Hash>;
  humanAmount: string;
  invalidate: () => Promise<unknown>;
  txMeta?: { pool: "A" | "B"; token: string };
};

export type UseTransactionFlowOptions = {
  syncGlobal?: boolean;
};

/**
 * 本地按钮状态 + 全局 Tx Center（Zustand 持久化队列、多笔并发）。
 */
export function useTransactionFlow(_options: UseTransactionFlowOptions = {}) {
  const { startTransaction } = useTxCenter();
  const [state, setState] = useState<TxState>("idle");
  const [txHash, setTxHash] = useState<Hash | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  const reset = useCallback((_opts?: { closeGlobal?: boolean }) => {
    setState("idle");
    setTxHash(undefined);
    setError(undefined);
  }, []);

  const metaFromOpts = (opts: ExecuteTxOpts) => opts.metadata;

  const executeApprove = useCallback(
    async (opts: ExecuteTxOpts, send: () => Promise<Hash>): Promise<Hash> => {
      setError(undefined);
      setTxHash(undefined);
      setState("approving");
      setState("awaiting_signature");
      try {
        const h = await startTransaction({
          type: opts.txType ?? "approve",
          title: opts.actionLabel,
          description: opts.description,
          metadata: metaFromOpts(opts),
          execute: send,
          onConfirmed: opts.onConfirmed,
        });
        setTxHash(h);
        setState("approval_confirmed");
        return h;
      } catch (e) {
        const msg = mapContractError(e);
        setError(msg);
        setState("failed");
        throw e;
      }
    },
    [startTransaction],
  );

  const executeWrite = useCallback(
    async (opts: ExecuteTxOpts, send: () => Promise<Hash>): Promise<Hash> => {
      setError(undefined);
      setTxHash(undefined);
      setState("awaiting_signature");
      try {
        const h = await startTransaction({
          type: opts.txType ?? "write",
          title: opts.actionLabel,
          description: opts.description,
          metadata: metaFromOpts(opts),
          execute: send,
          onConfirmed: opts.onConfirmed,
        });
        setTxHash(h);
        setState("confirmed");
        return h;
      } catch (e) {
        const msg = mapContractError(e);
        setError(msg);
        setState("failed");
        throw e;
      }
    },
    [startTransaction],
  );

  const isBusy = useMemo(() => isTxBusy(state), [state]);

  return {
    state,
    txHash,
    error,
    reset,
    executeApprove,
    executeWrite,
    isBusy,
    phase: state,
    hash: txHash,
  };
}

/** 质押：approve（如需）→ stake，两笔独立入队 Tx Center */
export function useStakeWithApprovalFlow(flowOptions?: UseTransactionFlowOptions) {
  const flow = useTransactionFlow(flowOptions);
  const [flowLock, setFlowLock] = useState(false);

  const runStakeFlow = useCallback(
    async (cfg: StakeTxFlowConfig) => {
      if (!cfg.amountWei || cfg.amountWei <= 0n) return;
      setFlowLock(true);
      const md = cfg.txMeta
        ? { pool: cfg.txMeta.pool, token: cfg.txMeta.token, amount: cfg.humanAmount }
        : { amount: cfg.humanAmount };

      try {
        if (cfg.needsApproval) {
          await flow.executeApprove(
            {
              actionLabel: "Approve staking token",
              txType: "approve",
              metadata: md,
              onConfirmed: () => cfg.refetchAllowance(),
            },
            () => cfg.approve(cfg.amountWei),
          );
          flow.reset();
        }

        await flow.executeWrite(
          {
            actionLabel: "Stake",
            txType: "stake",
            metadata: md,
            onConfirmed: () => cfg.invalidate(),
          },
          () => cfg.stake(cfg.humanAmount),
        );
        flow.reset();
      } finally {
        setFlowLock(false);
      }
    },
    [flow],
  );

  const busy = useMemo(() => flowLock || isTxBusy(flow.state), [flow.state, flowLock]);

  return {
    ...flow,
    busy,
    runStakeFlow,
  };
}

export const useStakeApprovalTransaction = useStakeWithApprovalFlow;
