"use client";

import { useAccount } from "wagmi";

import { FotClaimHint } from "@/components/FotClaimHint";
import { LockProgress } from "@/components/LockProgress";
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
import { usePoolB } from "@/hooks/usePoolB";
import { useWriteWithStatus } from "@/hooks/useWriteWithStatus";
import { POOL_COPY } from "@/lib/appMode";
import { formatTokenDisplay } from "@/lib/format";
import { parseUserInfoTuple } from "@/lib/userInfo";

const copy = POOL_COPY.locked;

/** 产品端：赎回专页（锁仓池） */
export function ProductLockedWithdrawPage() {
  const { address } = useAccount();
  const pool = usePoolB();
  const flow = useWriteWithStatus();

  const user = parseUserInfoTuple(pool.userB);
  const tvlB = pool.poolB?.totalStaked ?? 0n;
  const rrB = pool.poolB?.rewardRate ?? 0n;
  const busy = flow.state !== "idle";

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
        actionLabel: "领取奖励（锁仓池）",
        txType: "claim",
        metadata: { pool: "B", token: "TokenB" },
        onConfirmed: () => pool.refetchWalletAndPool(),
      },
      () => pool.writeClaimB(),
    );
    flow.reset({ closeGlobal: true });
  };

  const hasPosition = Boolean(
    address && (user.staked > 0n || user.rewards > 0n),
  );

  const actionBlock = (
    <ProductActionCard compact heading="赎回操作">
      <WithdrawWidget
        embedded
        tokenSymbol={copy.stakeToken}
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
        maxTransferFeeBP={pool.maxTransferFeeBP}
        showFeeTiers
        onWithdraw={runWithdraw}
        disabled={!pool.canWithdraw || busy}
      />
    </ProductActionCard>
  );

  return (
    <ProductPageShell
      poolAStakingToken={pool.poolA?.stakingToken}
      poolBStakingToken={pool.poolB?.stakingToken}
    >
      <ProductStakePageLayout
        layout="split"
        hero={
          <div className="space-y-4 sm:space-y-5">
            <ProductPageTitle
              centered
              title="赎回质押"
              subtitle="锁仓池赎回 TokenB；查看解锁进度与费用，选择合适时机赎回。"
            />
            <WithdrawPoolTabs />
            <ProductPoolMetrics
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
                rewardsWei={user.rewards}
                onClaim={() => void runClaim()}
                claimDisabled={!pool.canClaim || busy}
                claimBusy={busy}
                manageHref={copy.withdrawHref}
              />
            ) : null}

            <ProductWithdrawInfoPanel
              poolName="锁仓池"
              tokenSymbol={copy.stakeToken}
              rewardToken={copy.rewardToken}
              stakedWei={user.staked}
              rewardsWei={user.rewards}
              stakeHref={copy.earnHref}
              locked
            />

            {address && user.staked > 0n ? (
              <>
                <div className="dp-card p-5 sm:p-6">
                  <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
                    解锁进度
                  </h2>
                  <div className="mt-4">
                    <LockProgress
                      stakeTimestamp={pool.stakeTimestampB}
                      unlockTime={pool.unlockTimeB}
                    />
                  </div>
                </div>

                <div className="dp-card p-5 sm:p-6">
                  <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
                    赎回提示
                  </h2>
                  <div className="mt-3">
                    <FotClaimHint
                      grossRewards={user.rewards}
                      maxTransferFeeBP={pool.maxTransferFeeBP}
                    />
                  </div>
                </div>
              </>
            ) : null}

            <ProductEscapeActions
              onRefetch={() => pool.refetchWalletAndPool()}
              emergencyPools={["B"]}
            />
          </>
        }
        action={actionBlock}
      />
    </ProductPageShell>
  );
}
