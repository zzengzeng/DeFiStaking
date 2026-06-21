"use client";

import { useMemo, useState } from "react";
import { useAccount } from "wagmi";

import { AirdropCard } from "@/components/AirdropCard";
import { HowItWorks } from "@/components/product/widgets/HowItWorks";
import { AprHistoryChart } from "@/components/product/widgets/AprHistoryChart";
import { PoolTabs } from "@/components/product/widgets/PoolTabs";
import { PositionSummary } from "@/components/product/widgets/PositionSummary";
import {
  formatTvlDisplay,
  ProtocolStats,
} from "@/components/product/widgets/ProtocolStats";
import { StakeWidget } from "@/components/product/widgets/StakeWidget";
import { TokenIcon } from "@/components/TokenIcon";
import { ProductActionCard } from "@/components/product/ProductActionCard";
import { ProductEscapeActions } from "@/components/product/ProductEscapeActions";
import { ProductPageShell } from "@/components/product/ProductPageShell";
import { ProductPageTitle } from "@/components/product/ProductPageTitle";
import { ProductStakePageLayout } from "@/components/product/ProductStakePageLayout";
import { contractAddresses } from "@/contracts/addresses";
import { usePoolA } from "@/hooks/usePoolA";
import { usePoolB } from "@/hooks/usePoolB";
import { useRewardNotifiedHistory } from "@/hooks/useRewardNotifiedHistory";
import { useStakerStats } from "@/hooks/useStakerStats";
import { useStaking } from "@/hooks/useStaking";
import { useWriteWithStatus } from "@/hooks/useWriteWithStatus";
import { POOL_COPY } from "@/lib/appMode";
import { getCompoundDisabledReason } from "@/lib/compoundHints";
import { appChainLabel } from "@/config/chains";
import { formatTokenDisplay, safeNumber } from "@/lib/format";
import { estAprPercent } from "@/lib/poolMetrics";
import { showsUsdEstimates } from "@/lib/tokenPrices";
import { parseUserInfoTuple } from "@/lib/userInfo";
import { useI18n } from "@/lib/i18n";

type PoolId = "flexible" | "locked";

function DappStatusStrip({
  status,
  hasBadDebt,
}: {
  status: string;
  hasBadDebt: boolean;
}) {
  const { t } = useI18n();
  const items = [
    { label: t("home.statusNetwork"), value: appChainLabel, tone: "neutral" },
    {
      label: t("home.statusProtocol"),
      value: status === "NORMAL" ? t("home.statusNormal") : status,
      tone: status === "NORMAL" ? "good" : "warn",
    },
    {
      label: t("home.statusPrice"),
      value: showsUsdEstimates ? t("home.statusPriceOn") : t("home.statusPriceOff"),
      tone: "neutral",
    },
    {
      label: t("home.statusBadDebt"),
      value: hasBadDebt ? t("home.statusBadDebtYes") : t("home.statusBadDebtNo"),
      tone: hasBadDebt ? "warn" : "good",
    },
  ] as const;

  return (
    <div className="mx-auto grid w-full max-w-3xl grid-cols-2 gap-2 sm:grid-cols-4">
      {items.map((item) => (
        <div
          key={item.label}
          className="flex min-h-[42px] items-center justify-between gap-2 rounded-lg border border-[var(--dp-border)] bg-[var(--dp-surface)]/70 px-3 text-xs"
        >
          <span className="text-zinc-500">{item.label}</span>
          <span
            className={
              item.tone === "good"
                ? "font-semibold text-emerald-300"
                : item.tone === "warn"
                  ? "font-semibold text-amber-300"
                  : "font-semibold text-zinc-200"
            }
          >
            {item.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function MarketOverview({
  aprA,
  aprB,
  tvlA,
  tvlB,
  yourStaked,
  yourRewards,
  connected,
}: {
  aprA: number;
  aprB: number;
  tvlA: bigint;
  tvlB: bigint;
  yourStaked: bigint;
  yourRewards: bigint;
  connected: boolean;
}) {
  const { t } = useI18n();
  const rows = [
    {
      name: t("home.flexiblePool"),
      stakeToken: "TokenA",
      rewardToken: "TokenB",
      apr: aprA,
      tvl: formatTvlDisplay(tvlA, "TokenA"),
      detail: t("home.flexibleDetail"),
    },
    {
      name: t("home.lockedPool"),
      stakeToken: "TokenB",
      rewardToken: "TokenB",
      apr: aprB,
      tvl: formatTvlDisplay(tvlB, "TokenB"),
      detail: t("home.lockedDetail"),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="dp-card overflow-hidden">
        <div className="border-b border-[var(--dp-border)] px-4 py-3">
          <h2 className="text-sm font-semibold text-zinc-100">{t("home.marketTitle")}</h2>
          <p className="mt-0.5 text-xs text-zinc-500">{t("home.marketSubtitle")}</p>
        </div>
        <div className="divide-y divide-[var(--dp-border)]">
          {rows.map((row) => (
            <div
              key={row.name}
              className="grid grid-cols-[1fr_auto] gap-3 px-4 py-4"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-zinc-50">{row.name}</span>
                  <span className="inline-flex items-center gap-1 rounded-md border border-[var(--dp-border)] px-2 py-0.5">
                    <TokenIcon symbol={row.stakeToken} size="xs" />
                    <span className="text-[11px] text-zinc-500">→</span>
                    <TokenIcon symbol={row.rewardToken} size="xs" />
                    <span className="text-[11px] text-zinc-400">
                      {row.stakeToken === row.rewardToken ? row.stakeToken : `${row.stakeToken} → ${row.rewardToken}`}
                    </span>
                  </span>
                </div>
                <div className="mt-1 text-xs text-zinc-500">
                  {row.detail} · TVL {row.tvl}
                </div>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold text-[var(--dp-accent)]">
                  {safeNumber(row.apr).toFixed(2)}%
                </div>
                <div className="text-[11px] text-zinc-500">APR</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="dp-card p-4">
        <h2 className="text-sm font-semibold text-zinc-100">{t("home.myPosition")}</h2>
        {connected ? (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-[var(--dp-border)] bg-[var(--dp-surface-raised)] p-3">
              <div className="text-xs text-zinc-500">{t("home.staked")}</div>
              <div className="mt-1 text-base font-bold text-zinc-50">
                {formatTvlDisplay(yourStaked, "Token")}
              </div>
            </div>
            <div className="rounded-lg border border-[var(--dp-border)] bg-[var(--dp-surface-raised)] p-3">
              <div className="text-xs text-zinc-500">{t("home.pendingRewards")}</div>
              <div className="mt-1 text-base font-bold text-[var(--dp-accent)]">
                {formatTvlDisplay(yourRewards, "TokenB")}
              </div>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-sm leading-relaxed text-zinc-500">{t("home.connectHint")}</p>
        )}
      </div>
    </div>
  );
}

/** 产品端首页 */
export function ProductHomePage() {
  const { address, isConnecting } = useAccount();
  const { t } = useI18n();
  const staking = useStaking();
  const poolA = usePoolA();
  const poolB = usePoolB();
  const flow = useWriteWithStatus();
  const [activePool, setActivePool] = useState<PoolId>("flexible");

  const loading = staking.isLoading || isConnecting;
  const busy = flow.state !== "idle";

  const tvlA = staking.poolA?.totalStaked ?? 0n;
  const tvlB = staking.poolB?.totalStaked ?? 0n;
  const tvlTotal = tvlA + tvlB;
  const rrA = staking.poolA?.rewardRate ?? 0n;
  const rrB = staking.poolB?.rewardRate ?? 0n;
  const aprA = estAprPercent(rrA, tvlA);
  const aprB = estAprPercent(rrB, tvlB);

  const userA = parseUserInfoTuple(staking.userA);
  const userB = parseUserInfoTuple(staking.userB);
  const yourRewards = staking.pendingRewardA + staking.pendingRewardB;
  const yourStaked = userA.staked + userB.staked;

  const copy = POOL_COPY[activePool];
  const isFlexible = activePool === "flexible";
  const tvl = isFlexible ? tvlA : tvlB;
  const rr = isFlexible ? rrA : rrB;
  const canStake = isFlexible ? poolA.canStake : poolB.canStake;
  const balance = isFlexible ? poolA.tokenABalance : poolB.tokenBBalance;

  const stakers = useStakerStats(true);
  const rewardHistory = useRewardNotifiedHistory(true);

  const runClaimAll = async () => {
    try {
      if (staking.pendingRewardA > 0n && poolA.canClaim) {
        await flow.executeWrite(
          {
            actionLabel: t("action.claimFlexible"),
            txType: "claim",
            metadata: { pool: "A", token: "TokenB" },
            onConfirmed: () => staking.refetchAll(),
          },
          () => poolA.writeClaimA(),
        );
      }
      if (staking.pendingRewardB > 0n && poolB.canClaim) {
        await flow.executeWrite(
          {
            actionLabel: t("action.claimLocked"),
            txType: "claim",
            metadata: { pool: "B", token: "TokenB" },
            onConfirmed: () => staking.refetchAll(),
          },
          () => poolB.writeClaimB(),
        );
      }
    } finally {
      flow.reset({ closeGlobal: true });
    }
  };

  const runCompound = async () => {
    await flow.executeWrite(
      {
        actionLabel: t("action.compound"),
        txType: "compound",
        metadata: { pool: "B", token: "TokenB" },
        onConfirmed: () => staking.refetchAll(),
      },
      () => poolB.writeCompoundB(),
    );
    flow.reset({ closeGlobal: true });
  };

  const stakeTx = isFlexible
    ? {
        tokenAddress: poolA.stakingTokenA,
        spenderAddress: contractAddresses.staking,
        approve: poolA.writeApproveTokenA,
        stake: poolA.writeStakeA,
        invalidate: poolA.refetchWalletAndPool,
        txMeta: { pool: "A" as const, token: "TokenA" },
      }
    : {
        tokenAddress: poolB.stakingTokenB,
        spenderAddress: contractAddresses.staking,
        approve: poolB.writeApproveTokenB,
        stake: poolB.writeStakeB,
        invalidate: poolB.refetchWalletAndPool,
        txMeta: { pool: "B" as const, token: "TokenB" },
      };

  const stakerError = stakers.data?.error;
  const stakerTotal = stakers.data?.stats?.total ?? 0;

  const stats = useMemo(
    () => [
      {
        label: t("home.tvlTotal"),
        value: formatTvlDisplay(tvlTotal, "Token"),
        sub: t("home.tvlTotalSub"),
      },
      {
        label: t("home.stakers"),
        value: stakers.isLoading
          ? "…"
          : stakerError
            ? t("home.stakersUnavailable")
            : stakerTotal.toLocaleString(),
        sub: stakerError ? t("home.stakersRetry") : t("home.stakersOnChain"),
        highlight: !stakerError && stakerTotal > 0,
      },
      {
        label: t("home.aprFlexible"),
        value: `${safeNumber(aprA).toFixed(2)}%`,
        highlight: aprA >= aprB,
      },
      {
        label: t("home.aprLocked"),
        value: `${safeNumber(aprB).toFixed(2)}%`,
        highlight: aprB > aprA,
      },
    ],
    [tvlTotal, aprA, aprB, stakerTotal, stakerError, stakers.isLoading, t],
  );

  const poolPositions = useMemo(
    () => [
      {
        label: t("pool.positionFlexible"),
        amount:
          userA.staked > 0n
            ? formatTokenDisplay(userA.staked, "TokenA")
            : t("home.notStaked"),
      },
      {
        label: t("pool.positionLocked"),
        amount:
          userB.staked > 0n
            ? formatTokenDisplay(userB.staked, "TokenB")
            : t("home.notStaked"),
      },
    ],
    [userA.staked, userB.staked, t],
  );

  const compoundDisabledReason = useMemo(
    () =>
      getCompoundDisabledReason(
        {
          compoundPreview: poolB.compoundPreview,
          status: staking.status,
          globalBadDebt: staking.globalBadDebt,
          claimCooldownRemainingSec: poolB.claimCooldownRemainingSec,
          canCompound: poolB.canCompound,
        },
        t,
      ),
    [
      poolB.compoundPreview,
      poolB.canCompound,
      poolB.claimCooldownRemainingSec,
      staking.status,
      staking.globalBadDebt,
      t,
    ],
  );

  const hasPosition = Boolean(
    address && !loading && (yourStaked > 0n || yourRewards > 0n),
  );

  const activePositions = useMemo(
    () => poolPositions.filter((p) => p.amount !== t("home.notStaked")),
    [poolPositions, t],
  );

  const actionCard = (
    <ProductActionCard
      compact
      tabs={
        <PoolTabs
          tabs={[
            { id: "flexible", label: t("home.tabFlexible"), token: "TokenA" },
            { id: "locked", label: t("home.tabLocked"), token: "TokenB" },
          ]}
          activeId={activePool}
          onChange={(id) => setActivePool(id as PoolId)}
        />
      }
    >
      <StakeWidget
        embedded
        compact
        stakeToken={copy.stakeToken}
        rewardToken={copy.rewardToken}
        disabled={!canStake}
        balanceWei={balance}
        poolTvlWei={tvl}
        rewardRateWei={rr}
        tx={stakeTx}
      />
    </ProductActionCard>
  );

  return (
    <ProductPageShell>
      <ProductPageTitle
        variant="hero"
        centered
        title={
          <>
            {t("home.heroTitle")} <span className="text-dp-accent">TokenB</span>
          </>
        }
        subtitle={t("home.heroSubtitle")}
      />

      <DappStatusStrip
        status={staking.status}
        hasBadDebt={staking.globalBadDebt > 0n}
      />

      <ProtocolStats stats={stats} loading={staking.isLoading} />

      <ProductStakePageLayout
        sidebar={
          hasPosition ? (
            <PositionSummary
              positions={
                activePositions.length > 0 ? activePositions : undefined
              }
              stakedWei={yourStaked}
              rewardsWei={yourRewards}
              onClaim={() => void runClaimAll()}
              claimDisabled={
                busy ||
                (!poolA.canClaim && !poolB.canClaim) ||
                yourRewards === 0n
              }
              claimBusy={busy}
              compoundPreview={poolB.compoundPreview}
              onCompound={runCompound}
              compoundDisabled={!poolB.canCompound || busy}
              compoundDisabledReason={compoundDisabledReason}
              compoundBusy={busy}
              manageHref={
                userA.staked > 0n
                  ? POOL_COPY.flexible.withdrawHref
                  : POOL_COPY.locked.withdrawHref
              }
            />
          ) : (
            <MarketOverview
              aprA={aprA}
              aprB={aprB}
              tvlA={tvlA}
              tvlB={tvlB}
              yourStaked={yourStaked}
              yourRewards={yourRewards}
              connected={Boolean(address)}
            />
          )
        }
        action={actionCard}
        below={
          <div className="space-y-4">
            <ProductEscapeActions onRefetch={() => staking.refetchAll()} />
            <AprHistoryChart
              entries={rewardHistory.data?.entries ?? []}
              tvlA={tvlA}
              tvlB={tvlB}
              currentAprA={aprA}
              currentAprB={aprB}
              loading={rewardHistory.isLoading}
              error={rewardHistory.data?.error}
            />
          </div>
        }
      />

      <HowItWorks />

      <div className="w-full min-w-0">
        <AirdropCard
          onClaimed={async () => {
            await staking.refetchAll();
          }}
        />
      </div>
    </ProductPageShell>
  );
}
