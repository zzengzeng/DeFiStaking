"use client";

import { useCallback } from "react";
import { useAccount } from "wagmi";

import { FotClaimHint } from "@/components/FotClaimHint";
import { PositionSummary } from "@/components/product/widgets/PositionSummary";
import { WithdrawWidget } from "@/components/product/widgets/WithdrawWidget";
import { WithdrawPoolTabs } from "@/components/product/widgets/WithdrawPoolTabs";
import { ProductActionCard } from "@/components/product/ProductActionCard";
import { ProductEscapeActions } from "@/components/product/ProductEscapeActions";
import { ProductPageShell } from "@/components/product/ProductPageShell";
import { ProductPageTitle } from "@/components/product/ProductPageTitle";
import { ProductPoolMetrics } from "@/components/product/ProductPoolHero";
import { ProductStakePageLayout } from "@/components/product/ProductStakePageLayout";
import { ProductWithdrawInfoPanel } from "@/components/product/ProductWithdrawInfoPanel";
import { usePoolA } from "@/hooks/usePoolA";
import { useWriteWithStatus } from "@/hooks/useWriteWithStatus";
import { POOL_COPY } from "@/lib/appMode";
import { formatTokenDisplay } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { CATCH_UP_A } from "@/lib/poolCatchUp";

const copy = POOL_COPY.flexible;

const computeWithdrawPreviewA = (amount: bigint) => ({
  netAmount: amount,
  feeAmount: 0n,
  penaltyAmount: 0n,
  feeBp: 0n,
  penaltyBp: 0n,
  isLocked: false,
});

/** 产品端：赎回专页（灵活池） */
export function ProductFlexibleWithdrawPage() {
  const { t } = useI18n();
  const { address } = useAccount();
  const pool = usePoolA();
  const flow = useWriteWithStatus();

  const tvlA = pool.poolA?.totalStaked ?? 0n;
  const rrA = pool.poolA?.rewardRate ?? 0n;
  const userStakeA = pool.userA?.[0] ?? 0n;
  const pendingA = pool.pendingRewardA;
  const busy = flow.state !== "idle";

  const runWithdraw = useCallback(
    async (amt: string) => {
      await flow.executeWrite(
        {
          actionLabel: t("action.withdrawFlexible"),
          txType: "withdraw",
          metadata: { pool: "A", token: "TokenA", amount: amt },
          onConfirmed: () => pool.refetchWalletAndPool(),
          catchUpPools: CATCH_UP_A,
        },
        () => pool.writeWithdrawA(amt),
      );
      flow.reset({ closeGlobal: true });
    },
    [flow, pool, t],
  );

  const runClaim = async () => {
    await flow.executeWrite(
      {
        actionLabel: t("action.claimFlexiblePool"),
        txType: "claim",
        metadata: { pool: "A", token: "TokenB" },
        onConfirmed: () => pool.refetchWalletAndPool(),
        catchUpPools: CATCH_UP_A,
      },
      () => pool.writeClaimA(),
    );
    flow.reset({ closeGlobal: true });
  };

  const hasPosition = Boolean(address && (userStakeA > 0n || pendingA > 0n));

  const actionBlock = (
    <ProductActionCard compact heading={t("productPage.withdrawHeading")}>
      <WithdrawWidget
        embedded
        tokenSymbol={copy.stakeToken}
        computePreview={computeWithdrawPreviewA}
        protocolStatus={pool.status}
        maxWithdrawWei={userStakeA}
        maxTransferFeeBP={pool.maxTransferFeeBP}
        showFeeTiers={false}
        onWithdraw={runWithdraw}
        disabled={!pool.canWithdraw || busy || userStakeA <= 0n}
      />
    </ProductActionCard>
  );

  return (
    <ProductPageShell poolAStakingToken={pool.poolA?.stakingToken} poolBStakingToken={pool.poolB?.stakingToken}>
      <ProductStakePageLayout
        hero={
          <div className="space-y-4 sm:space-y-5">
            <ProductPageTitle
              centered
              title={t("productPage.withdrawTitle")}
              subtitle={t("productPage.withdrawSubtitleFlexible")}
            />
            <WithdrawPoolTabs />
            <ProductPoolMetrics
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
                rewardsWei={pendingA}
                onClaim={() => void runClaim()}
                claimDisabled={!pool.canClaim || busy}
                claimBusy={busy}
                manageHref={copy.withdrawHref}
              />
            ) : null}

            <ProductWithdrawInfoPanel
              poolName={t("pool.flexible.consoleTitle")}
              tokenSymbol={copy.stakeToken}
              rewardToken={copy.rewardToken}
              stakedWei={userStakeA}
              rewardsWei={pendingA}
              stakeHref={copy.earnHref}
            />

            {address && pendingA > 0n ? (
              <div className="dp-card p-5 sm:p-6">
                <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">{t("productPage.withdrawHint")}</h2>
                <FotClaimHint grossRewards={pendingA} maxTransferFeeBP={pool.maxTransferFeeBP} />
              </div>
            ) : null}

            <ProductEscapeActions onRefetch={() => pool.refetchWalletAndPool()} emergencyPools={["A"]} />
          </>
        }
        action={actionBlock}
      />
    </ProductPageShell>
  );
}
