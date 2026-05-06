"use client";

import { useState } from "react";
import { useAccount } from "wagmi";

import { ConfirmActionModal } from "@/components/ConfirmActionModal";
import { LockProgress } from "@/components/LockProgress";
import { OperatorNotifyPanel } from "@/components/OperatorNotifyPanel";
import { PoolHeaderStats } from "@/components/PoolHeaderStats";
import { StakeCard } from "@/components/StakeCard";
import { WithdrawPanel } from "@/components/WithdrawPanel";
import { contractAddresses } from "@/contracts/addresses";
import { usePoolB } from "@/hooks/usePoolB";
import { useWriteWithStatus } from "@/hooks/useWriteWithStatus";
import { formatToken, formatTokenWithUsd } from "@/lib/format";
import { formatCountdownHms } from "@/lib/timelockCountdown";
import { MOCK_USD_PRICE_TOKEN_B } from "@/lib/usd";
import { parseUserInfoTuple } from "@/lib/userInfo";

function CardSkeleton() {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
      <div className="h-3 w-20 animate-pulse rounded bg-zinc-800" />
      <div className="mt-2 h-5 w-32 animate-pulse rounded bg-zinc-800" />
    </div>
  );
}

export default function PoolBPage() {
  const { address, isConnecting } = useAccount();
  const pool = usePoolB();
  const flow = useWriteWithStatus();
  const [compoundOpen, setCompoundOpen] = useState(false);
  const [emergencyOpen, setEmergencyOpen] = useState(false);

  const loading = pool.isLoading || isConnecting;
  const user = parseUserInfoTuple(pool.userB);
  const noPosition = Boolean(address) && !loading && user.staked === 0n;
  const tvlB = pool.poolB?.totalStaked ?? 0n;
  const rrB = pool.poolB?.rewardRate ?? 0n;
  const busy = flow.state !== "idle";

  const cooldownLabel =
    pool.claimCooldownRemainingSec > 0n ? formatCountdownHms(Number(pool.claimCooldownRemainingSec)) : null;

  const runWithdraw = async (amt: string) => {
    await flow.executeWrite(
      {
        actionLabel: "Withdraw Pool B",
        txType: "withdraw",
        metadata: { pool: "B", token: "TokenB", amount: amt },
        onConfirmed: () => pool.refetchWalletAndPool(),
      },
      () => pool.writeWithdrawB(amt),
    );
    flow.reset({ closeGlobal: true });
  };

  const runClaim = async () => {
    await flow.executeWrite(
      {
        actionLabel: "Claim Pool B",
        txType: "claim",
        metadata: { pool: "B", token: "TokenB" },
        onConfirmed: () => pool.refetchWalletAndPool(),
      },
      () => pool.writeClaimB(),
    );
    flow.reset({ closeGlobal: true });
  };

  const runCompound = async () => {
    await flow.executeWrite(
      {
        actionLabel: "Compound Pool B",
        txType: "compound",
        metadata: { pool: "B", token: "TokenB" },
        onConfirmed: () => pool.refetchWalletAndPool(),
      },
      () => pool.writeCompoundB(),
    );
    flow.reset({ closeGlobal: true });
  };

  const runEmergency = async () => {
    await flow.executeWrite(
      {
        actionLabel: "Emergency withdraw (Pool B)",
        txType: "emergency",
        metadata: { pool: "B", token: "TokenB" },
        onConfirmed: () => pool.refetchWalletAndPool(),
      },
      () => pool.writeEmergencyWithdrawB(),
    );
    flow.reset({ closeGlobal: true });
  };

  return (
    <div className="min-w-0 space-y-4 sm:space-y-5">
      <h1 className="text-lg font-semibold text-zinc-100 sm:text-xl">Pool B</h1>

      <PoolHeaderStats
        poolLabel="Pool B metrics"
        tokenSymbol="TokenB"
        totalStakedWei={tvlB}
        rewardRateWei={rrB}
        userStakedWei={user.staked}
        walletConnected={Boolean(address)}
      />

      <OperatorNotifyPanel pool="B" invalidate={() => pool.refetchWalletAndPool()} />

      <ConfirmActionModal
        open={compoundOpen}
        title="Confirm compound"
        rows={[
          { label: "Pending rewards (Pool A est.)", value: `${formatToken(pool.compoundPreview.rewardAWei)} TokenB` },
          { label: "Pending rewards (Pool B est.)", value: `${formatToken(pool.compoundPreview.rewardBWei)} TokenB` },
          { label: "Total compounded (est.)", value: `${formatToken(pool.compoundPreview.totalWei)} TokenB` },
        ]}
        warning="Compound executes an on-chain action; slippage / rounding may differ slightly from estimates."
        confirmText="Submit compound"
        busy={busy}
        onClose={() => !busy && setCompoundOpen(false)}
        onConfirm={async () => {
          await runCompound();
          setCompoundOpen(false);
        }}
      />

      <ConfirmActionModal
        open={emergencyOpen}
        title="Emergency withdraw (Pool B)"
        variant="danger"
        rows={[
          { label: "Principal returned (est.)", value: `${formatToken(user.staked)} TokenB` },
          { label: "Rewards forfeited (est.)", value: `${formatToken(user.rewards)} TokenB` },
        ]}
        warning="You will lose all unclaimed rewards. This action is irreversible on-chain."
        confirmText="Emergency withdraw"
        busy={busy}
        onClose={() => !busy && setEmergencyOpen(false)}
        onConfirm={async () => {
          await runEmergency();
          setEmergencyOpen(false);
        }}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <StakeCard
          title="Stake TokenB"
          hint="Lock schedule, fee tiers, early-exit penalty, and optional compound."
          disabled={!pool.canStake}
          balanceWei={pool.tokenBBalance}
          balanceSymbol="TokenB"
          poolTvlWei={tvlB}
          rewardRateWei={rrB}
          dailyRewardSymbol="TokenB"
          tx={{
            tokenAddress: contractAddresses.tokenB,
            spenderAddress: contractAddresses.staking,
            approve: pool.writeApproveTokenB,
            stake: pool.writeStakeB,
            invalidate: pool.refetchWalletAndPool,
            txMeta: { pool: "B", token: "TokenB" },
          }}
        />
        <WithdrawPanel
          title="Withdraw TokenB"
          computePreview={pool.computeWithdrawPreview}
          suggestion={{
            stakeTimestamp: pool.stakeTimestampB,
            unlockTime: pool.unlockTimeB,
            withdrawFeeBP: pool.withdrawFeeBP,
            midTermFeeBP: pool.midTermFeeBP,
            penaltyFeeBP: pool.penaltyfeeBP,
          }}
          protocolStatus={pool.status}
          maxWithdrawWei={user.staked}
          tokenSymbol="TokenB"
          onWithdraw={(v) => runWithdraw(v)}
          disabled={!pool.canWithdraw || busy}
        />
      </div>
      <div className="min-w-0 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-3 sm:p-4">
        <h3 className="text-lg font-semibold text-zinc-100">Your position</h3>
        {!address && <p className="mt-2 text-sm text-zinc-500">连接钱包以查看仓位。</p>}
        {address && loading && (
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <CardSkeleton />
            <CardSkeleton />
          </div>
        )}
        {address && !loading && noPosition && (
          <p className="mt-3 rounded-lg border border-dashed border-zinc-600 bg-zinc-950/50 px-3 py-6 text-center text-sm text-zinc-400">No position yet</p>
        )}
        {address && !loading && !noPosition && (
          <>
            <p className="mt-2 text-sm text-zinc-300">
              Staked: <span className="font-semibold">{formatTokenWithUsd(user.staked, "TokenB", MOCK_USD_PRICE_TOKEN_B)}</span>
            </p>
            <p className="text-sm text-zinc-300">
              Rewards: <span className="font-semibold text-emerald-300">{formatTokenWithUsd(user.rewards, "TokenB", MOCK_USD_PRICE_TOKEN_B)}</span>
            </p>
            <p className="text-sm text-zinc-400">unlockTime: {pool.unlockTimeB.toString()}</p>
            <p className="text-sm text-zinc-400">stakeTimestamp (WADP): {pool.stakeTimestampB.toString()}</p>
            <p className="text-sm text-zinc-400">lastClaimTime: {pool.lastClaimTime.toString()}</p>
          </>
        )}
        <div className="mt-3">
          <LockProgress stakeTimestamp={pool.stakeTimestampB} unlockTime={pool.unlockTimeB} />
        </div>
        {cooldownLabel ? (
          <p className="mt-2 text-xs text-amber-200/90">Claim cooldown: {cooldownLabel} remaining</p>
        ) : null}
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
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
            onClick={() => setCompoundOpen(true)}
            disabled={!pool.canCompound || busy}
            className="min-h-[44px] w-full rounded-lg bg-sky-400 px-3 py-2 text-sm text-black disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
          >
            Compound
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
      </div>
    </div>
  );
}
