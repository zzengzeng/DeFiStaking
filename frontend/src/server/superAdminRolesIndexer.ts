import { getAddress } from "viem";

import { dualPoolSuperAdminAbi } from "@/contracts/abis/dualPoolSuperAdmin";
import { getSuperAdminDeployBlock, isSuperAdminConfigured, superAdminAddresses } from "@/contracts/addresses";
import { enrichWithBlockTimestamps } from "@/lib/enrichBlockTimestamps";
import { fetchRoleChangeLogs, type RoleKeyByBytes } from "@/lib/superAdminRolesQuery";
import { withIndexerRpc } from "@/lib/serverRpc";
import type { RoleChangeEvent, RoleHolderEntry, SuperAdminRoleKey, SuperAdminRolesSnapshot } from "@/types/superAdminRoles";

/**
 * 从合约 view 读取三个 role 的 bytes32 值，构造 bytes32 → role key 映射。
 * 使用 `multicall` 将 3 次 `eth_call` 合并为 1 次，降低公共节点压力。
 */
async function readRoleKeys(client: Parameters<typeof fetchRoleChangeLogs>[0], address: `0x${string}`): Promise<RoleKeyByBytes> {
  const results = await client.multicall({
    contracts: [
      { address, abi: dualPoolSuperAdminAbi, functionName: "DEFAULT_ADMIN_ROLE" },
      { address, abi: dualPoolSuperAdminAbi, functionName: "ADMIN_ROLE" },
      { address, abi: dualPoolSuperAdminAbi, functionName: "OPERATOR_ROLE" },
    ],
  });

  const [superAdminRole, adminRole, operatorRole] = results.map(
    (r) => r.result as `0x${string}`,
  );

  const out: RoleKeyByBytes = {};
  out[superAdminRole.toLowerCase() as `0x${string}`] = "superAdmin";
  out[adminRole.toLowerCase() as `0x${string}`] = "admin";
  out[operatorRole.toLowerCase() as `0x${string}`] = "operator";
  return out;
}

/**
 * 按时间顺序回放 RoleGranted / RoleRevoked 事件，得到当前每个地址持有的角色集合。
 * 事件列表已经按 (blockNumber desc, logIndex desc) 排序；倒序回放即可取到"最后状态"。
 */
function computeCurrentHolders(events: RoleChangeEvent[]): {
  holders: RoleHolderEntry[];
  counts: SuperAdminRolesSnapshot["counts"];
} {
  // 每个地址当前持有的角色 Set（以最新事件为准）
  const holderMap = new Map<string, {
    address: `0x${string}`;
    roles: Set<SuperAdminRoleKey>;
    lastChangedAt: string;
    lastChangedBlock: string;
  }>();

  // 按 block asc, logIndex asc 回放（现有事件已经倒序，反转即可）
  const ordered = [...events].reverse();
  for (const e of ordered) {
    const key = e.account.toLowerCase();
    let rec = holderMap.get(key);
    if (!rec) {
      rec = {
        address: getAddress(e.account),
        roles: new Set(),
        lastChangedAt: e.blockTimestamp,
        lastChangedBlock: e.blockNumber,
      };
      holderMap.set(key, rec);
    } else {
      // 更新为最新一次事件的时间（由于是正序回放，总是覆盖）
      rec.lastChangedAt = e.blockTimestamp;
      rec.lastChangedBlock = e.blockNumber;
    }
    if (e.granted) {
      rec.roles.add(e.role);
    } else {
      rec.roles.delete(e.role);
    }
  }

  const holders: RoleHolderEntry[] = [];
  const counts = { superAdmin: 0, admin: 0, operator: 0 };
  for (const rec of holderMap.values()) {
    if (rec.roles.size === 0) continue;
    const roles = Array.from(rec.roles);
    holders.push({
      address: rec.address,
      roles,
      lastChangedAt: rec.lastChangedAt,
      lastChangedBlock: rec.lastChangedBlock,
    });
    for (const r of roles) counts[r]++;
  }

  // 按时间倒序；时间相同时按地址字典序
  holders.sort((a, b) => {
    const t = BigInt(b.lastChangedAt) - BigInt(a.lastChangedAt);
    if (t !== 0n) return Number(t);
    return a.address.localeCompare(b.address);
  });

  return { holders, counts };
}

/**
 * 索引 SuperAdmin 合约的角色变更事件，返回当前持有者快照。
 * 未配置合约时返回空快照。
 */
export async function indexSuperAdminRoles(chainId: number): Promise<SuperAdminRolesSnapshot> {
  const address = superAdminAddresses.superAdmin;
  if (!isSuperAdminConfigured()) {
    return {
      holders: [],
      counts: { superAdmin: 0, admin: 0, operator: 0 },
      headBlockNumber: "0",
      fromBlock: "0",
    };
  }

  const fromBlock = getSuperAdminDeployBlock(chainId);

  return withIndexerRpc(chainId, async (client) => {
    const [roleKeys, headBlock] = await Promise.all([
      readRoleKeys(client, address),
      client.getBlockNumber(),
    ]);

    const raw = await fetchRoleChangeLogs(client, address, fromBlock, roleKeys);
    const enriched = await enrichWithBlockTimestamps(client, raw);

    const { holders, counts } = computeCurrentHolders(enriched);
    return {
      holders,
      counts,
      headBlockNumber: headBlock.toString(),
      fromBlock: fromBlock.toString(),
    };
  });
}
