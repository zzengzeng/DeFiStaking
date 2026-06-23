"use client";

import { useMemo } from "react";
import { useAccount, useReadContract, useWriteContract } from "wagmi";

import { dualPoolStakingAbi } from "@/contracts/abis/dualPoolStaking";
import { erc20Abi } from "@/contracts/abis/erc20";
import { contractAddresses } from "@/contracts/addresses";
import { useStaking } from "@/hooks/useStaking";
import {
  classifyForceClaimLiquidity,
  computeProportionalPay,
  estimateForceClaimSpendable,
  type ForceClaimLiquidityStatus,
} from "@/lib/forceClaimLiquidity";

export type ForceClaimBlockReason =
  | "notAvailable"
  | "paused"
  | "emergency"
  | "cooldown"
  | "noRewards"
  | "zeroLiquidity"
  | "liquidityUnknown";

/** 跨池紧急领取：仅 shutdown 或存在 badDebt 时链上允许。 */
export function useForceClaimAll() {
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const staking = useStaking();

  const rewardsA = staking.pendingRewardA;
  const rewardsB = staking.pendingRewardB;
  const totalRewards = rewardsA + rewardsB;

  const tokenB = staking.poolB?.stakingToken;
  const { data: tokenBBalance } = useReadContract({
    address: tokenB,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [contractAddresses.staking],
    query: { enabled: Boolean(tokenB) },
  });

  const liquidity = useMemo(() => {
    if (tokenBBalance === undefined) {
      return {
        spendableRemain: null as bigint | null,
        estimatedPayA: 0n,
        estimatedPayB: 0n,
        estimatedPayTotal: 0n,
        status: "unknown" as ForceClaimLiquidityStatus,
      };
    }
    const spendableRemain = estimateForceClaimSpendable(
      tokenBBalance,
      staking.poolB?.totalStaked ?? 0n,
      staking.unclaimedFeesB,
    );
    const { payA, payB } = computeProportionalPay(rewardsA, rewardsB, spendableRemain);
    const estimatedPayTotal = payA + payB;
    const status = classifyForceClaimLiquidity(totalRewards, estimatedPayTotal, spendableRemain);
    return {
      spendableRemain,
      estimatedPayA: payA,
      estimatedPayB: payB,
      estimatedPayTotal,
      status,
    };
  }, [tokenBBalance, staking.poolB?.totalStaked, staking.unclaimedFeesB, rewardsA, rewardsB, totalRewards]);

  const pathAvailable = staking.status === "SHUTDOWN" || staking.globalBadDebt > 0n;
  const now = BigInt(Math.floor(Date.now() / 1000));
  const claimCooldownRemainingSec =
    !address || staking.lastClaimTime === 0n || now >= staking.lastClaimTime + staking.claimCooldown
      ? 0n
      : staking.lastClaimTime + staking.claimCooldown - now;

  const liquidityBlocksClaim =
    pathAvailable && totalRewards > 0n && (liquidity.status === "zero" || liquidity.status === "unknown");

  const canForceClaimAll =
    pathAvailable &&
    staking.status !== "PAUSED" &&
    staking.status !== "EMERGENCY" &&
    claimCooldownRemainingSec === 0n &&
    totalRewards > 0n &&
    !liquidityBlocksClaim;

  const forceClaimBlockReason: ForceClaimBlockReason | null = !pathAvailable
    ? "notAvailable"
    : staking.status === "PAUSED"
      ? "paused"
      : staking.status === "EMERGENCY"
        ? "emergency"
        : claimCooldownRemainingSec > 0n
          ? "cooldown"
          : totalRewards === 0n
            ? "noRewards"
            : liquidity.status === "zero"
              ? "zeroLiquidity"
              : liquidity.status === "unknown"
                ? "liquidityUnknown"
                : null;

  const needsLiquidityConfirm = liquidity.status === "partial";

  const writeForceClaimAll = () =>
    writeContractAsync({
      abi: dualPoolStakingAbi,
      address: contractAddresses.staking,
      functionName: "forceClaimAll",
      account: address,
    });

  return {
    pathAvailable,
    canForceClaimAll,
    forceClaimBlockReason,
    claimCooldownRemainingSec,
    totalRewards,
    rewardsA,
    rewardsB,
    spendableRemain: liquidity.spendableRemain,
    estimatedPayA: liquidity.estimatedPayA,
    estimatedPayB: liquidity.estimatedPayB,
    estimatedPayTotal: liquidity.estimatedPayTotal,
    liquidityStatus: liquidity.status,
    needsLiquidityConfirm,
    writeForceClaimAll,
    refetch: staking.refetchAll,
  };
}
