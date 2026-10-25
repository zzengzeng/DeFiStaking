"use client";

import { useMemo } from "react";
import { useAccount, useReadContract } from "wagmi";

import { dualPoolSuperAdminAbi } from "@/contracts/abis/dualPoolSuperAdmin";
import { superAdminAddresses } from "@/contracts/addresses";

/**
 * SuperAdmin 合约的角色读取 hook。
 * - 默认查询当前连接钱包的角色
 * - 也可传入 `target` 查任意地址的角色
 */
export type UseSuperAdminRolesOpts = {
  target?: `0x${string}`;
};

export type SuperAdminRoleSnapshot = {
  /** SuperAdmin 合约地址，未配置时为零 */
  address: `0x${string}`;
  /** 合约是否已配置（非 zero） */
  configured: boolean;
  /** 被查询的地址（默认：当前连接钱包） */
  account: `0x${string}` | undefined;
  /** DEFAULT_ADMIN_ROLE（0x00）- 超级管理员 */
  isDefaultAdmin: boolean;
  /** ADMIN_ROLE - 普通管理员 */
  isAdmin: boolean;
  /** OPERATOR_ROLE - 运营 */
  isOperator: boolean;
  /** Ownable.owner() */
  owner: `0x${string}` | undefined;
  /** 任意一个角色仍在加载 */
  isLoading: boolean;
  /** 任一查询出错 */
  error: Error | undefined;
  /** 强制刷新所有角色 */
  refetch: () => Promise<void>;
};

const ZERO = "0x0000000000000000000000000000000000000000" as const;

export function useSuperAdminRoles(opts: UseSuperAdminRolesOpts = {}): SuperAdminRoleSnapshot {
  const contractAddress = superAdminAddresses.superAdmin;
  const configured = contractAddress !== ZERO;

  const { address: walletAddress } = useAccount();
  const account = (opts.target ?? walletAddress) as `0x${string}` | undefined;
  const abi = dualPoolSuperAdminAbi;

  const canQuery = configured && Boolean(account);

  const defaultAdminRoleRead = useReadContract({
    address: contractAddress,
    abi,
    functionName: "DEFAULT_ADMIN_ROLE",
    query: { enabled: configured, staleTime: 300_000, refetchOnWindowFocus: false },
  });

  const adminRoleRead = useReadContract({
    address: contractAddress,
    abi,
    functionName: "ADMIN_ROLE",
    query: { enabled: configured, staleTime: 300_000, refetchOnWindowFocus: false },
  });

  const operatorRoleRead = useReadContract({
    address: contractAddress,
    abi,
    functionName: "OPERATOR_ROLE",
    query: { enabled: configured, staleTime: 300_000, refetchOnWindowFocus: false },
  });

  const ownerRead = useReadContract({
    address: contractAddress,
    abi,
    functionName: "owner",
    query: { enabled: configured, staleTime: 300_000, refetchOnWindowFocus: false },
  });

  const defaultAdminRole = defaultAdminRoleRead.data as `0x${string}` | undefined;
  const adminRole = adminRoleRead.data as `0x${string}` | undefined;
  const operatorRole = operatorRoleRead.data as `0x${string}` | undefined;

  const hasDefaultRead = useReadContract({
    address: contractAddress,
    abi,
    functionName: "hasRole",
    args: defaultAdminRole && account ? [defaultAdminRole, account] : undefined,
    query: {
      enabled: canQuery && Boolean(defaultAdminRole),
      staleTime: 15_000,
      refetchOnWindowFocus: false,
    },
  });

  const hasAdminRead = useReadContract({
    address: contractAddress,
    abi,
    functionName: "hasRole",
    args: adminRole && account ? [adminRole, account] : undefined,
    query: {
      enabled: canQuery && Boolean(adminRole),
      staleTime: 15_000,
      refetchOnWindowFocus: false,
    },
  });

  const hasOperatorRead = useReadContract({
    address: contractAddress,
    abi,
    functionName: "hasRole",
    args: operatorRole && account ? [operatorRole, account] : undefined,
    query: {
      enabled: canQuery && Boolean(operatorRole),
      staleTime: 15_000,
      refetchOnWindowFocus: false,
    },
  });

  const isLoading =
    !configured ||
    defaultAdminRoleRead.isLoading ||
    adminRoleRead.isLoading ||
    operatorRoleRead.isLoading ||
    ownerRead.isLoading ||
    (canQuery && (hasDefaultRead.isLoading || hasAdminRead.isLoading || hasOperatorRead.isLoading));

  const error = useMemo(
    () =>
      (defaultAdminRoleRead.error ??
        adminRoleRead.error ??
        operatorRoleRead.error ??
        ownerRead.error ??
        (hasDefaultRead.error as Error | undefined) ??
        (hasAdminRead.error as Error | undefined) ??
        (hasOperatorRead.error as Error | undefined)) as Error | undefined,
    [
      defaultAdminRoleRead.error,
      adminRoleRead.error,
      operatorRoleRead.error,
      ownerRead.error,
      hasDefaultRead.error,
      hasAdminRead.error,
      hasOperatorRead.error,
    ],
  );

  const refetch = async () => {
    await Promise.all([
      defaultAdminRoleRead.refetch(),
      adminRoleRead.refetch(),
      operatorRoleRead.refetch(),
      ownerRead.refetch(),
      hasDefaultRead.refetch(),
      hasAdminRead.refetch(),
      hasOperatorRead.refetch(),
    ]);
  };

  return {
    address: contractAddress,
    configured,
    account,
    isDefaultAdmin: Boolean(hasDefaultRead.data),
    isAdmin: Boolean(hasAdminRead.data),
    isOperator: Boolean(hasOperatorRead.data),
    owner: ownerRead.data as `0x${string}` | undefined,
    isLoading,
    error,
    refetch,
  };
}
