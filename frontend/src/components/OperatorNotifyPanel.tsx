"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import type { Hash } from "viem";
import { parseUnits } from "viem";
import { useAccount, useWriteContract } from "wagmi";

import { dualPoolStakingAbi } from "@/contracts/abis/dualPoolStaking";
import { erc20Abi } from "@/contracts/abis/erc20";
import { contractAddresses } from "@/contracts/addresses";
import { useApproveIfNeeded } from "@/hooks/useApproveIfNeeded";
import { useProtocolRoles } from "@/hooks/useProtocolRoles";
import { useStaking } from "@/hooks/useStaking";
import { useWriteWithStatus } from "@/hooks/useWriteWithStatus";

import { ConsoleButton } from "@/components/console/ConsoleButton";
import { OperatorNotifyRewardHistory } from "@/components/OperatorNotifyRewardHistory";
import { useConsoleCopy } from "@/lib/consoleCopy";
import { CATCH_UP_A, CATCH_UP_B } from "@/lib/poolCatchUp";
import { useUiCopy } from "@/lib/uiCopy";

const MIN_DURATION = 86_400n;
const MAX_DURATION = 31_536_000n;

type Props = {
  pool: "A" | "B";
  /** notify 成功后刷新池子与余额 */
  invalidate: () => Promise<void>;
  /** 治理页已单独提供紧急模式按钮时设为 true */
  hideEmergency?: boolean;
  /** 紧凑布局（治理页双列） */
  compact?: boolean;
};

/** 运营（OPERATOR_ROLE）注资奖励：approve(TokenB→staking) + notifyRewardAmountA/B */
export function OperatorNotifyPanel({ pool, invalidate, hideEmergency = false, compact = false }: Props) {
  const copy = useConsoleCopy();
  const ui = useUiCopy();
  const queryClient = useQueryClient();
  const { address } = useAccount();
  const { poolB } = useStaking();
  const rewardToken = poolB?.stakingToken ?? contractAddresses.tokenB;
  const staking = contractAddresses.staking;
  const { isOperator, isLoading: rolesLoading } = useProtocolRoles();
  const { writeContractAsync } = useWriteContract();
  const flow = useWriteWithStatus();

  const [amount, setAmount] = useState("");
  const [durationSec, setDurationSec] = useState("604800");
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const allowance = useApproveIfNeeded({ token: rewardToken, spender: staking });

  const parsedAmountWei = useMemo(() => {
    const t = amount.trim();
    if (!t || !/^\d*\.?\d*$/.test(t)) return null;
    try {
      return parseUnits(t, 18);
    } catch {
      return null;
    }
  }, [amount]);

  const parsedDuration = useMemo(() => {
    const t = durationSec.trim();
    if (!/^\d+$/.test(t)) return null;
    try {
      return BigInt(t);
    } catch {
      return null;
    }
  }, [durationSec]);

  const inputError = useMemo(() => {
    if (!submitAttempted) return null;
    if (!amount.trim()) return copy.operator.errAmountRequired;
    if (parsedAmountWei === null) return copy.operator.errAmountInvalid;
    if (parsedAmountWei <= 0n) return copy.operator.errAmountPositive;
    if (parsedDuration === null) return copy.operator.errDurationInteger;
    if (parsedDuration < MIN_DURATION || parsedDuration > MAX_DURATION) {
      return copy.operator.errDurationRange(MIN_DURATION.toString(), MAX_DURATION.toString());
    }
    return null;
  }, [submitAttempted, amount, parsedAmountWei, parsedDuration, copy.operator]);

  const needsApproval = Boolean(parsedAmountWei && parsedAmountWei > 0n && allowance.needsApproval(parsedAmountWei));
  const busy = flow.state !== "idle";

  const canSubmit = useMemo(() => {
    if (!address) return false;
    if (allowance.isFetching) return false;
    if (parsedAmountWei === null || parsedAmountWei <= 0n) return false;
    if (parsedDuration === null) return false;
    if (parsedDuration < MIN_DURATION || parsedDuration > MAX_DURATION) return false;
    return true;
  }, [address, allowance.isFetching, parsedAmountWei, parsedDuration]);

  const writeApproveTokenB = (amountWei: bigint) =>
    writeContractAsync({
      abi: erc20Abi,
      address: rewardToken,
      functionName: "approve",
      args: [staking, amountWei],
      account: address,
    });

  const writeNotify = () => {
    if (!address || parsedAmountWei === null || parsedDuration === null) {
      throw new Error("Missing params");
    }
    const fn = pool === "A" ? "notifyRewardAmountA" : "notifyRewardAmountB";
    return writeContractAsync({
      abi: dualPoolStakingAbi,
      address: staking,
      functionName: fn,
      args: [parsedAmountWei, parsedDuration],
      account: address,
    });
  };

  const runApproveThenNotify = async () => {
    setSubmitAttempted(true);
    if (!address || !parsedAmountWei || !parsedDuration || inputError) return;
    try {
      if (needsApproval) {
        await flow.executeApprove(
          {
            actionLabel: ui.operator.approveNotify(pool),
            txType: "approve",
            metadata: { pool, token: "TokenB", amount: amount.trim(), durationSec: durationSec.trim() },
            onConfirmed: () => void allowance.refetchAllowance(),
          },
          () => writeApproveTokenB(parsedAmountWei),
        );
        flow.reset();
      }

      await flow.executeWrite(
        {
          actionLabel: ui.operator.notify(pool),
          txType: "notify",
          metadata: { pool, token: "TokenB", amount: amount.trim(), durationSec: durationSec.trim() },
          catchUpPools: pool === "A" ? CATCH_UP_A : CATCH_UP_B,
          onConfirmed: () => {
            void invalidate();
            void queryClient.invalidateQueries({ queryKey: ["notify-reward-logs"] });
            void queryClient.invalidateQueries({ queryKey: ["reward-notified-history"] });
          },
        },
        () => writeNotify() as Promise<Hash>,
      );
      flow.reset({ closeGlobal: true });
      setAmount("");
      setSubmitAttempted(false);
    } catch {
      flow.reset({ closeGlobal: true });
    }
  };

  const runEnableEmergencyMode = async () => {
    if (!address) return;
    try {
      await flow.executeWrite(
        {
          actionLabel: ui.operator.enableEmergency,
          txType: "emergency",
          metadata: { pool, token: "TokenB" },
          onConfirmed: () => void invalidate(),
        },
        () =>
          writeContractAsync({
            abi: dualPoolStakingAbi,
            address: staking,
            functionName: "enableEmergencyMode",
            account: address,
          }) as Promise<Hash>,
      );
      flow.reset({ closeGlobal: true });
    } catch {
      flow.reset({ closeGlobal: true });
    }
  };

  if (rolesLoading) return null;
  if (!isOperator) return null;

  return (
    <div
      className={
        compact
          ? "min-w-0 rounded-xl border border-amber-500/25 bg-amber-500/5 p-3"
          : "min-w-0 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3 sm:p-4"
      }
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-amber-200 sm:text-base">
          {compact ? copy.operator.titleCompact(pool) : copy.operator.title}
        </h3>
        <p className="text-xs text-amber-200/80">notifyRewardAmount{pool} · TokenB</p>
      </div>
      <p className="mt-2 text-xs text-zinc-400">
        {copy.operator.roleHintPrefix}
        <span className="font-mono text-zinc-300">OPERATOR_ROLE</span>
        {copy.operator.roleHintMiddle}
        <span className="font-mono text-zinc-300">TokenB</span>
        {copy.operator.roleHintSuffix}
      </p>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block text-xs text-zinc-400">
          {copy.operator.amountLabel}
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="1000"
            className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none ring-0 focus:border-amber-500/60"
          />
        </label>
        <label className="block text-xs text-zinc-400">
          {copy.operator.durationLabel}
          <input
            value={durationSec}
            onChange={(e) => setDurationSec(e.target.value)}
            inputMode="numeric"
            placeholder="604800"
            className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none ring-0 focus:border-amber-500/60"
          />
        </label>
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        {[
          { label: copy.operator.duration7d, v: "604800" },
          { label: copy.operator.duration30d, v: "2592000" },
          { label: copy.operator.duration90d, v: "7776000" },
          { label: copy.operator.duration365d, v: "31536000" },
        ].map((p) => (
          <button
            key={p.v}
            type="button"
            disabled={busy}
            onClick={() => setDurationSec(p.v)}
            className="rounded-full border border-zinc-800 bg-zinc-950 px-3 py-1 text-xs text-zinc-200 hover:border-amber-500/50 disabled:opacity-40"
          >
            {p.label}
          </button>
        ))}
      </div>

      {inputError ? <p className="mt-2 text-xs text-red-300/90">{inputError}</p> : null}
      {needsApproval ? (
        <p className="mt-2 text-xs text-amber-200/90">{copy.operator.approvalNeeded}</p>
      ) : (
        <p className="mt-2 text-xs text-zinc-500">{copy.operator.approvalSufficient}</p>
      )}

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <ConsoleButton
          fullWidth
          disabled={busy || !canSubmit}
          onClick={() => void runApproveThenNotify().catch(() => flow.reset({ closeGlobal: true }))}
        >
          {busy ? copy.common.pending : needsApproval ? copy.common.approveNotify : copy.common.notify}
        </ConsoleButton>
        {!hideEmergency ? (
          <ConsoleButton
            fullWidth
            variant="danger"
            disabled={busy}
            onClick={() => void runEnableEmergencyMode().catch(() => flow.reset({ closeGlobal: true }))}
          >
            {busy ? copy.common.pending : copy.common.enableEmergency}
          </ConsoleButton>
        ) : null}
      </div>

      {!compact ? <OperatorNotifyRewardHistory /> : null}
    </div>
  );
}
