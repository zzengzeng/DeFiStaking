"use client";

import { useState } from "react";
import { useAccount } from "wagmi";

import { ConfirmActionModal } from "@/components/ConfirmActionModal";
import { OperatorNotifyPanel } from "@/components/OperatorNotifyPanel";
import { PoolHeaderStats } from "@/components/PoolHeaderStats";
import { StakeCard } from "@/components/StakeCard";
import { contractAddresses } from "@/contracts/addresses";
import { usePoolA } from "@/hooks/usePoolA";
import { usePoolAStakeSince } from "@/hooks/usePoolAStakeSince";
import { useWriteWithStatus } from "@/hooks/useWriteWithStatus";
import { formatToken } from "@/lib/format";
import { formatCountdownHms } from "@/lib/timelockCountdown";

export default function PoolAPage() {
  const { address } = useAccount();
  const pool = usePoolA();
  const flow = useWriteWithStatus();
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [emergencyOpen, setEmergencyOpen] = useState(false);

  const tvlA = pool.poolA?.totalStaked ?? 0n;
  const rrA = pool.poolA?.rewardRate ?? 0n;
  const userStakeA = pool.userA?.[0] ?? 0n;
  const pendingA = pool.userA?.[1] ?? 0n;
  const { data: stakeSinceTs } = usePoolAStakeSince(userStakeA);
  const busy = flow.state !== "idle";

  const runWithdraw = async () => {
    await flow.executeWrite(
      {
        actionLabel: "Withdraw Pool A",
        txType: "withdraw",
        metadata: { pool: "A", token: "TokenA", amount: "1" },
        onConfirmed: () => pool.refetchWalletAndPool(),
      },
      () => pool.writeWithdrawA("1"),
    );
    flow.reset({ closeGlobal: true });
  };

  const runClaim = async () => {
    await flow.executeWrite(
      {
        actionLabel: "Claim Pool A",
        txType: "claim",
        metadata: { pool: "A", token: "TokenB" },
        onConfirmed: () => pool.refetchWalletAndPool(),
      },
      () => pool.writeClaimA(),
    );
    flow.reset({ closeGlobal: true });
  };

  const runEmergencyA = async () => {
    await flow.executeWrite(
      {
        actionLabel: "Emergency withdraw (Pool A)",
        txType: "emergency",
        metadata: { pool: "A", token: "TokenA" },
        onConfirmed: () => pool.refetchWalletAndPool(),
      },
      () => pool.writeEmergencyWithdrawA(),
    );
    flow.reset({ closeGlobal: true });
  };

  const cooldownLabel =
    pool.claimCooldownRemainingSec > 0n ? formatCountdownHms(Number(pool.claimCooldownRemainingSec)) : null;
  const stakeDurationLabel = (() => {
    if (!stakeSinceTs || userStakeA <= 0n) return null;
    const delta = Math.max(0, Math.floor(Date.now() / 1000) - stakeSinceTs);
    const days = Math.floor(delta / 86400);
    const hours = Math.floor((delta % 86400) / 3600);
    const mins = Math.floor((delta % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h ${mins}m`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  })();

  return (
    <div className="min-w-0 space-y-4 sm:space-y-5">
      <h1 className="text-lg font-semibold text-zinc-100 sm:text-xl">Pool A</h1>

      <PoolHeaderStats
        poolLabel="Pool A metrics"
        tokenSymbol="TokenA"
        totalStakedWei={tvlA}
        rewardRateWei={rrA}
        userStakedWei={userStakeA}
        walletConnected={Boolean(address)}
      />

      <OperatorNotifyPanel pool="A" invalidate={() => pool.refetchWalletAndPool()} />

      <ConfirmActionModal
        open={emergencyOpen}
        title="Emergency withdraw (Pool A)"
        variant="danger"
        rows={[
          { label: "Principal returned (est.)", value: `${formatToken(userStakeA)} TokenA` },
          { label: "Rewards forfeited (est.)", value: `${formatToken(pendingA)} TokenB` },
        ]}
        warning="You will lose all unclaimed rewards. This action is irreversible on-chain."
        confirmText="Emergency withdraw"
        busy={busy}
        onClose={() => !busy && setEmergencyOpen(false)}
        onConfirm={async () => {
          try {
            await runEmergencyA();
            setEmergencyOpen(false);
          } catch {
            /* flow + toast */
          }
        }}
      />

      <ConfirmActionModal
        open={withdrawOpen}
        title="Confirm withdraw (Pool A)"
        rows={[
          { label: "Amount", value: "1 TokenA" },
          { label: "Your staked", value: `${formatToken(userStakeA)} TokenA` },
        ]}
        warning="This submits an on-chain withdrawal. Verify amount and gas before confirming."
        confirmText="Submit withdrawal"
        busy={busy}
        onClose={() => !busy && setWithdrawOpen(false)}
        onConfirm={async () => {
          await runWithdraw();
          setWithdrawOpen(false);
        }}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <StakeCard
          title="Stake TokenA"
          hint="No lock, penalty, or withdrawal fee on Pool A."
          disabled={!pool.canStake}
          balanceWei={pool.tokenABalance}
          balanceSymbol="TokenA"
          poolTvlWei={tvlA}
          rewardRateWei={rrA}
          dailyRewardSymbol="TokenB"
          tx={{
            tokenAddress: contractAddresses.tokenA,
            spenderAddress: contractAddresses.staking,
            approve: pool.writeApproveTokenA,
            stake: pool.writeStakeA,
            invalidate: pool.refetchWalletAndPool,
            txMeta: { pool: "A", token: "TokenA" },
          }}
        />
        <div className="min-w-0 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-3 sm:p-4">
          <h3 className="text-lg font-semibold text-zinc-100">Position</h3>
          <p className="mt-2 text-sm text-zinc-400">
            Staked: <span className="font-mono text-zinc-200">{formatToken(pool.userA?.[0] ?? 0n)}</span> TokenA
          </p>
          <p className="text-sm text-zinc-400">
            Pending rewards: <span className="font-mono text-emerald-300/90">{formatToken(pendingA)}</span> TokenB
          </p>
          {stakeDurationLabel ? (
            <p className="text-sm text-zinc-400">
              Staking duration: <span className="font-mono text-zinc-200">{stakeDurationLabel}</span>
            </p>
          ) : null}
          <p className="text-sm text-zinc-400">
            Reward paid (lifetime): <span className="font-mono text-zinc-500">{formatToken(pool.userA?.[2] ?? 0n)}</span>
          </p>
          {cooldownLabel ? (
            <p className="mt-2 text-xs text-amber-200/90">Claim cooldown: {cooldownLabel} remaining</p>
          ) : null}
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <button
              type="button"
              onClick={() => setWithdrawOpen(true)}
              disabled={!pool.canWithdraw || busy}
              className="min-h-[44px] w-full rounded-lg bg-amber-400 px-3 py-2 text-sm text-black disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
            >
              Withdraw 1
            </button>
            <button
              type="button"
              onClick={() => void runClaim()}
              disabled={!pool.canClaim || busy}
              className="min-h-[44px] w-full rounded-lg bg-emerald-400 px-3 py-2 text-sm text-black disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
            >
              {busy ? "Pending…" : "Claim"}
            </button>
            <button
              type="button"
              onClick={() => setEmergencyOpen(true)}
              disabled={!pool.canEmergencyWithdraw || busy}
              className="min-h-[44px] w-full rounded-lg bg-red-400 px-3 py-2 text-sm text-black disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
            >
              Emergency Withdraw
            </button>
          </div>
          {pool.claimDisabledReason ? (
            <p className="mt-2 text-xs text-zinc-500">Claim unavailable: {pool.claimDisabledReason}</p>
          ) : null}
          {pool.emergencyDisabledReason ? (
            <p className="text-xs text-zinc-500">Emergency withdraw unavailable: {pool.emergencyDisabledReason}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
