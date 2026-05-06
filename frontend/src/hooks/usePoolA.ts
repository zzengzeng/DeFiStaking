"use client";

import { parseUnits } from "viem";
import { useAccount, useReadContract, useWriteContract } from "wagmi";

import { dualPoolStakingAbi } from "@/contracts/abis/dualPoolStaking";
import { erc20Abi } from "@/contracts/abis/erc20";
import { contractAddresses } from "@/contracts/addresses";
import { useStaking } from "@/hooks/useStaking";
import { parseUserInfoTuple } from "@/lib/userInfo";

/** Pool A：读状态 + 原始写交易（由 UI 层 useWriteWithStatus 包装 toast / modal） */
export function usePoolA() {
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const staking = useStaking();

  const {
    data: tokenABalance = 0n,
    refetch: refetchTokenABalance,
  } = useReadContract({
    address: contractAddresses.tokenA,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) },
  });

  const canStake = staking.status === "NORMAL";
  const canWithdraw = staking.status === "NORMAL" || staking.status === "SHUTDOWN";
  const canEmergencyWithdraw = staking.status === "EMERGENCY";
  const now = BigInt(Math.floor(Date.now() / 1000));
  const claimCooldownRemainingSec =
    !address || staking.lastClaimTime === 0n || now >= staking.lastClaimTime + staking.claimCooldown
      ? 0n
      : staking.lastClaimTime + staking.claimCooldown - now;
  const pendingRewardsA = parseUserInfoTuple(staking.userA).rewards;
  const canClaim =
    (staking.status === "NORMAL" || staking.status === "SHUTDOWN") &&
    staking.globalBadDebt === 0n &&
    claimCooldownRemainingSec === 0n &&
    pendingRewardsA > staking.minClaimAmount;
  const claimDisabledReason =
    canClaim
      ? null
      : staking.status !== "NORMAL" && staking.status !== "SHUTDOWN"
        ? "Claim 仅在 NORMAL / SHUTDOWN 可用"
        : staking.globalBadDebt > 0n
          ? "存在 badDebt，暂不可 claim"
          : claimCooldownRemainingSec > 0n
            ? "Claim 冷却中"
            : "暂无可领取奖励（链上未结算）";
  const emergencyDisabledReason = canEmergencyWithdraw ? null : "仅在 EMERGENCY 模式可用";

  const toAmount = (value: string) => parseUnits(value || "0", 18);

  const writeApproveTokenA = (amountWei: bigint) =>
    writeContractAsync({
      abi: erc20Abi,
      address: contractAddresses.tokenA,
      functionName: "approve",
      args: [contractAddresses.staking, amountWei],
      account: address,
    });

  const writeStakeA = (value: string) => {
    const amount = toAmount(value);
    return writeContractAsync({
      abi: dualPoolStakingAbi,
      address: contractAddresses.staking,
      functionName: "stakeA",
      args: [amount],
      account: address,
    });
  };

  const writeWithdrawA = (value: string) => {
    const amount = toAmount(value);
    return writeContractAsync({
      abi: dualPoolStakingAbi,
      address: contractAddresses.staking,
      functionName: "withdrawA",
      args: [amount],
      account: address,
    });
  };

  const writeClaimA = () =>
    writeContractAsync({
      abi: dualPoolStakingAbi,
      address: contractAddresses.staking,
      functionName: "claimA",
      account: address,
    });

  const writeEmergencyWithdrawA = () =>
    writeContractAsync({
      abi: dualPoolStakingAbi,
      address: contractAddresses.staking,
      functionName: "emergencyWithdrawA",
      account: address,
    });

  const refetchWalletAndPool = async () => {
    await Promise.all([refetchTokenABalance(), staking.refetchAll()]);
  };

  return {
    ...staking,
    canStake,
    canWithdraw,
    canEmergencyWithdraw,
    canClaim,
    claimDisabledReason,
    emergencyDisabledReason,
    claimCooldownRemainingSec,
    tokenABalance,
    writeApproveTokenA,
    writeStakeA,
    writeWithdrawA,
    writeClaimA,
    writeEmergencyWithdrawA,
    refetchWalletAndPool,
  };
}
