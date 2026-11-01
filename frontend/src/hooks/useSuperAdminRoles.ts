"use client";

import { useMemo } from "react";
import { useAccount, useReadContracts } from "wagmi";

import { dualPoolSuperAdminAbi } from "@/contracts/abis/dualPoolSuperAdmin";
import { superAdminAddresses } from "@/contracts/addresses";

/**
 * SuperAdmin 合约的角色读取 hook。
 * - 默认查询当前连接钱包的角色
 * - 也可传入 `target` 查任意地址的角色
 *
 * 所有读取通过 `useReadContracts`（multicall）合并为 **1 次** `eth_call`，
 * 避免公共 RPC 节点因并发请求触发限流。
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
  /** 查询仍在加载 */
  isLoading: boolean;
  /** 查询出错 */
  error: Error | undefined;
  /** 强制刷新所有角色 */
  refetch: () => Promise<void>;
};

const ZERO = "0x0000000000000000000000000000000000000000" as const;

/** 合约上固定返回的 4 个视图函数，合并为一次 multicall。 */
const STATIC_READS = [
  { abi: dualPoolSuperAdminAbi, functionName: "DEFAULT_ADMIN_ROLE" },
  { abi: dualPoolSuperAdminAbi, functionName: "ADMIN_ROLE" },
  { abi: dualPoolSuperAdminAbi, functionName: "OPERATOR_ROLE" },
  { abi: dualPoolSuperAdminAbi, functionName: "owner" },
] as const;

export function useSuperAdminRoles(opts: UseSuperAdminRolesOpts = {}): SuperAdminRoleSnapshot {
  const contractAddress = superAdminAddresses.superAdmin;
  const configured = contractAddress !== ZERO;

  const { address: walletAddress } = useAccount();
  const account = (opts.target ?? walletAddress) as `0x${string}` | undefined;

  // ─── 第一层：4 个常量合并为 1 次 multicall ───────────────────────
  const staticResult = useReadContracts({
    contracts: STATIC_READS.map((c) => ({ ...c, address: contractAddress })),
    query: {
      enabled: configured,
      staleTime: 300_000,
      refetchOnWindowFocus: false,
    },
  });

  // multicall 返回的 data 与 STATIC_READS 同序
  const defaultAdminRole = staticResult.data?.[0]?.result as `0x${string}` | undefined;
  const adminRole = staticResult.data?.[1]?.result as `0x${string}` | undefined;
  const operatorRole = staticResult.data?.[2]?.result as `0x${string}` | undefined;
  const owner = staticResult.data?.[3]?.result as `0x${string}` | undefined;

  const staticReady = Boolean(defaultAdminRole && adminRole && operatorRole);

  // ─── 第二层：3 个 hasRole 合并为 1 次 multicall（依赖常量拿到 role bytes）───
  const hasRolesResult = useReadContracts({
    contracts: [
      {
        address: contractAddress,
        abi: dualPoolSuperAdminAbi,
        functionName: "hasRole",
        args: defaultAdminRole && account ? [defaultAdminRole, account] : undefined,
      },
      {
        address: contractAddress,
        abi: dualPoolSuperAdminAbi,
        functionName: "hasRole",
        args: adminRole && account ? [adminRole, account] : undefined,
      },
      {
        address: contractAddress,
        abi: dualPoolSuperAdminAbi,
        functionName: "hasRole",
        args: operatorRole && account ? [operatorRole, account] : undefined,
      },
    ],
    query: {
      enabled: configured && Boolean(account) && staticReady,
      staleTime: 15_000,
      refetchOnWindowFocus: false,
    },
  });

  const isDefaultAdmin = Boolean(hasRolesResult.data?.[0]?.result);
  const isAdmin = Boolean(hasRolesResult.data?.[1]?.result);
  const isOperator = Boolean(hasRolesResult.data?.[2]?.result);

  const isLoading = !configured || staticResult.isLoading || (!staticReady && configured) ||
    (configured && Boolean(account) && staticReady && hasRolesResult.isLoading);

  const error = useMemo(
    () => (staticResult.error ?? (hasRolesResult.error as Error | undefined)) as Error | undefined,
    [staticResult.error, hasRolesResult.error],
  );

  const refetch = async () => {
    await Promise.all([staticResult.refetch(), hasRolesResult.refetch()]);
  };

  return {
    address: contractAddress,
    configured,
    account,
    isDefaultAdmin,
    isAdmin,
    isOperator,
    owner,
    isLoading,
    error,
    refetch,
  };
}
