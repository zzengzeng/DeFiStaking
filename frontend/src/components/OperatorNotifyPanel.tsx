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
import { useWriteWithStatus } from "@/hooks/useWriteWithStatus";

import { OperatorNotifyRewardHistory } from "@/components/OperatorNotifyRewardHistory";

const STAKING = contractAddresses.staking;
const TOKEN_B = contractAddresses.tokenB;

const MIN_DURATION = 86_400n;
const MAX_DURATION = 31_536_000n;

type Props = {
  pool: "A" | "B";
  /** notify 成功后刷新池子与余额 */
  invalidate: () => Promise<void>;
};

/** 运营（OPERATOR_ROLE）注资奖励：approve(TokenB→staking) + notifyRewardAmountA/B */
export function OperatorNotifyPanel({ pool, invalidate }: Props) {
  const queryClient = useQueryClient();
  const { address } = useAccount();
  const { isOperator, isLoading: rolesLoading } = useProtocolRoles();
  const { writeContractAsync } = useWriteContract();
  const flow = useWriteWithStatus();

  const [amount, setAmount] = useState("");
  const [durationSec, setDurationSec] = useState("604800");
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const allowance = useApproveIfNeeded({ token: TOKEN_B, spender: STAKING });

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
    if (!amount.trim()) return "请输入 TokenB 数量";
    if (parsedAmountWei === null) return "数量格式无效";
    if (parsedAmountWei <= 0n) return "数量必须大于 0";
    if (parsedDuration === null) return "周期（秒）必须是整数";
    if (parsedDuration < MIN_DURATION || parsedDuration > MAX_DURATION) {
      return `周期必须在 ${MIN_DURATION.toString()}～${MAX_DURATION.toString()} 秒之间`;
    }
    return null;
  }, [submitAttempted, amount, parsedAmountWei, parsedDuration]);

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
      address: TOKEN_B,
      functionName: "approve",
      args: [STAKING, amountWei],
      account: address,
    });

  const writeNotify = () => {
    if (!address || parsedAmountWei === null || parsedDuration === null) {
      throw new Error("Missing params");
    }
    const fn = pool === "A" ? "notifyRewardAmountA" : "notifyRewardAmountB";
    return writeContractAsync({
      abi: dualPoolStakingAbi,
      address: STAKING,
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
            actionLabel: `Approve TokenB (notify Pool ${pool})`,
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
          actionLabel: `Notify rewards (Pool ${pool})`,
          txType: "notify",
          metadata: { pool, token: "TokenB", amount: amount.trim(), durationSec: durationSec.trim() },
          onConfirmed: () => {
            void invalidate();
            void queryClient.invalidateQueries({ queryKey: ["notify-reward-logs"] });
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
          actionLabel: "Enable Emergency Mode",
          txType: "emergency",
          metadata: { pool, token: "TokenB" },
          onConfirmed: () => void invalidate(),
        },
        () =>
          writeContractAsync({
            abi: dualPoolStakingAbi,
            address: STAKING,
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
    <div className="min-w-0 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3 sm:p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-amber-200 sm:text-base">Operator · Notify rewards</h3>
        <p className="text-xs text-amber-200/80">Pool {pool} · pays TokenB</p>
      </div>
      <p className="mt-2 text-xs text-zinc-400">
        需要钱包具备 <span className="font-mono text-zinc-300">OPERATOR_ROLE</span>；奖励从钱包转出{" "}
        <span className="font-mono text-zinc-300">TokenB</span> 到合约，请先确保余额充足并完成 approve。
      </p>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block text-xs text-zinc-400">
          Amount (TokenB)
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="1000"
            className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none ring-0 focus:border-amber-500/60"
          />
        </label>
        <label className="block text-xs text-zinc-400">
          Duration (seconds)
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
          { label: "7d", v: "604800" },
          { label: "30d", v: "2592000" },
          { label: "90d", v: "7776000" },
          { label: "365d", v: "31536000" },
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
        <p className="mt-2 text-xs text-amber-200/90">当前 allowance 不足：提交时会先自动 approve 再 notify。</p>
      ) : (
        <p className="mt-2 text-xs text-zinc-500">Allowance 已覆盖本次数量（仍会发起 notify）。</p>
      )}

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <button
          type="button"
          disabled={busy || !canSubmit}
          onClick={() => void runApproveThenNotify().catch(() => flow.reset({ closeGlobal: true }))}
          className="min-h-[44px] w-full rounded-lg bg-amber-400 px-3 py-2 text-sm font-medium text-black disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
        >
          {busy ? "Pending…" : needsApproval ? "Approve + Notify" : "Notify"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void runEnableEmergencyMode().catch(() => flow.reset({ closeGlobal: true }))}
          className="min-h-[44px] w-full rounded-lg bg-red-400 px-3 py-2 text-sm font-medium text-black disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
        >
          {busy ? "Pending…" : "Enable Emergency Mode"}
        </button>
      </div>

      <OperatorNotifyRewardHistory />
    </div>
  );
}
