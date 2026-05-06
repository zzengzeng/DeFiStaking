"use client";

import { parseUnits } from "viem";
import { useAccount, useReadContract, useWriteContract } from "wagmi";

import { dualPoolStakingAbi } from "@/contracts/abis/dualPoolStaking";
import { erc20Abi } from "@/contracts/abis/erc20";
import { contractAddresses } from "@/contracts/addresses";
import { useStaking } from "@/hooks/useStaking";
import { parseUserInfoTuple } from "@/lib/userInfo";

const DAY = 24n * 60n * 60n;

function calcFeeBp(now: bigint, stakeTimestamp: bigint, unlockTime: bigint, withdrawFeeBP: bigint, midTermFeeBP: bigint) {
  if (now < unlockTime) return 0n;
  const stakedFor = now - stakeTimestamp;
  if (stakedFor < 90n * DAY) return withdrawFeeBP;
  if (stakedFor < 180n * DAY) return midTermFeeBP;
  return 0n;
}

/** Pool B：读状态 + 原始写交易（UI 层包装进度与确认弹窗） */
export function usePoolB() {
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const staking = useStaking();
  const now = BigInt(Math.floor(Date.now() / 1000));

  const {
    data: tokenBBalance = 0n,
    refetch: refetchTokenBBalance,
  } = useReadContract({
    address: contractAddresses.tokenB,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) },
  });

  const userA = parseUserInfoTuple(staking.userA);
  const userB = parseUserInfoTuple(staking.userB);

  const canStake = staking.status === "NORMAL";
  const canWithdraw = staking.status === "NORMAL" || staking.status === "SHUTDOWN";
  const claimCooldownRemainingSec =
    !address || staking.lastClaimTime === 0n || now >= staking.lastClaimTime + staking.claimCooldown
      ? 0n
      : staking.lastClaimTime + staking.claimCooldown - now;
  const canClaim =
    (staking.status === "NORMAL" || staking.status === "SHUTDOWN") &&
    staking.globalBadDebt === 0n &&
    claimCooldownRemainingSec === 0n &&
    userB.rewards > staking.minClaimAmount;
  const canEmergencyWithdraw = staking.status === "EMERGENCY";

  const activeFeeBp = calcFeeBp(now, staking.stakeTimestampB, staking.unlockTimeB, staking.withdrawFeeBP, staking.midTermFeeBP);

  const computeWithdrawPreview = (amount: bigint) => {
    const isLocked = now < staking.unlockTimeB;
    const feeBp = calcFeeBp(now, staking.stakeTimestampB, staking.unlockTimeB, staking.withdrawFeeBP, staking.midTermFeeBP);
    const penaltyBp = isLocked ? staking.penaltyfeeBP : 0n;
    const feeAmount = (amount * feeBp) / 10_000n;
    const penaltyAmount = (amount * penaltyBp) / 10_000n;
    const netAmount = amount - feeAmount - penaltyAmount;
    return { netAmount, feeAmount, penaltyAmount, feeBp, penaltyBp, isLocked };
  };

  const compoundPreview = {
    rewardAWei: userA.rewards,
    rewardBWei: userB.rewards,
    totalWei: userA.rewards + userB.rewards,
  };
  const canCompound = staking.status === "NORMAL" && compoundPreview.totalWei > 0n;

  const toAmount = (value: string) => parseUnits(value || "0", 18);

  const writeApproveTokenB = (amountWei: bigint) =>
    writeContractAsync({
      abi: erc20Abi,
      address: contractAddresses.tokenB,
      functionName: "approve",
      args: [contractAddresses.staking, amountWei],
      account: address,
    });

  const writeStakeB = (value: string) => {
    const amount = toAmount(value);
    return writeContractAsync({
      abi: dualPoolStakingAbi,
      address: contractAddresses.staking,
      functionName: "stakeB",
      args: [amount],
      account: address,
    });
  };

  const writeWithdrawB = (value: string) =>
    writeContractAsync({
      abi: dualPoolStakingAbi,
      address: contractAddresses.staking,
      functionName: "withdrawB",
      args: [toAmount(value)],
      account: address,
    });

  const writeClaimB = () =>
    writeContractAsync({
      abi: dualPoolStakingAbi,
      address: contractAddresses.staking,
      functionName: "claimB",
      account: address,
    });

  const writeCompoundB = () =>
    writeContractAsync({
      abi: dualPoolStakingAbi,
      address: contractAddresses.staking,
      functionName: "compoundB",
      account: address,
    });

  const writeEmergencyWithdrawB = () =>
    writeContractAsync({
      abi: dualPoolStakingAbi,
      address: contractAddresses.staking,
      functionName: "emergencyWithdrawB",
      account: address,
    });

  const refetchWalletAndPool = async () => {
    await Promise.all([refetchTokenBBalance(), staking.refetchAll()]);
  };

  return {
    ...staking,
    canStake,
    canWithdraw,
    canClaim,
    canEmergencyWithdraw,
    canCompound,
    compoundPreview,
    claimCooldownRemainingSec,
    activeFeeBp,
    computeWithdrawPreview,
    tokenBBalance,
    writeApproveTokenB,
    writeStakeB,
    writeWithdrawB,
    writeClaimB,
    writeCompoundB,
    writeEmergencyWithdrawB,
    refetchWalletAndPool,
  };
}
