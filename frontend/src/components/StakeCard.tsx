"use client";

import { useMemo, useState } from "react";
import type { Address, Hash } from "viem";
import { formatUnits, parseUnits } from "viem";

import { ApprovalGate } from "@/components/ApprovalGate";
import { TransactionButton } from "@/components/TransactionButton";
import { TxExplorerLink } from "@/components/TxExplorerLink";
import { useApproveIfNeeded } from "@/hooks/useApproveIfNeeded";
import { useStakeApprovalTransaction } from "@/hooks/useTransactionFlow";
import { formatToken, safeNumber } from "@/lib/format";
import { estAprPercent } from "@/lib/poolMetrics";
import type { TxState } from "@/lib/txFlowTypes";

const ZERO = "0x0000000000000000000000000000000000000000" as Address;

export type StakeTxConfig = {
  tokenAddress: Address;
  spenderAddress: Address;
  approve: (amountWei: bigint) => Promise<Hash>;
  stake: (humanAmount: string) => Promise<Hash>;
  invalidate: () => Promise<void>;
  /** Tx Center 元数据（池 / 代币符号） */
  txMeta?: { pool: "A" | "B"; token: string };
};

type Props = {
  title: string;
  /** 未配置 `tx` 时使用的旧版质押回调 */
  onStake?: (value: string) => Promise<unknown>;
  /** 启用 approve + stake 生产级流程 */
  tx?: StakeTxConfig;
  disabled?: boolean;
  hint?: string;
  balanceWei?: bigint;
  balanceSymbol?: string;
  tokenDecimals?: number;
  poolTvlWei?: bigint;
  rewardRateWei?: bigint;
  dailyRewardSymbol?: string;
};

function trimTrailingZeros(raw: string): string {
  if (!raw.includes(".")) return raw;
  return raw.replace(/\.?0+$/, "") || "0";
}

/** 质押卡片：可选链上交易流（approve → stake）、APR 与按输入估算日收益 */
export function StakeCard({
  title,
  onStake,
  tx,
  disabled,
  hint,
  balanceWei,
  balanceSymbol = "Token",
  tokenDecimals = 18,
  poolTvlWei,
  rewardRateWei,
  dailyRewardSymbol = "TokenB",
}: Props) {
  const [amount, setAmount] = useState("");
  const [legacyPending, setLegacyPending] = useState(false);

  const allowance = useApproveIfNeeded({
    token: tx?.tokenAddress ?? ZERO,
    spender: tx?.spenderAddress ?? ZERO,
  });
  const stakeFlow = useStakeApprovalTransaction();

  const parsedWei = useMemo(() => {
    const t = amount.trim();
    if (!t || !/^\d*\.?\d*$/.test(t)) return null;
    try {
      return parseUnits(t, tokenDecimals);
    } catch {
      return null;
    }
  }, [amount, tokenDecimals]);

  const inputError = useMemo(() => {
    if (!amount.trim()) return null;
    if (parsedWei === null) return "Invalid amount";
    if (parsedWei <= 0n) return "Enter an amount greater than zero";
    if (balanceWei !== undefined && parsedWei > balanceWei) return "Exceeds wallet balance";
    return null;
  }, [amount, parsedWei, balanceWei]);

  const needsApproval = Boolean(tx && parsedWei && parsedWei > 0n && allowance.needsApproval(parsedWei));

  const displayState: TxState = useMemo(() => {
    if (!tx) return "idle";
    if (stakeFlow.state !== "idle") return stakeFlow.state;
    return needsApproval ? "needs_approval" : "idle";
  }, [tx, stakeFlow.state, needsApproval]);

  const aprPercent = useMemo(() => {
    if (rewardRateWei === undefined || poolTvlWei === undefined || poolTvlWei <= 0n) return null;
    return estAprPercent(rewardRateWei, poolTvlWei);
  }, [rewardRateWei, poolTvlWei]);

  const estDailyRewardsWei = useMemo(() => {
    if (parsedWei === null || parsedWei <= 0n) return null;
    if (!rewardRateWei || poolTvlWei === undefined || poolTvlWei <= 0n) return null;
    return (parsedWei * rewardRateWei) / poolTvlWei * 86_400n;
  }, [parsedWei, rewardRateWei, poolTvlWei]);

  const onMax = () => {
    if (balanceWei === undefined || balanceWei <= 0n) return;
    setAmount(trimTrailingZeros(formatUnits(balanceWei, tokenDecimals)));
  };

  const submitLegacy = async () => {
    if (!amount.trim() || disabled || inputError || !onStake) return;
    setLegacyPending(true);
    try {
      await onStake(amount.trim());
      setAmount("");
    } finally {
      setLegacyPending(false);
    }
  };

  const submitTx = async () => {
    if (!tx || !amount.trim() || disabled || inputError || !parsedWei) return;
    try {
      await stakeFlow.runStakeFlow({
        amountWei: parsedWei,
        needsApproval,
        refetchAllowance: allowance.refetchAllowance,
        approve: tx.approve,
        stake: tx.stake,
        humanAmount: amount.trim(),
        invalidate: tx.invalidate,
        txMeta: tx.txMeta,
      });
      setAmount("");
    } catch {
      /* toast / modal 已处理 */
    }
  };

  const showBalance = balanceWei !== undefined;
  const showPoolMetrics = rewardRateWei !== undefined && poolTvlWei !== undefined;
  const txBusy = tx ? stakeFlow.busy : legacyPending;

  return (
    <div className="min-w-0 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-3 sm:p-4">
      <h3 className="text-lg font-semibold text-zinc-100">{title}</h3>
      {hint ? <p className="mt-1 text-sm text-zinc-400">{hint}</p> : null}

      {showPoolMetrics && (
        <div className="mt-3 space-y-2 rounded-lg border border-zinc-800 bg-zinc-950/80 px-3 py-2.5 text-xs">
          <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between">
            <span className="text-zinc-500">Current rewardRate</span>
            <span className="break-all font-mono text-zinc-200">{formatToken(rewardRateWei, 18, 8)}</span>
          </div>
          <div className="flex flex-col gap-0.5 border-t border-zinc-800 pt-2 sm:flex-row sm:items-baseline sm:justify-between">
            <span className="text-zinc-500">Est. APR (linear)</span>
            <span className="font-semibold text-zinc-100">{aprPercent === null ? "—" : `${safeNumber(aprPercent).toFixed(2)}%`}</span>
          </div>
          <div className="flex flex-col gap-0.5 border-t border-zinc-800 pt-2 sm:flex-row sm:items-baseline sm:justify-between">
            <span className="text-zinc-500">Est. daily earnings (this stake)</span>
            <span className="text-right font-mono font-semibold text-emerald-300/95 sm:text-left">
              {estDailyRewardsWei === null ? "—" : `${formatToken(estDailyRewardsWei, 18, 6)} ${dailyRewardSymbol}/day`}
            </span>
          </div>
        </div>
      )}

      {showBalance && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-950/80 px-3 py-2 text-xs">
          <span className="text-zinc-500">Wallet balance</span>
          <span className="font-mono font-semibold text-zinc-100">
            {formatToken(balanceWei, tokenDecimals, 6)} {balanceSymbol}
          </span>
        </div>
      )}

      {tx && parsedWei && parsedWei > 0n ? (
        <ApprovalGate
          token={tx.tokenAddress}
          spender={tx.spenderAddress}
          requiredAmountWei={parsedWei}
          tokenDecimals={tokenDecimals}
          symbol={balanceSymbol}
        />
      ) : null}

      <div className="mt-3 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-stretch">
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
          placeholder="0.0"
          inputMode="decimal"
          autoComplete="off"
          disabled={Boolean(tx && txBusy)}
          className="min-h-[44px] min-w-0 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-500 disabled:opacity-50 sm:min-w-0 sm:flex-1"
        />
        <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-none sm:flex-row sm:items-stretch sm:gap-2">
          {showBalance && (
            <button
              type="button"
              onClick={onMax}
              disabled={disabled || balanceWei <= 0n || Boolean(tx && txBusy)}
              className="min-h-[44px] w-full shrink-0 rounded-lg border border-zinc-600 px-3 py-2 text-xs font-semibold text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto sm:min-w-[4.5rem]"
            >
              Max
            </button>
          )}
          {tx ? (
            <TransactionButton
              flowState={displayState}
              needsApproval={needsApproval}
              idlePrimary="Stake"
              disabled={disabled || Boolean(inputError) || !amount.trim()}
              onClick={() => void submitTx()}
              className="w-full sm:min-w-[7rem] sm:flex-1"
            />
          ) : (
            <button
              type="button"
              onClick={() => void submitLegacy()}
              disabled={disabled || legacyPending || Boolean(inputError) || !amount.trim()}
              className="min-h-[44px] w-full rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-black disabled:cursor-not-allowed disabled:opacity-40 sm:min-w-[7rem] sm:w-auto sm:flex-1"
            >
              {legacyPending ? "Pending..." : "Stake"}
            </button>
          )}
        </div>
      </div>

      {tx && stakeFlow.hash ? (
        <div className="mt-2 text-xs text-zinc-400">
          Last tx: <TxExplorerLink hash={stakeFlow.hash} className="text-sky-400 hover:underline" label="Explorer" />
        </div>
      ) : null}
      {tx && stakeFlow.error && stakeFlow.state === "failed" ? <p className="mt-2 text-xs text-red-300">{stakeFlow.error}</p> : null}
      {tx && displayState === "confirmed" ? <p className="mt-2 text-xs text-emerald-300">Transaction confirmed.</p> : null}

      {inputError && <p className="mt-2 text-xs text-red-300">{inputError}</p>}
    </div>
  );
}
