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
import { useConsoleCopy } from "@/lib/consoleCopy";
import { formatToken } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { TranslateFn } from "@/lib/i18n";
import { formatCountdownHms } from "@/lib/timelockCountdown";

const computeWithdrawPreviewA = (amount: bigint) => ({
  netAmount: amount,
  feeAmount: 0n,
  penaltyAmount: 0n,
  feeBp: 0n,
  penaltyBp: 0n,
  isLocked: false,
});

function formatStakeDuration(t: TranslateFn, stakeSinceTs: number | undefined, userStakeA: bigint) {
  if (!stakeSinceTs || userStakeA <= 0n) return null;
  const delta = Math.max(0, Math.floor(Date.now() / 1000) - stakeSinceTs);
  const days = Math.floor(delta / 86400);
  const hours = Math.floor((delta % 86400) / 3600);
  const mins = Math.floor((delta % 3600) / 60);
  if (days > 0) return t("console.poolA.stakeDurationFull", { days, hours, mins });
  if (hours > 0) return t("console.poolA.stakeDurationHours", { hours, mins });
  return t("console.poolA.stakeDurationMins", { mins });
}

/**
 * 灵活池（Pool A）控制台：完整 stake/withdraw/claim/emergency + 原始 userInfo 字段。
 * 数据：`usePoolA`；写交易：`useWriteWithStatus`；文案：`useConsoleCopy` + `useI18n`。
 *
 * @see views/console/README.md
 */
export function ConsolePoolAPage() {
  const { t } = useI18n();
  const copy = useConsoleCopy();
  const { address, isConnecting } = useAccount();
  const pool = usePoolA();
  const flow = useWriteWithStatus();
  const [emergencyOpen, setEmergencyOpen] = useState(false);

  const loading = pool.isLoading || isConnecting;
  const tvlA = pool.poolA?.totalStaked ?? 0n;
  const rrA = pool.poolA?.rewardRate ?? 0n;
  const userStakeA = pool.userA?.[0] ?? 0n;
  const pendingA = pool.pendingRewardA;
  const noPosition = Boolean(address) && !loading && userStakeA <= 0n;
  const { data: stakeSinceTs } = usePoolAStakeSince(userStakeA);
  const busy = flow.state !== "idle";

  const runWithdraw = useCallback(
    async (amt: string) => {
      await flow.executeWrite(
        {
          actionLabel: copy.poolA.actionWithdraw,
          txType: "withdraw",
          metadata: { pool: "A", token: "TokenA", amount: amt },
          onConfirmed: () => pool.refetchWalletAndPool(),
        },
        () => pool.writeWithdrawA(amt),
      );
      flow.reset({ closeGlobal: true });
    },
    [copy.poolA.actionWithdraw, flow, pool],
  );

  const runClaim = async () => {
    await flow.executeWrite(
      {
        actionLabel: copy.poolA.actionClaim,
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
        actionLabel: copy.poolA.emergencyTitle,
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
  const stakeDurationLabel = formatStakeDuration(t, stakeSinceTs ?? undefined, userStakeA);

  return (
    <div className="min-w-0 space-y-4 sm:space-y-5">
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4 sm:p-5">
        <div className="text-xs font-medium uppercase tracking-wide text-amber-200/80">{copy.poolA.eyebrow}</div>
        <h1 className="mt-2 font-mono text-xl font-semibold text-zinc-100 sm:text-2xl">{copy.poolA.title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-500">{copy.poolA.desc}</p>
      </section>

      <DeploymentMismatchAlert poolAStakingToken={pool.poolA?.stakingToken} poolBStakingToken={pool.poolB?.stakingToken} />

      <PoolHeaderStats
        variant="console"
        poolLabel={copy.poolA.metrics}
        tokenSymbol="TokenA"
        totalStakedWei={tvlA}
        rewardRateWei={rrA}
        userStakedWei={userStakeA}
        walletConnected={Boolean(address)}
      />

      <OperatorNotifyPanel pool="A" invalidate={() => pool.refetchWalletAndPool()} />

      <ConfirmActionModal
        open={emergencyOpen}
        title={copy.poolA.emergencyTitle}
        variant="danger"
        rows={[
          { label: copy.poolA.principalReturned, value: `${formatToken(userStakeA)} TokenA` },
          { label: copy.poolA.rewardsForfeited, value: `${formatToken(pendingA)} TokenB` },
        ]}
        warning={copy.poolA.emergencyWarning}
        confirmText={copy.poolA.emergencyConfirm}
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
          title={copy.poolA.stakeTitle}
          hint={copy.poolA.stakeHint}
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
          title={copy.poolA.withdrawTitle}
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
        <h3 className="font-mono text-lg font-semibold text-zinc-100">{copy.poolA.position}</h3>
        {!address && (
          <div className="mt-3">
            <ProductStateCard compact title={copy.common.walletNotConnected} description={copy.poolA.walletDesc} />
          </div>
        )}
        {address && loading ? (
          <div className="mt-3">
            <ProductSkeletonRows rows={2} />
          </div>
        ) : null}
        {address && !loading && noPosition && (
          <div className="mt-3">
            <ProductStateCard compact title={copy.common.noPosition} description={copy.poolA.noPositionDesc} />
          </div>
        )}
        {address && !loading && !noPosition && (
          <>
            <p className="mt-2 text-sm text-zinc-400">
              {copy.poolA.staked}: <span className="font-mono text-zinc-200">{formatToken(userStakeA)}</span> TokenA
            </p>
            <p className="text-sm text-zinc-400">
              {copy.poolA.pendingRewards}: <span className="font-mono text-emerald-300/90">{formatToken(pendingA)}</span> TokenB
            </p>
            {stakeDurationLabel ? (
              <p className="text-sm text-zinc-400">
                {copy.poolA.stakingDuration}: <span className="font-mono text-zinc-200">{stakeDurationLabel}</span>
              </p>
            ) : null}
            <p className="text-sm text-zinc-400">
              {copy.poolA.rewardPaidLifetime}: <span className="font-mono text-zinc-500">{formatToken(pool.userA?.[2] ?? 0n)}</span>
            </p>
          </>
        )}
        {cooldownLabel ? (
          <p className="mt-2 text-xs text-amber-200/90">
            {copy.poolA.claimCooldown}: {cooldownLabel}
          </p>
        ) : null}
        <FotClaimHint grossRewards={pendingA} maxTransferFeeBP={pool.maxTransferFeeBP} />
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <ConsoleButton fullWidth disabled={!pool.canClaim || busy} onClick={() => void runClaim()}>
            {busy ? copy.common.pending : copy.common.claim}
          </ConsoleButton>
          <ConsoleButton
            fullWidth
            variant="danger"
            disabled={!pool.canEmergencyWithdraw || busy}
            onClick={() => setEmergencyOpen(true)}
          >
            {copy.common.emergencyWithdraw}
          </ConsoleButton>
        </div>
        {pool.claimDisabledReason ? (
          <p className="mt-2 text-xs text-zinc-500">
            {copy.poolA.claimUnavailable}: {pool.claimDisabledReason}
          </p>
        ) : null}
        {pool.emergencyDisabledReason ? (
          <p className="text-xs text-zinc-500">
            {copy.poolA.emergencyUnavailable}: {pool.emergencyDisabledReason}
          </p>
        ) : null}
      </div>

      <ForceClaimAllButton onConfirmed={() => pool.refetchWalletAndPool()} />
    </div>
  );
}
