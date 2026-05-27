"use client";

import { useAccount, useWriteContract } from "wagmi";

import { dualPoolStakingAbi } from "@/contracts/abis/dualPoolStaking";
import { contractAddresses } from "@/contracts/addresses";
import { useStaking } from "@/hooks/useStaking";
import { parseUserInfoTuple } from "@/lib/userInfo";

/** 跨池紧急领取：仅 shutdown 或存在 badDebt 时链上允许。 */
export function useForceClaimAll() {
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const staking = useStaking();

  const rewardsA = parseUserInfoTuple(staking.userA).rewards;
  const rewardsB = parseUserInfoTuple(staking.userB).rewards;
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

  const forceClaimDisabledReason = !pathAvailable
    ? "forceClaimAll 仅在 SHUTDOWN 或存在 badDebt 时可用；正常态请用 claimA / claimB"
    : staking.status === "PAUSED"
      ? "协议已暂停"
      : staking.status === "EMERGENCY"
        ? "紧急模式（未 shutdown）请先 emergencyWithdraw，shutdown 后再 forceClaimAll"
        : claimCooldownRemainingSec > 0n
          ? "领取冷却中"
          : totalRewards === 0n
            ? "暂无可领取奖励"
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
    forceClaimDisabledReason,
    claimCooldownRemainingSec,
    totalRewards,
    rewardsA,
    rewardsB,
    writeForceClaimAll,
    refetch: staking.refetchAll,
  };
}
