"use client";

import { useAccount, useReadContract } from "wagmi";

import { dualPoolStakingAbi } from "@/contracts/abis/dualPoolStaking";
import { contractAddresses } from "@/contracts/addresses";

const STAKING = contractAddresses.staking;
const ABI = dualPoolStakingAbi;

/**
 * 链上 AccessControl：`ADMIN_ROLE`（参数/时间锁/取消/解冻等）、`OPERATOR_ROLE`（暂停、注资 emission、紧急模式等）。
 * 普通用户两者皆为 false。
 */
export function useProtocolRoles() {
  const { address } = useAccount();

  const adminRoleRead = useReadContract({
    address: STAKING,
    abi: ABI,
    functionName: "ADMIN_ROLE",
    query: { staleTime: 60_000, refetchOnWindowFocus: false },
  });
  const operatorRoleRead = useReadContract({
    address: STAKING,
    abi: ABI,
    functionName: "OPERATOR_ROLE",
    query: { staleTime: 60_000, refetchOnWindowFocus: false },
  });

  const adminRole = adminRoleRead.data;
  const operatorRole = operatorRoleRead.data;

  const adminMemberRead = useReadContract({
    address: STAKING,
    abi: ABI,
    functionName: "hasRole",
    args: adminRole && address ? [adminRole, address] : undefined,
    query: {
      enabled: Boolean(adminRole && address),
      staleTime: 15_000,
      refetchOnWindowFocus: false,
    },
  });
  const operatorMemberRead = useReadContract({
    address: STAKING,
    abi: ABI,
    functionName: "hasRole",
    args: operatorRole && address ? [operatorRole, address] : undefined,
    query: {
      enabled: Boolean(operatorRole && address),
      staleTime: 15_000,
      refetchOnWindowFocus: false,
    },
  });

  const isAdmin = Boolean(address && adminMemberRead.data === true);
  const isOperator = Boolean(address && operatorMemberRead.data === true);

  const refetchRoles = async () => {
    await Promise.all([
      adminRoleRead.refetch(),
      operatorRoleRead.refetch(),
      adminMemberRead.refetch(),
      operatorMemberRead.refetch(),
    ]);
  };

  const isLoading =
    adminRoleRead.isLoading ||
    operatorRoleRead.isLoading ||
    (Boolean(address) && (adminMemberRead.isLoading || operatorMemberRead.isLoading));

  return {
    address,
    isAdmin,
    isOperator,
    /** 可进入治理页：至少具备其一 */
    canAccessGovernance: isAdmin || isOperator,
    isLoading,
    refetchRoles,
  };
}
