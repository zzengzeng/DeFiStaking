"use client";

import { useState } from "react";
import { useAccount } from "wagmi";

import { ConfirmActionModal } from "@/components/ConfirmActionModal";
import { LockProgress } from "@/components/LockProgress";
import { OperatorNotifyPanel } from "@/components/OperatorNotifyPanel";
import { PoolHeaderStats } from "@/components/PoolHeaderStats";
import { ProductSkeletonRows, ProductStateCard } from "@/components/product/ProductStateCard";
import { ConsoleButton } from "@/components/console/ConsoleButton";
import { ForceClaimAllButton } from "@/components/ForceClaimAllButton";
import { StakeCard } from "@/components/StakeCard";
import { WithdrawPanel } from "@/components/WithdrawPanel";
import { DeploymentMismatchAlert } from "@/components/DeploymentMismatchAlert";
import { FotClaimHint } from "@/components/FotClaimHint";
import { contractAddresses } from "@/contracts/addresses";
import { usePoolB } from "@/hooks/usePoolB";
import { useWriteWithStatus } from "@/hooks/useWriteWithStatus";
import { CONSOLE_COPY } from "@/lib/consoleCopy";
import { formatToken, formatTokenDisplay } from "@/lib/format";
import { formatCountdownHms } from "@/lib/timelockCountdown";
import { parseUserInfoTuple } from "@/lib/userInfo";

/** 控制台：锁仓池完整合约交互视图 */
export function ConsolePoolBPage() {
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
        actionLabel: "赎回（锁仓池）",
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
        actionLabel: "领取（锁仓池）",
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
        actionLabel: CONSOLE_COPY.common.compound,
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
        actionLabel: CONSOLE_COPY.poolB.emergencyTitle,
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
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4 sm:p-5">
        <div className="text-xs font-medium uppercase tracking-wide text-amber-200/80">{CONSOLE_COPY.poolB.eyebrow}</div>
        <h1 className="mt-2 font-mono text-xl font-semibold text-zinc-100 sm:text-2xl">{CONSOLE_COPY.poolB.title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-500">{CONSOLE_COPY.poolB.desc}</p>
      </section>

      <DeploymentMismatchAlert poolAStakingToken={pool.poolA?.stakingToken} poolBStakingToken={pool.poolB?.stakingToken} />

      <PoolHeaderStats
        variant="console"
        poolLabel={CONSOLE_COPY.poolB.metrics}
        tokenSymbol="TokenB"
        totalStakedWei={tvlB}
        rewardRateWei={rrB}
        userStakedWei={user.staked}
        walletConnected={Boolean(address)}
      />

      <OperatorNotifyPanel pool="B" invalidate={() => pool.refetchWalletAndPool()} />

      <ConfirmActionModal
        open={compoundOpen}
        title={CONSOLE_COPY.poolB.compoundTitle}
        rows={[
          { label: CONSOLE_COPY.poolB.compoundPoolA, value: `${formatToken(pool.compoundPreview.rewardAWei)} TokenB` },
          { label: CONSOLE_COPY.poolB.compoundPoolB, value: `${formatToken(pool.compoundPreview.rewardBWei)} TokenB` },
          { label: CONSOLE_COPY.poolB.compoundTotal, value: `${formatToken(pool.compoundPreview.totalWei)} TokenB` },
        ]}
        warning={CONSOLE_COPY.poolB.compoundWarning}
        confirmText={CONSOLE_COPY.poolB.compoundConfirm}
        busy={busy}
        onClose={() => !busy && setCompoundOpen(false)}
        onConfirm={async () => {
          await runCompound();
          setCompoundOpen(false);
        }}
      />

      <ConfirmActionModal
        open={emergencyOpen}
        title={CONSOLE_COPY.poolB.emergencyTitle}
        variant="danger"
        rows={[
          { label: CONSOLE_COPY.poolB.principalReturned, value: `${formatToken(user.staked)} TokenB` },
          { label: CONSOLE_COPY.poolB.rewardsForfeited, value: `${formatToken(user.rewards)} TokenB` },
        ]}
        warning={CONSOLE_COPY.poolB.emergencyWarning}
        confirmText={CONSOLE_COPY.poolB.emergencyConfirm}
        busy={busy}
        onClose={() => !busy && setEmergencyOpen(false)}
        onConfirm={async () => {
          await runEmergency();
          setEmergencyOpen(false);
        }}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <StakeCard
          variant="console"
          title={CONSOLE_COPY.poolB.stakeTitle}
          hint={CONSOLE_COPY.poolB.stakeHint}
          disabled={!pool.canStake}
          balanceWei={pool.tokenBBalance}
          balanceSymbol="TokenB"
          poolTvlWei={tvlB}
          rewardRateWei={rrB}
          dailyRewardSymbol="TokenB"
          tx={{
            tokenAddress: pool.stakingTokenB,
            spenderAddress: contractAddresses.staking,
            approve: pool.writeApproveTokenB,
            stake: pool.writeStakeB,
            invalidate: pool.refetchWalletAndPool,
            txMeta: { pool: "B", token: "TokenB" },
          }}
        />
        <WithdrawPanel
          title={CONSOLE_COPY.poolB.withdrawTitle}
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
          maxTransferFeeBP={pool.maxTransferFeeBP}
          onWithdraw={(v) => runWithdraw(v)}
          disabled={!pool.canWithdraw || busy}
        />
      </div>

      <div className="min-w-0 rounded-xl border border-zinc-800 bg-zinc-900/70 p-3 sm:p-4">
        <h3 className="font-mono text-lg font-semibold text-zinc-100">{CONSOLE_COPY.poolB.position}</h3>
        {!address && (
          <div className="mt-3">
            <ProductStateCard compact title={CONSOLE_COPY.common.walletNotConnected} description={CONSOLE_COPY.poolB.walletDesc} />
          </div>
        )}
        {address && loading ? (
          <div className="mt-3">
            <ProductSkeletonRows rows={2} />
          </div>
        ) : null}
        {address && !loading && noPosition && (
          <div className="mt-3">
            <ProductStateCard compact title={CONSOLE_COPY.common.noPosition} description={CONSOLE_COPY.poolB.noPositionDesc} />
          </div>
        )}
        {address && !loading && !noPosition && (
          <>
            <p className="mt-2 text-sm text-zinc-300">
              {CONSOLE_COPY.poolB.staked}: <span className="font-semibold">{formatTokenDisplay(user.staked, "TokenB")}</span>
            </p>
            <p className="text-sm text-zinc-300">
              {CONSOLE_COPY.poolB.rewards}: <span className="font-semibold text-emerald-300">{formatTokenDisplay(user.rewards, "TokenB")}</span>
            </p>
            <p className="text-sm text-zinc-400">{CONSOLE_COPY.poolB.unlockTime}: {pool.unlockTimeB.toString()}</p>
            <p className="text-sm text-zinc-400">{CONSOLE_COPY.poolB.stakeTimestamp}: {pool.stakeTimestampB.toString()}</p>
            <p className="text-sm text-zinc-400">{CONSOLE_COPY.poolB.lastClaimTime}: {pool.lastClaimTime.toString()}</p>
          </>
        )}
        <div className="mt-3">
          <LockProgress stakeTimestamp={pool.stakeTimestampB} unlockTime={pool.unlockTimeB} />
        </div>
        {cooldownLabel ? (
          <p className="mt-2 text-xs text-amber-200/90">
            {CONSOLE_COPY.poolA.claimCooldown}: {cooldownLabel}
          </p>
        ) : null}
        <FotClaimHint grossRewards={user.rewards} maxTransferFeeBP={pool.maxTransferFeeBP} />
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <ConsoleButton fullWidth disabled={!pool.canClaim || busy} onClick={() => void runClaim()}>
            {busy ? CONSOLE_COPY.common.pending : CONSOLE_COPY.common.claim}
          </ConsoleButton>
          <ConsoleButton fullWidth disabled={!pool.canCompound || busy} onClick={() => setCompoundOpen(true)}>
            {CONSOLE_COPY.common.compound}
          </ConsoleButton>
          <ConsoleButton
            fullWidth
            variant="danger"
            disabled={!pool.canEmergencyWithdraw || busy}
            onClick={() => setEmergencyOpen(true)}
          >
            {CONSOLE_COPY.common.emergencyWithdraw}
          </ConsoleButton>
        </div>
      </div>

      <ForceClaimAllButton onConfirmed={() => pool.refetchWalletAndPool()} />
    </div>
  );
}
