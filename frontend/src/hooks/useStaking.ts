"use client";

import { useMemo } from "react";
import type { ContractFunctionParameters } from "viem";
import { useAccount, useReadContracts } from "wagmi";

import { dualPoolStakingAbi } from "@/contracts/abis/dualPoolStaking";
import { contractAddresses } from "@/contracts/addresses";
import { type ProtocolStatus } from "@/store/useUiStore";

type PoolInfo = {
  stakingToken: `0x${string}`;
  totalStaked: bigint;
  rewardRate: bigint;
  lastUpdateTime: bigint;
  accRewardPerToken: bigint;
  availableRewards: bigint;
  periodFinish: bigint;
  badDebt: bigint;
  totalPending: bigint;
  dust: bigint;
  tvlCap: bigint;
  minStakeAmount: bigint;
  rewardDuration: bigint;
};

const STAKING = contractAddresses.staking;
const ABI = dualPoolStakingAbi;

/**
 * `poolA()` / `poolB()` 在 viem + `useReadContracts` 下有时会解码成**带索引的元组**（`result[0]`…），
 * 不一定带 `totalStaked` 等命名字段；UI 用 `poolA.totalStaked` 会得到 `undefined` → 显示为 0。
 * `userInfoA` 等处用 `userA[0]` 索引读取则不受影响。
 */
function normalizePoolInfo(raw: unknown): PoolInfo | undefined {
  if (raw === null || raw === undefined) return undefined;
  const r = raw as Record<string | number, unknown>;
  const totalStaked = r.totalStaked ?? r[1];
  if (typeof totalStaked !== "bigint") return undefined;
  const stakingToken = (r.stakingToken ?? r[0]) as `0x${string}`;
  return {
    stakingToken,
    totalStaked,
    rewardRate: (r.rewardRate ?? r[2]) as bigint,
    lastUpdateTime: (r.lastUpdateTime ?? r[3]) as bigint,
    accRewardPerToken: (r.accRewardPerToken ?? r[4]) as bigint,
    availableRewards: (r.availableRewards ?? r[5]) as bigint,
    periodFinish: (r.periodFinish ?? r[6]) as bigint,
    badDebt: (r.badDebt ?? r[7]) as bigint,
    totalPending: (r.totalPending ?? r[8]) as bigint,
    dust: (r.dust ?? r[9]) as bigint,
    tvlCap: (r.tvlCap ?? r[10]) as bigint,
    minStakeAmount: (r.minStakeAmount ?? r[11]) as bigint,
    rewardDuration: (r.rewardDuration ?? r[12]) as bigint,
  };
}

/** multicall 单行结果安全取值 */
function pick<T>(data: readonly unknown[] | undefined, index: number, fallback: T): T {
  const row = data?.[index] as { status: string; result?: unknown } | undefined;
  if (row?.status === "success" && row.result !== undefined) return row.result as T;
  return fallback;
}

/** 统一读取协议全局状态、池子状态与用户状态（单次 multicall，减少 RPC 往返）。 */
export function useStaking() {
  const { address } = useAccount();

  const contracts = useMemo((): readonly ContractFunctionParameters[] => {
    const base: ContractFunctionParameters[] = [
      { address: STAKING, abi: ABI, functionName: "poolA" },
      { address: STAKING, abi: ABI, functionName: "poolB" },
      { address: STAKING, abi: ABI, functionName: "paused" },
      { address: STAKING, abi: ABI, functionName: "emergencyMode" },
      { address: STAKING, abi: ABI, functionName: "shutdown" },
      { address: STAKING, abi: ABI, functionName: "lockDuration" },
      { address: STAKING, abi: ABI, functionName: "claimCooldown" },
      { address: STAKING, abi: ABI, functionName: "minClaimAmount" },
      { address: STAKING, abi: ABI, functionName: "withdrawFeeBP" },
      { address: STAKING, abi: ABI, functionName: "midTermFeeBP" },
      { address: STAKING, abi: ABI, functionName: "penaltyfeeBP" },
      { address: STAKING, abi: ABI, functionName: "unclaimedFeesB" },
    ];
    if (!address) return base;
    return [
      ...base,
      { address: STAKING, abi: ABI, functionName: "userInfoA", args: [address] },
      { address: STAKING, abi: ABI, functionName: "userInfoB", args: [address] },
      { address: STAKING, abi: ABI, functionName: "unlockTimeB", args: [address] },
      { address: STAKING, abi: ABI, functionName: "stakeTimestampB", args: [address] },
      { address: STAKING, abi: ABI, functionName: "lastClaimTime", args: [address] },
    ];
  }, [address]);

  const reads = useReadContracts({
    contracts,
    query: {
      staleTime: 15_000,
      refetchOnWindowFocus: false,
    },
  });

  const data = useMemo(() => {
    const d = reads.data;
    const poolA = normalizePoolInfo(pick(d, 0, undefined));
    const poolB = normalizePoolInfo(pick(d, 1, undefined));
    const paused = pick<boolean>(d, 2, false);
    const emergencyMode = pick<boolean>(d, 3, false);
    const shutdown = pick<boolean>(d, 4, false);
    const lockDuration = pick<bigint>(d, 5, 0n);
    const claimCooldown = pick<bigint>(d, 6, 0n);
    const minClaimAmount = pick<bigint>(d, 7, 0n);
    const withdrawFeeBP = pick<bigint>(d, 8, 0n);
    const midTermFeeBP = pick<bigint>(d, 9, 0n);
    const penaltyfeeBP = pick<bigint>(d, 10, 0n);
    const unclaimedFeesB = pick<bigint>(d, 11, 0n);

    const status: ProtocolStatus = shutdown ? "SHUTDOWN" : emergencyMode ? "EMERGENCY" : paused ? "PAUSED" : "NORMAL";
    const globalRequired = (poolA?.totalPending ?? 0n) + (poolB?.totalPending ?? 0n) + (poolA?.availableRewards ?? 0n) + (poolB?.availableRewards ?? 0n) + unclaimedFeesB + (poolA?.dust ?? 0n) + (poolB?.dust ?? 0n);
    const globalBadDebt = (poolA?.badDebt ?? 0n) + (poolB?.badDebt ?? 0n);

    const userA = address ? pick(d, 12, undefined) : undefined;
    const userB = address ? pick(d, 13, undefined) : undefined;
    const unlockTimeB = address ? pick<bigint>(d, 14, 0n) : 0n;
    const stakeTimestampB = address ? pick<bigint>(d, 15, 0n) : 0n;
    const lastClaimTime = address ? pick<bigint>(d, 16, 0n) : 0n;

    return {
      status,
      poolA,
      poolB,
      globalRequired,
      globalBadDebt,
      lockDuration,
      claimCooldown,
      minClaimAmount,
      withdrawFeeBP,
      midTermFeeBP,
      penaltyfeeBP,
      unclaimedFeesB,
      userA,
      userB,
      unlockTimeB,
      stakeTimestampB,
      lastClaimTime,
    };
  }, [address, reads.data]);

  return {
    ...data,
    /** 仅首次无数据时为 true；后台刷新请用 isFetching，勿用于全页骨架屏 */
    isLoading: reads.isLoading,
    isFetching: reads.isFetching,
    refetchAll: reads.refetch,
  };
}
