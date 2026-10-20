"use client";

import { useMemo, useState } from "react";
import type { Address, Hash } from "viem";
import { formatUnits, parseUnits } from "viem";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";

import { ApprovalGate } from "@/components/ApprovalGate";
import { NetworkFeeHint } from "@/components/NetworkFeeHint";
import { TokenLabel } from "@/components/TokenLabel";
import { TransactionButton } from "@/components/TransactionButton";
import { UsdSubtext } from "@/components/UsdSubtext";
import { useApproveIfNeeded } from "@/hooks/useApproveIfNeeded";
import { useStakeApprovalTransaction } from "@/hooks/useTransactionFlow";
import type { StakeTxConfig } from "@/components/StakeCard";
import { formatToken, safeNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { estAprPercent } from "@/lib/poolMetrics";
import type { TxState } from "@/lib/txFlowTypes";

const ZERO = "0x0000000000000000000000000000000000000000" as Address;

function trimTrailingZeros(raw: string): string {
  if (!raw.includes(".")) return raw;
  return raw.replace(/\.?0+$/, "") || "0";
}

type Props = {
  stakeToken: string;
  rewardToken: string;
  disabled?: boolean;
  balanceWei?: bigint;
  poolTvlWei?: bigint;
  rewardRateWei?: bigint;
  tx?: StakeTxConfig;
  tokenDecimals?: number;
  /** 嵌入操作卡内时去掉外层卡片 */
  embedded?: boolean;
  /** 紧凑布局：缩小输入框与间距 */
  compact?: boolean;
};

/**
 * 质押组件：大输入框、余额行、年化收益预览、全宽主按钮。
 */
export function LidoStakeWidget({
  stakeToken,
  rewardToken,
  disabled,
  balanceWei,
  poolTvlWei,
  rewardRateWei,
  tx,
  tokenDecimals = 18,
  embedded = false,
  compact = false,
}: Props) {
  const { isConnected } = useAccount();
  const { t } = useI18n();
  const [amount, setAmount] = useState("");

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
    if (parsedWei === null) return t("stake.invalidAmount");
    if (parsedWei <= 0n) return t("stake.amountPositive");
    if (balanceWei !== undefined && parsedWei > balanceWei) return t("stake.exceedsBalance");
    return null;
  }, [amount, parsedWei, balanceWei, t]);

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

  const estYearlyRewardsWei = useMemo(() => {
    if (parsedWei === null || parsedWei <= 0n || aprPercent === null) return null;
    return (parsedWei * BigInt(Math.round(aprPercent * 100))) / 10_000n;
  }, [parsedWei, aprPercent]);

  const onMax = () => {
    if (balanceWei === undefined || balanceWei <= 0n) return;
    setAmount(trimTrailingZeros(formatUnits(balanceWei, tokenDecimals)));
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
      /* toast */
    }
  };

  const txBusy = tx ? stakeFlow.busy : false;

  const body = (
    <>
      <div className="text-sm font-medium text-zinc-400">{t("stake.amount")}</div>

      <div className={compact ? "mt-2 rounded-xl border border-[var(--dp-border)] bg-[var(--dp-surface-raised)] p-3" : "mt-3 rounded-xl border border-[var(--dp-border)] bg-[var(--dp-surface-raised)] p-4"}>
        <div className="flex items-center gap-2">
          <TokenLabel symbol={stakeToken} size="sm" symbolClassName="text-sm text-[var(--dp-accent)]" />
        </div>
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
          placeholder="0.0"
          inputMode="decimal"
          autoComplete="off"
          disabled={Boolean(tx && txBusy) || !isConnected}
          className={
            compact
              ? "mt-2 w-full bg-transparent text-2xl font-bold tracking-tight text-zinc-50 outline-none placeholder:text-zinc-600 disabled:opacity-50"
              : "mt-3 w-full bg-transparent text-3xl font-bold tracking-tight text-zinc-50 outline-none placeholder:text-zinc-600 disabled:opacity-50 sm:text-4xl"
          }
        />
        {parsedWei !== null && parsedWei > 0n ? (
          <div className="mt-1 flex justify-end">
            <UsdSubtext amountWei={parsedWei} symbol={stakeToken} />
          </div>
        ) : null}
        {balanceWei !== undefined && isConnected ? (
          <div className="mt-2 flex items-center justify-between text-sm">
            <span className="text-zinc-500">
              {t("stake.balance", { amount: formatToken(balanceWei, tokenDecimals, 4), token: stakeToken })}
            </span>
            <button
              type="button"
              onClick={onMax}
              disabled={disabled || balanceWei <= 0n || Boolean(tx && txBusy)}
              className="font-semibold text-[var(--dp-accent)] hover:underline disabled:opacity-40"
            >
              {t("stake.max")}
            </button>
          </div>
        ) : null}
      </div>

      {aprPercent !== null ? (
        <div className={compact ? "mt-3 space-y-1.5 text-sm" : "mt-4 space-y-2 text-sm"}>
          <div className="flex justify-between text-zinc-400">
            <span>{t("stake.apr")}</span>
            <span className="font-semibold text-[var(--dp-accent)]">{safeNumber(aprPercent).toFixed(2)}%</span>
          </div>
          {estYearlyRewardsWei !== null && estYearlyRewardsWei > 0n ? (
            <div className="flex justify-between border-t border-[var(--dp-border)] pt-2 text-zinc-400">
              <span>{t("stake.estReward")}</span>
              <span className="font-medium text-zinc-200">
                ~{formatToken(estYearlyRewardsWei, 18, 4)} {rewardToken}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}

      {tx && parsedWei && parsedWei > 0n ? (
        <div className="mt-4">
          <ApprovalGate
            token={tx.tokenAddress}
            spender={tx.spenderAddress}
            requiredAmountWei={parsedWei}
            tokenDecimals={tokenDecimals}
            symbol={stakeToken}
          />
        </div>
      ) : null}

      <div className={compact ? "mt-4" : "mt-5"}>
        {!isConnected ? (
          <ConnectButton.Custom>
            {({ openConnectModal }) => (
              <button
                type="button"
                onClick={openConnectModal}
                className={compact ? "dp-button min-h-[48px] w-full rounded-xl text-sm" : "dp-button min-h-[52px] w-full rounded-xl text-base"}
              >
                {t("stake.connect")}
              </button>
            )}
          </ConnectButton.Custom>
        ) : tx ? (
          <TransactionButton
            flowState={displayState}
            needsApproval={needsApproval}
            idlePrimary="stake"
            disabled={disabled || Boolean(inputError) || !amount.trim()}
            onClick={() => void submitTx()}
            className={compact ? "dp-button min-h-[48px] w-full rounded-xl text-sm" : "dp-button min-h-[52px] w-full rounded-xl text-base"}
          />
        ) : null}
      </div>

      {inputError ? <p className="mt-2 text-xs text-red-400">{inputError}</p> : null}
      <NetworkFeeHint className={compact ? "mt-3" : "mt-4"} />
      {!compact ? (
        <p className="mt-3 text-center text-[11px] leading-relaxed text-zinc-600">
          {t("stake.aprNote")}
        </p>
      ) : null}
    </>
  );

  if (embedded) return body;
  return <div className="dp-card p-5 sm:p-6">{body}</div>;
}
