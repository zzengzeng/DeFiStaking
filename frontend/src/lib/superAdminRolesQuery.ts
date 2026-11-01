import {
  decodeEventLog,
  getAddress,
  parseAbiItem,
  type PublicClient,
} from "viem";

import { getLogsInChunks } from "@/lib/chunkedGetLogs";
import type { RoleChangeEvent } from "@/types/superAdminRoles";

/** 合约 `RoleGranted` 事件 */
export const roleGrantedEvent = parseAbiItem(
  "event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender)",
);

/** 合约 `RoleRevoked` 事件 */
export const roleRevokedEvent = parseAbiItem(
  "event RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender)",
);

const ROLE_EVENT_ABI = [roleGrantedEvent, roleRevokedEvent] as const;

type DecodedRoleLog = {
  eventName: "RoleGranted" | "RoleRevoked";
  roleBytes: `0x${string}`;
  account: `0x${string}`;
  sender: `0x${string}`;
};

/** 从日志解码 RoleGranted / RoleRevoked 字段（只解析，不做 role key 映射）。 */
function decodeRoleLog(log: { topics: readonly `0x${string}`[]; data: `0x${string}` }): DecodedRoleLog | null {
  try {
    const decoded = decodeEventLog({
      abi: ROLE_EVENT_ABI,
      data: log.data,
      // 由 getLogs 返回的 topics 形状与 decodeEventLog 预期一致，但 TS 类型过严
      topics: log.topics as unknown as [],
    });
    return {
      eventName: decoded.eventName as "RoleGranted" | "RoleRevoked",
      roleBytes: (decoded.args as { role: `0x${string}` }).role,
      account: getAddress((decoded.args as { account: `0x${string}` }).account),
      sender: getAddress((decoded.args as { sender: `0x${string}` }).sender),
    };
  } catch {
    return null;
  }
}

/**
 * bytes32 → role key 映射表。
 * indexer 从合约 view 读取后构造。
 */
export type RoleKeyByBytes = Record<`0x${string}`, import("@/types/superAdminRoles").SuperAdminRoleKey>;

/**
 * 拉取 SuperAdmin 合约上的所有 RoleGranted / RoleRevoked 日志。
 * `roleKeys` 是 bytes32 → role key 的映射，由调用方通过合约 view 读取后传入。
 * 未知 role 直接忽略。
 */
export async function fetchRoleChangeLogs(
  client: PublicClient,
  superAdminAddress: `0x${string}`,
  fromBlock: bigint,
  roleKeys: RoleKeyByBytes,
): Promise<RoleChangeEvent[]> {
  const addr = getAddress(superAdminAddress);

  // 直接拉合约上所有日志，客户端解码筛选 RoleGranted / RoleRevoked。
  // 角色合约事件稀少，无需精确 topic 过滤。
  const logs = await getLogsInChunks(client, fromBlock, (from, to) =>
    client.getLogs({
      address: addr,
      fromBlock: from,
      toBlock: to,
    }),
  );

  const rows: RoleChangeEvent[] = [];
  for (const log of logs) {
    if (log.transactionHash == null || log.logIndex == null) continue;
    if (!log.topics || log.topics.length === 0) continue;
    const decoded = decodeRoleLog(log);
    if (!decoded) continue;
    const roleKey = roleKeys[decoded.roleBytes.toLowerCase() as `0x${string}`];
    if (!roleKey) continue;

    rows.push({
      role: roleKey,
      account: decoded.account,
      sender: decoded.sender,
      granted: decoded.eventName === "RoleGranted",
      blockNumber: (log.blockNumber ?? 0n).toString(),
      blockTimestamp: "0",
      transactionHash: log.transactionHash,
      logIndex: log.logIndex,
    });
  }

  return rows.sort((a, b) => {
    const bn = BigInt(b.blockNumber) - BigInt(a.blockNumber);
    if (bn !== 0n) return Number(bn);
    return b.logIndex - a.logIndex;
  });
}
