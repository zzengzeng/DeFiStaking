"use client";

import { useMemo } from "react";
import { useAccount } from "wagmi";

import { FotClaimHint } from "@/components/FotClaimHint";
import { CompoundWidget } from "@/components/product/widgets/CompoundWidget";
import { PositionSummary } from "@/components/product/widgets/PositionSummary";
import { StakeWidget } from "@/components/product/widgets/StakeWidget";
import { ProductActionCard } from "@/components/product/ProductActionCard";
import { ProductEscapeActions } from "@/components/product/ProductEscapeActions";
import { ProductPageShell } from "@/components/product/ProductPageShell";
import { ProductPoolHero } from "@/components/product/ProductPoolHero";
import { ProductStakePageLayout } from "@/components/product/ProductStakePageLayout";
import { contractAddresses } from "@/contracts/addresses";
import { usePoolA } from "@/hooks/usePoolA";
import { usePoolAStakeSince } from "@/hooks/usePoolAStakeSince";
import { usePoolB } from "@/hooks/usePoolB";
import { useWriteWithStatus } from "@/hooks/useWriteWithStatus";
import { POOL_COPY } from "@/lib/appMode";
import { getCompoundDisabledReason } from "@/lib/compoundHints";
import { formatTokenDisplay } from "@/lib/format";
import { formatCountdownHms } from "@/lib/timelockCountdown";
import { useI18n } from "@/lib/i18n";
import { CATCH_UP_A, CATCH_UP_BOTH } from "@/lib/poolCatchUp";
import { parseUserInfoTuple } from "@/lib/userInfo";

const copy = POOL_COPY.flexible;

/** 产品端：灵活质押 */
export function ProductFlexiblePoolPage() {
  const { t } = useI18n();
  const { address } = useAccount();
  const pool = usePoolA();
  const poolB = usePoolB();
  const flow = useWriteWithStatus();

  const userA = parseUserInfoTuple(pool.userA);
  const userB = parseUserInfoTuple(pool.userB);
  const tvlA = pool.poolA?.totalStaked ?? 0n;
  const rrA = pool.poolA?.rewardRate ?? 0n;
  const userStakeA = userA.staked;
  const pendingA = pool.pendingRewardA;
  const yourRewards = pool.pendingRewardA + pool.pendingRewardB;
  const { data: stakeSinceTs } = usePoolAStakeSince(userStakeA);
  const busy = flow.state !== "idle";
  const catchUpIncomplete = !pool.poolACatchUpComplete || !pool.poolBCatchUpComplete;

  const compoundDisabledReason = useMemo(
    () =>
      getCompoundDisabledReason(
        {
          compoundPreview: poolB.compoundPreview,
          status: poolB.status,
          globalBadDebt: poolB.globalBadDebt,
          claimCooldownRemainingSec: poolB.claimCooldownRemainingSec,
          canCompound: poolB.canCompound,
        },
        t,
      ),
    [poolB.compoundPreview, poolB.canCompound, poolB.claimCooldownRemainingSec, poolB.status, poolB.globalBadDebt, t],
  );

  const runClaim = async () => {
    await flow.executeWrite(
      {
        actionLabel: t("action.claim"),
        txType: "claim",
        metadata: { pool: "A", token: "TokenB" },
        onConfirmed: () => pool.refetchWalletAndPool(),
        catchUpPools: CATCH_UP_A,
      },
      () => pool.writeClaimA(),
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
        catchUpPools: CATCH_UP_BOTH,
      },
      () => poolB.writeCompoundB(),
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
    if (days > 0) return t("productPage.stakedDays", { days, hours });
    if (hours > 0) return t("productPage.stakedHours", { hours });
    return t("productPage.stakedRecently");
  })();

  const hasPosition = Boolean(address && (userStakeA > 0n || yourRewards > 0n));

  const actionBlock = (
    <ProductActionCard compact heading={t("productPage.stakeHeading")}>
      <StakeWidget
        embedded
        compact
        stakeToken={copy.stakeToken}
        rewardToken={copy.rewardToken}
        disabled={!pool.canStake}
        balanceWei={pool.tokenABalance}
        poolTvlWei={tvlA}
        rewardRateWei={rrA}
        tx={{
          tokenAddress: pool.stakingTokenA,
          spenderAddress: contractAddresses.staking,
          approve: pool.writeApproveTokenA,
          stake: pool.writeStakeA,
          invalidate: pool.refetchWalletAndPool,
          txMeta: { pool: "A", token: "TokenA" },
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
              title={t("pool.flexible.productTitle")}
              subtitle={t("pool.flexible.productSubtitle")}
              tokenSymbol={copy.stakeToken}
              rewardToken={copy.rewardToken}
              totalStakedWei={tvlA}
              rewardRateWei={rrA}
            />
          </div>
        }
        sidebar={
          <>
            {hasPosition ? (
              <PositionSummary
                stakedLabel={formatTokenDisplay(userStakeA, "TokenA")}
                stakedWei={userStakeA}
                rewardsWei={yourRewards}
                onClaim={() => void runClaim()}
                claimDisabled={!pool.canClaim || busy}
                claimBusy={busy}
                compoundPreview={poolB.compoundPreview}
                onCompound={runCompound}
                compoundDisabled={!poolB.canCompound || busy}
                compoundDisabledReason={compoundDisabledReason}
                compoundBusy={busy}
                compoundBusyState={flow.state}
                compoundCatchUpNeeded={catchUpIncomplete}
                manageHref={copy.withdrawHref}
              />
            ) : null}

            {address && userStakeA > 0n ? (
              <div className="dp-card p-5">
                <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">{t("productPage.positionDetail")}</h2>
                {stakeDurationLabel ? <p className="mt-3 text-sm text-zinc-400">{stakeDurationLabel}</p> : null}
                {cooldownLabel ? (
                  <p className="mt-2 text-xs text-amber-200/90">{t("productPage.claimCooldown", { countdown: cooldownLabel })}</p>
                ) : null}
                <FotClaimHint grossRewards={pendingA} maxTransferFeeBP={pool.maxTransferFeeBP} />
                {pool.claimDisabledReason ? <p className="mt-2 text-xs text-zinc-600">{pool.claimDisabledReason}</p> : null}
              </div>
            ) : null}

            {!hasPosition ? (
              <CompoundWidget
                preview={poolB.compoundPreview}
                disabled={!poolB.canCompound || busy}
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
