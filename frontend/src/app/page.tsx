"use client";

import { useAccount } from "wagmi";

import { AirdropCard } from "@/components/AirdropCard";
import { useStaking } from "@/hooks/useStaking";
import { formatToken, formatTokenWithUsd, safeNumber } from "@/lib/format";
import { MOCK_USD_PRICE_TOKEN_A, MOCK_USD_PRICE_TOKEN_B } from "@/lib/usd";
import { parseUserInfoTuple } from "@/lib/userInfo";

function riskLevel(badDebt: bigint, tvl: bigint) {
  if (badDebt === 0n) return { label: "Low", tone: "text-emerald-300" };
  if (tvl === 0n) return { label: "High", tone: "text-red-300" };
  const bp = safeNumber(Number((badDebt * 10_000n) / tvl));
  if (bp < 10) return { label: "Medium", tone: "text-amber-300" };
  return { label: "High", tone: "text-red-300" };
}

function CardSkeleton() {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
      <div className="h-3 w-24 animate-pulse rounded bg-zinc-800" />
      <div className="mt-3 h-7 w-40 animate-pulse rounded bg-zinc-800" />
      <div className="mt-2 h-3 w-32 animate-pulse rounded bg-zinc-800" />
    </div>
  );
}

export default function Home() {
  const { address, isConnecting } = useAccount();
  const staking = useStaking();
  /** 不用 isFetching：后台刷新不应整页骨架屏；RPC 已合并为单次 multicall */
  const loading = staking.isLoading || isConnecting;

  const tvlA = staking.poolA?.totalStaked ?? 0n;
  const tvlB = staking.poolB?.totalStaked ?? 0n;
  const tvlTotal = tvlA + tvlB;
  const apyA = tvlA > 0n ? safeNumber(Number((staking.poolA?.rewardRate ?? 0n) * 31_536_000n * 10_000n) / Number(tvlA) / 100) : 0;
  const apyB = tvlB > 0n ? safeNumber(Number((staking.poolB?.rewardRate ?? 0n) * 31_536_000n * 10_000n) / Number(tvlB) / 100) : 0;

  const userA = parseUserInfoTuple(staking.userA);
  const userB = parseUserInfoTuple(staking.userB);
  const yourStaked = userA.staked + userB.staked;
  const yourRewards = userA.rewards + userB.rewards;

  const dailyA = tvlA > 0n ? ((userA.staked * (staking.poolA?.rewardRate ?? 0n)) / tvlA) * 86_400n : 0n;
  const dailyB = tvlB > 0n ? ((userB.staked * (staking.poolB?.rewardRate ?? 0n)) / tvlB) * 86_400n : 0n;
  const dailyEarnings = dailyA + dailyB;

  const globalRisk = riskLevel(staking.globalBadDebt, tvlTotal);
  const noPosition = Boolean(address) && !loading && yourStaked === 0n;

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="rounded-2xl border border-zinc-800 bg-gradient-to-b from-zinc-950 to-zinc-900/60 p-4 transition hover:border-zinc-700 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-zinc-100 sm:text-xl">Dashboard</h1>
            <div className="text-xs text-zinc-400">状态: {staking.status}</div>
          </div>
          <div className={`shrink-0 text-sm font-semibold ${globalRisk.tone}`}>Risk Level: {globalRisk.label}</div>
        </div>

        {!address && (
          <p className="mt-4 rounded-xl border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-400">连接钱包以查看仓位与收益。</p>
        )}

        {loading && address ? (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : address && noPosition ? (
          <div className="mt-4 rounded-xl border border-dashed border-zinc-600 bg-zinc-900/40 px-4 py-10 text-center">
            <p className="text-base font-medium text-zinc-200">Start earning by staking in Pool A or Pool B</p>
            <p className="mt-2 text-sm text-zinc-500">Connect a wallet with positions to see balances, APY, and estimated daily rewards here.</p>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="min-w-0 rounded-xl border border-zinc-800 bg-zinc-950 p-4">
              <div className="text-xs text-zinc-400">Your Position</div>
              <div className="mt-1 break-words text-base font-semibold text-zinc-100 sm:text-lg">
                {formatTokenWithUsd(userA.staked, "TokenA", MOCK_USD_PRICE_TOKEN_A)}
                <span className="mt-1 block text-sm font-normal text-zinc-500">+ {formatTokenWithUsd(userB.staked, "TokenB", MOCK_USD_PRICE_TOKEN_B)}</span>
              </div>
            </div>
            <div className="min-w-0 rounded-xl border border-zinc-800 bg-zinc-950 p-4">
              <div className="text-xs text-zinc-400">Your Rewards (claimable)</div>
              <div className="mt-1 break-words text-base font-semibold text-emerald-300 sm:text-lg">{formatTokenWithUsd(yourRewards, "TokenB", MOCK_USD_PRICE_TOKEN_B)}</div>
              <div className="mt-1 text-xs text-zinc-500">Pool A + Pool B</div>
            </div>
            <div className="min-w-0 rounded-xl border border-zinc-800 bg-zinc-950 p-4">
              <div className="text-xs text-zinc-400">Estimated APY</div>
              <div className="mt-1 text-base font-semibold sm:text-lg">{safeNumber((apyA + apyB) / 2).toFixed(2)}%</div>
              <div className="mt-1 text-xs text-zinc-500">Based on current rewardRate</div>
            </div>
            <div className="min-w-0 rounded-xl border border-zinc-800 bg-zinc-950 p-4">
              <div className="text-xs text-zinc-400">Daily Earnings (est.)</div>
              <div className="mt-1 break-words text-base font-semibold sm:text-lg">{formatTokenWithUsd(dailyEarnings, "TokenB", MOCK_USD_PRICE_TOKEN_B)}</div>
              <div className="mt-1 text-xs text-zinc-500">Proportional to your stake</div>
            </div>
          </div>
        )}
      </div>

      <AirdropCard onClaimed={() => staking.refetchAll()} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="min-w-0 rounded-2xl border border-zinc-800 bg-gradient-to-b from-zinc-950 to-zinc-900/60 p-4 transition hover:border-zinc-700 sm:p-5">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="font-semibold text-zinc-100">Pool A</h2>
            <div className="shrink-0 text-xs text-zinc-400">APY: {safeNumber(apyA).toFixed(2)}%</div>
          </div>
          {loading && address ? (
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <CardSkeleton />
              <CardSkeleton />
            </div>
          ) : !address ? (
            <p className="mt-3 text-sm text-zinc-500">—</p>
          ) : noPosition ? (
            <p className="mt-3 text-sm text-zinc-500">No position in Pool A</p>
          ) : (
            <div className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div className="min-w-0 rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                <div className="text-xs text-zinc-400">Your stake</div>
                <div className="mt-1 break-words font-semibold text-zinc-200">{formatTokenWithUsd(userA.staked, "TokenA", MOCK_USD_PRICE_TOKEN_A)}</div>
              </div>
              <div className="min-w-0 rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                <div className="text-xs text-zinc-400">Your rewards</div>
                <div className="mt-1 break-words font-semibold text-emerald-300">{formatTokenWithUsd(userA.rewards, "TokenB", MOCK_USD_PRICE_TOKEN_B)}</div>
              </div>
              <div className="min-w-0 rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                <div className="text-xs text-zinc-400">TVL</div>
                <div className="mt-1 break-words font-semibold">{formatToken(tvlA)}</div>
              </div>
              <div className="min-w-0 rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                <div className="text-xs text-zinc-400">Daily earnings (est.)</div>
                <div className="mt-1 break-words font-semibold">{formatTokenWithUsd(dailyA, "TokenB", MOCK_USD_PRICE_TOKEN_B)}</div>
              </div>
            </div>
          )}
        </div>

        <div className="min-w-0 rounded-2xl border border-zinc-800 bg-gradient-to-b from-zinc-950 to-zinc-900/60 p-4 transition hover:border-zinc-700 sm:p-5">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="font-semibold text-zinc-100">Pool B</h2>
            <div className="shrink-0 text-xs text-zinc-400">APY: {safeNumber(apyB).toFixed(2)}%</div>
          </div>
          {loading && address ? (
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <CardSkeleton />
              <CardSkeleton />
            </div>
          ) : !address ? (
            <p className="mt-3 text-sm text-zinc-500">—</p>
          ) : noPosition ? (
            <p className="mt-3 text-sm text-zinc-500">No position in Pool B</p>
          ) : (
            <div className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div className="min-w-0 rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                <div className="text-xs text-zinc-400">Your stake</div>
                <div className="mt-1 break-words font-semibold text-zinc-200">{formatTokenWithUsd(userB.staked, "TokenB", MOCK_USD_PRICE_TOKEN_B)}</div>
              </div>
              <div className="min-w-0 rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                <div className="text-xs text-zinc-400">Your rewards</div>
                <div className="mt-1 break-words font-semibold text-emerald-300">{formatTokenWithUsd(userB.rewards, "TokenB", MOCK_USD_PRICE_TOKEN_B)}</div>
              </div>
              <div className="min-w-0 rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                <div className="text-xs text-zinc-400">TVL</div>
                <div className="mt-1 break-words font-semibold">{formatToken(tvlB)}</div>
              </div>
              <div className="min-w-0 rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                <div className="text-xs text-zinc-400">Daily earnings (est.)</div>
                <div className="mt-1 break-words font-semibold">{formatTokenWithUsd(dailyB, "TokenB", MOCK_USD_PRICE_TOKEN_B)}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
