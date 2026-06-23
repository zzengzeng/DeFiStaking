"use client";

import { useCallback, useMemo, useState } from "react";
import type { Hash } from "viem";

import { useTxCenter } from "@/hooks/useTxCenter";
import { CatchUpBlockedError, CatchUpIncompleteError, usePoolCatchUpEnsurer } from "@/hooks/usePoolCatchUpEnsurer";
import { mapContractError } from "@/lib/errors";
import { useI18n } from "@/lib/i18n";
import { CATCH_UP_A, CATCH_UP_B, type PoolSide } from "@/lib/poolCatchUp";
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
  /** 写操作前自动 permissionless crank，补齐全局计息（M-2 长空闲） */
  catchUpPools?: readonly PoolSide[];
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
  catchUpPools?: readonly PoolSide[];
};

export type UseTransactionFlowOptions = {
  syncGlobal?: boolean;
};

/**
 * 本地按钮状态 + 全局 Tx Center（Zustand 持久化队列、多笔并发）。
 * 失败时 error 字段为 mapContractError 结果，可直接展示。
 */
export function useTransactionFlow(_options: UseTransactionFlowOptions = {}) {
  const { t } = useI18n();
  const { startTransaction } = useTxCenter();
  const { ensureCatchUp } = usePoolCatchUpEnsurer();
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
        const msg = mapContractError(e, t);
        setError(msg);
        setState("failed");
        throw e;
      }
    },
    [startTransaction, t],
  );

  const mapFlowError = useCallback(
    (e: unknown) => {
      if (e instanceof CatchUpBlockedError || e instanceof CatchUpIncompleteError) return e.message;
      return mapContractError(e, t);
    },
    [t],
  );

  const executeWrite = useCallback(
    async (opts: ExecuteTxOpts, send: () => Promise<Hash>): Promise<Hash> => {
      setError(undefined);
      setTxHash(undefined);
      try {
        if (opts.catchUpPools?.length) {
          setState("catch_up");
          await ensureCatchUp(opts.catchUpPools);
        }
        setState("awaiting_signature");
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
        const msg = mapFlowError(e);
        setError(msg);
        setState("failed");
        throw e;
      }
    },
    [ensureCatchUp, mapFlowError, startTransaction],
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
  const { t } = useI18n();
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
              actionLabel: t("txCenter.approveStakeToken"),
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
            actionLabel: t("txCenter.typeStake"),
            txType: "stake",
            metadata: md,
            onConfirmed: () => cfg.invalidate(),
            catchUpPools:
              cfg.catchUpPools ??
              (cfg.txMeta?.pool === "A" ? CATCH_UP_A : cfg.txMeta?.pool === "B" ? CATCH_UP_B : undefined),
          },
          () => cfg.stake(cfg.humanAmount),
        );
        flow.reset();
      } finally {
        setFlowLock(false);
      }
    },
    [flow, t],
  );

  const busy = useMemo(() => flowLock || isTxBusy(flow.state), [flow.state, flowLock]);

  return {
    ...flow,
    busy,
    runStakeFlow,
  };
}

export const useStakeApprovalTransaction = useStakeWithApprovalFlow;
