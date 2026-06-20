"use client";

import { useCallback, useState } from "react";
import { useAccount } from "wagmi";

import { ConfirmActionModal } from "@/components/ConfirmActionModal";
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
import { usePoolA } from "@/hooks/usePoolA";
import { usePoolAStakeSince } from "@/hooks/usePoolAStakeSince";
import { useWriteWithStatus } from "@/hooks/useWriteWithStatus";
import { CONSOLE_COPY } from "@/lib/consoleCopy";
import { formatToken } from "@/lib/format";
import { formatCountdownHms } from "@/lib/timelockCountdown";

const computeWithdrawPreviewA = (amount: bigint) => ({
  netAmount: amount,
  feeAmount: 0n,
  penaltyAmount: 0n,
  feeBp: 0n,
  penaltyBp: 0n,
  isLocked: false,
});

function formatStakeDuration(stakeSinceTs: number | undefined, userStakeA: bigint) {
  if (!stakeSinceTs || userStakeA <= 0n) return null;
  const delta = Math.max(0, Math.floor(Date.now() / 1000) - stakeSinceTs);
  const days = Math.floor(delta / 86400);
  const hours = Math.floor((delta % 86400) / 3600);
  const mins = Math.floor((delta % 3600) / 60);
  if (days > 0) return `${days} 天 ${hours} 小时 ${mins} 分钟`;
  if (hours > 0) return `${hours} 小时 ${mins} 分钟`;
  return `${mins} 分钟`;
}

/** 控制台：灵活池完整合约交互视图 */
export function ConsolePoolAPage() {
  const { address, isConnecting } = useAccount();
  const pool = usePoolA();
  const flow = useWriteWithStatus();
  const [emergencyOpen, setEmergencyOpen] = useState(false);

  const loading = pool.isLoading || isConnecting;
  const tvlA = pool.poolA?.totalStaked ?? 0n;
  const rrA = pool.poolA?.rewardRate ?? 0n;
  const userStakeA = pool.userA?.[0] ?? 0n;
  const pendingA = pool.userA?.[1] ?? 0n;
  const noPosition = Boolean(address) && !loading && userStakeA <= 0n;
  const { data: stakeSinceTs } = usePoolAStakeSince(userStakeA);
  const busy = flow.state !== "idle";

  const runWithdraw = useCallback(
    async (amt: string) => {
      await flow.executeWrite(
        {
          actionLabel: "赎回（灵活池）",
          txType: "withdraw",
          metadata: { pool: "A", token: "TokenA", amount: amt },
          onConfirmed: () => pool.refetchWalletAndPool(),
        },
        () => pool.writeWithdrawA(amt),
      );
      flow.reset({ closeGlobal: true });
    },
    [flow, pool],
  );

  const runClaim = async () => {
    await flow.executeWrite(
      {
        actionLabel: "领取（灵活池）",
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
        actionLabel: CONSOLE_COPY.poolA.emergencyTitle,
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
  const stakeDurationLabel = formatStakeDuration(stakeSinceTs ?? undefined, userStakeA);

  return (
    <div className="min-w-0 space-y-4 sm:space-y-5">
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4 sm:p-5">
        <div className="text-xs font-medium uppercase tracking-wide text-amber-200/80">{CONSOLE_COPY.poolA.eyebrow}</div>
        <h1 className="mt-2 font-mono text-xl font-semibold text-zinc-100 sm:text-2xl">{CONSOLE_COPY.poolA.title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-500">{CONSOLE_COPY.poolA.desc}</p>
      </section>

      <DeploymentMismatchAlert poolAStakingToken={pool.poolA?.stakingToken} poolBStakingToken={pool.poolB?.stakingToken} />

      <PoolHeaderStats
        variant="console"
        poolLabel={CONSOLE_COPY.poolA.metrics}
        tokenSymbol="TokenA"
        totalStakedWei={tvlA}
        rewardRateWei={rrA}
        userStakedWei={userStakeA}
        walletConnected={Boolean(address)}
      />

      <OperatorNotifyPanel pool="A" invalidate={() => pool.refetchWalletAndPool()} />

      <ConfirmActionModal
        open={emergencyOpen}
        title={CONSOLE_COPY.poolA.emergencyTitle}
        variant="danger"
        rows={[
          { label: CONSOLE_COPY.poolA.principalReturned, value: `${formatToken(userStakeA)} TokenA` },
          { label: CONSOLE_COPY.poolA.rewardsForfeited, value: `${formatToken(pendingA)} TokenB` },
        ]}
        warning={CONSOLE_COPY.poolA.emergencyWarning}
        confirmText={CONSOLE_COPY.poolA.emergencyConfirm}
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <StakeCard
          variant="console"
          title={CONSOLE_COPY.poolA.stakeTitle}
          hint={CONSOLE_COPY.poolA.stakeHint}
          disabled={!pool.canStake}
          balanceWei={pool.tokenABalance}
          balanceSymbol="TokenA"
          poolTvlWei={tvlA}
          rewardRateWei={rrA}
          dailyRewardSymbol="TokenB"
          tx={{
            tokenAddress: pool.stakingTokenA,
            spenderAddress: contractAddresses.staking,
            approve: pool.writeApproveTokenA,
            stake: pool.writeStakeA,
            invalidate: pool.refetchWalletAndPool,
            txMeta: { pool: "A", token: "TokenA" },
          }}
        />
        <WithdrawPanel
          title={CONSOLE_COPY.poolA.withdrawTitle}
          computePreview={computeWithdrawPreviewA}
          protocolStatus={pool.status}
          maxWithdrawWei={userStakeA}
          tokenSymbol="TokenA"
          maxTransferFeeBP={pool.maxTransferFeeBP}
          showFeeTiers={false}
          onWithdraw={(v) => runWithdraw(v)}
          disabled={!pool.canWithdraw || busy || userStakeA <= 0n}
        />
      </div>

      <div className="min-w-0 rounded-xl border border-zinc-800 bg-zinc-900/70 p-3 sm:p-4">
        <h3 className="font-mono text-lg font-semibold text-zinc-100">{CONSOLE_COPY.poolA.position}</h3>
        {!address && (
          <div className="mt-3">
            <ProductStateCard compact title={CONSOLE_COPY.common.walletNotConnected} description={CONSOLE_COPY.poolA.walletDesc} />
          </div>
        )}
        {address && loading ? (
          <div className="mt-3">
            <ProductSkeletonRows rows={2} />
          </div>
        ) : null}
        {address && !loading && noPosition && (
          <div className="mt-3">
            <ProductStateCard compact title={CONSOLE_COPY.common.noPosition} description={CONSOLE_COPY.poolA.noPositionDesc} />
          </div>
        )}
        {address && !loading && !noPosition && (
          <>
            <p className="mt-2 text-sm text-zinc-400">
              {CONSOLE_COPY.poolA.staked}: <span className="font-mono text-zinc-200">{formatToken(userStakeA)}</span> TokenA
            </p>
            <p className="text-sm text-zinc-400">
              {CONSOLE_COPY.poolA.pendingRewards}: <span className="font-mono text-emerald-300/90">{formatToken(pendingA)}</span> TokenB
            </p>
            {stakeDurationLabel ? (
              <p className="text-sm text-zinc-400">
                {CONSOLE_COPY.poolA.stakingDuration}: <span className="font-mono text-zinc-200">{stakeDurationLabel}</span>
              </p>
            ) : null}
            <p className="text-sm text-zinc-400">
              {CONSOLE_COPY.poolA.rewardPaidLifetime}: <span className="font-mono text-zinc-500">{formatToken(pool.userA?.[2] ?? 0n)}</span>
            </p>
          </>
        )}
        {cooldownLabel ? (
          <p className="mt-2 text-xs text-amber-200/90">
            {CONSOLE_COPY.poolA.claimCooldown}: {cooldownLabel}
          </p>
        ) : null}
        <FotClaimHint grossRewards={pendingA} maxTransferFeeBP={pool.maxTransferFeeBP} />
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <ConsoleButton fullWidth disabled={!pool.canClaim || busy} onClick={() => void runClaim()}>
            {busy ? CONSOLE_COPY.common.pending : CONSOLE_COPY.common.claim}
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
        {pool.claimDisabledReason ? (
          <p className="mt-2 text-xs text-zinc-500">
            {CONSOLE_COPY.poolA.claimUnavailable}: {pool.claimDisabledReason}
          </p>
        ) : null}
        {pool.emergencyDisabledReason ? (
          <p className="text-xs text-zinc-500">
            {CONSOLE_COPY.poolA.emergencyUnavailable}: {pool.emergencyDisabledReason}
          </p>
        ) : null}
      </div>

      <ForceClaimAllButton onConfirmed={() => pool.refetchWalletAndPool()} />
    </div>
  );
}
