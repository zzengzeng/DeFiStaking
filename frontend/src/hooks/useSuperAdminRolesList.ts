"use client";

import { useQuery } from "@tanstack/react-query";
import { useChainId } from "wagmi";

import { superAdminAddresses, isSuperAdminConfigured } from "@/contracts/addresses";
import type { SuperAdminRolesSnapshot } from "@/types/superAdminRoles";

/**
 * 通过 indexer API 查询 SuperAdmin 合约的角色持有者快照。
 * - 仅在 SuperAdmin 合约已配置（env 已设置）时启用。
 * - 默认 30s 轮询；可传入 `refreshInterval` 覆盖。
 */
export function useSuperAdminRolesList(options: {
  enabled?: boolean;
  refreshInterval?: number;
} = {}) {
  const { enabled = true, refreshInterval = 30_000 } = options;
  const chainId = useChainId();
  const configured = isSuperAdminConfigured();
  const address = superAdminAddresses.superAdmin;

  return useQuery({
    queryKey: ["super-admin-roles", chainId, address],
    queryFn: async (): Promise<SuperAdminRolesSnapshot & { error?: string }> => {
      try {
        const res = await fetch(`/api/super-admin/roles?chainId=${chainId}`);
        if (!res.ok) {
          return {
            holders: [],
            counts: { superAdmin: 0, admin: 0, operator: 0 },
            headBlockNumber: "0",
            fromBlock: "0",
            error: `HTTP ${res.status}`,
          };
        }
        return res.json();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        return {
          holders: [],
          counts: { superAdmin: 0, admin: 0, operator: 0 },
          headBlockNumber: "0",
          fromBlock: "0",
          error: msg,
        };
      }
    },
    enabled: configured && enabled,
    refetchInterval: refreshInterval,
    staleTime: 15_000,
  });
}
