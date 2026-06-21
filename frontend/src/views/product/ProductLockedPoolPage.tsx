"use client";

import { useMemo } from "react";
import { useAccount } from "wagmi";

import { FotClaimHint } from "@/components/FotClaimHint";
import { LockProgress } from "@/components/LockProgress";
import { CompoundWidget } from "@/components/product/widgets/CompoundWidget";
import { PositionSummary } from "@/components/product/widgets/PositionSummary";
import { StakeWidget } from "@/components/product/widgets/StakeWidget";
import { ProductActionCard } from "@/components/product/ProductActionCard";
import { ProductEscapeActions } from "@/components/product/ProductEscapeActions";
import { ProductPageShell } from "@/components/product/ProductPageShell";
import { ProductPoolHero } from "@/components/product/ProductPoolHero";
import { ProductStakePageLayout } from "@/components/product/ProductStakePageLayout";
import { contractAddresses } from "@/contracts/addresses";
import { usePoolB } from "@/hooks/usePoolB";
import { useWriteWithStatus } from "@/hooks/useWriteWithStatus";
import { POOL_COPY } from "@/lib/appMode";
import { getCompoundDisabledReason } from "@/lib/compoundHints";
import { formatTokenDisplay } from "@/lib/format";
import { formatCountdownHms } from "@/lib/timelockCountdown";
import { useI18n } from "@/lib/i18n";
import { parseUserInfoTuple } from "@/lib/userInfo";

const copy = POOL_COPY.locked;

/** 产品端：锁仓质押 */
export function ProductLockedPoolPage() {
  const { t } = useI18n();
  const { address } = useAccount();
  const pool = usePoolB();
  const flow = useWriteWithStatus();

  const user = parseUserInfoTuple(pool.userB);
  const userA = parseUserInfoTuple(pool.userA);
  const tvlB = pool.poolB?.totalStaked ?? 0n;
  const rrB = pool.poolB?.rewardRate ?? 0n;
  const yourRewards = pool.pendingRewardB + pool.pendingRewardA;
  const busy = flow.state !== "idle";

  const compoundDisabledReason = useMemo(
    () =>
      getCompoundDisabledReason(
        {
          compoundPreview: pool.compoundPreview,
          status: pool.status,
          globalBadDebt: pool.globalBadDebt,
          claimCooldownRemainingSec: pool.claimCooldownRemainingSec,
          canCompound: pool.canCompound,
        },
        t,
      ),
    [pool.compoundPreview, pool.canCompound, pool.claimCooldownRemainingSec, pool.status, pool.globalBadDebt, t],
  );

  const cooldownLabel =
    pool.claimCooldownRemainingSec > 0n ? formatCountdownHms(Number(pool.claimCooldownRemainingSec)) : null;

  const runClaim = async () => {
    await flow.executeWrite(
      {
        actionLabel: t("action.claim"),
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
        actionLabel: t("action.compound"),
        txType: "compound",
        metadata: { pool: "B", token: "TokenB" },
        onConfirmed: () => pool.refetchWalletAndPool(),
      },
      () => pool.writeCompoundB(),
    );
    flow.reset({ closeGlobal: true });
  };

  const hasPosition = Boolean(address && (user.staked > 0n || yourRewards > 0n));

  const actionBlock = (
    <ProductActionCard compact heading={t("productPage.stakeHeading")}>
      <StakeWidget
        embedded
        compact
        stakeToken={copy.stakeToken}
        rewardToken={copy.rewardToken}
        disabled={!pool.canStake}
        balanceWei={pool.tokenBBalance}
        poolTvlWei={tvlB}
        rewardRateWei={rrB}
        tx={{
          tokenAddress: pool.stakingTokenB,
          spenderAddress: contractAddresses.staking,
          approve: pool.writeApproveTokenB,
          stake: pool.writeStakeB,
          invalidate: pool.refetchWalletAndPool,
          txMeta: { pool: "B", token: "TokenB" },
        }}
      />
    </ProductActionCard>
  );

  return (
    <ProductPageShell poolAStakingToken={pool.poolA?.stakingToken} poolBStakingToken={pool.poolB?.stakingToken}>
      <ProductStakePageLayout
        hero={
          <div className="space-y-4 sm:space-y-5">
            <ProductPoolHero
              title={t("pool.locked.productTitle")}
              subtitle={t("pool.locked.productSubtitle")}
              tokenSymbol={copy.stakeToken}
              rewardToken={copy.rewardToken}
              totalStakedWei={tvlB}
              rewardRateWei={rrB}
            />
          </div>
        }
        sidebar={
          <>
            {hasPosition ? (
              <PositionSummary
                stakedLabel={formatTokenDisplay(user.staked, "TokenB")}
                stakedWei={user.staked}
                rewardsWei={yourRewards}
                onClaim={() => void runClaim()}
                claimDisabled={!pool.canClaim || busy}
                claimBusy={busy}
                compoundPreview={pool.compoundPreview}
                onCompound={runCompound}
                compoundDisabled={!pool.canCompound || busy}
                compoundDisabledReason={compoundDisabledReason}
                compoundBusy={busy}
                manageHref={copy.withdrawHref}
              />
            ) : null}

            {address && user.staked > 0n ? (
              <div className="dp-card p-5">
                <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">{t("productPage.lockProgress")}</h2>
                <div className="mt-4">
                  <LockProgress stakeTimestamp={pool.stakeTimestampB} unlockTime={pool.unlockTimeB} />
                </div>
                {cooldownLabel ? (
                  <p className="mt-3 text-xs text-amber-200/90">{t("productPage.claimCooldown", { countdown: cooldownLabel })}</p>
                ) : null}
                <FotClaimHint grossRewards={pool.pendingRewardB} maxTransferFeeBP={pool.maxTransferFeeBP} />
              </div>
            ) : null}

            {!hasPosition ? (
              <CompoundWidget
                preview={pool.compoundPreview}
                disabled={!pool.canCompound || busy}
                disabledReason={compoundDisabledReason}
                busy={busy}
                onCompound={runCompound}
              />
            ) : null}

            <ProductEscapeActions onRefetch={() => pool.refetchWalletAndPool()} />
          </>
        }
        action={actionBlock}
      />
    </ProductPageShell>
  );
}
