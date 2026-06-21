"use client";

import { useAccount, useWriteContract } from "wagmi";

import { dualPoolStakingAbi } from "@/contracts/abis/dualPoolStaking";
import { contractAddresses } from "@/contracts/addresses";
import { useStaking } from "@/hooks/useStaking";

export type ForceClaimBlockReason = "notAvailable" | "paused" | "emergency" | "cooldown" | "noRewards";

/** 跨池紧急领取：仅 shutdown 或存在 badDebt 时链上允许。 */
export function useForceClaimAll() {
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const staking = useStaking();

  const rewardsA = staking.pendingRewardA;
  const rewardsB = staking.pendingRewardB;
  const totalRewards = rewardsA + rewardsB;

  const pathAvailable = staking.status === "SHUTDOWN" || staking.globalBadDebt > 0n;
  const now = BigInt(Math.floor(Date.now() / 1000));
  const claimCooldownRemainingSec =
    !address || staking.lastClaimTime === 0n || now >= staking.lastClaimTime + staking.claimCooldown
      ? 0n
      : staking.lastClaimTime + staking.claimCooldown - now;

  const canForceClaimAll =
    pathAvailable &&
    staking.status !== "PAUSED" &&
    staking.status !== "EMERGENCY" &&
    claimCooldownRemainingSec === 0n &&
    totalRewards > 0n;

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
            : null;

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
    writeForceClaimAll,
    refetch: staking.refetchAll,
  };
}
