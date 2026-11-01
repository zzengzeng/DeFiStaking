/**
 * SuperAdmin 合约角色持有者索引结果的类型。
 *
 * 来源：链上 `RoleGranted(role, account, sender)` / `RoleRevoked(role, account, sender)` 事件。
 * indexer 回放事件后计算每个角色的当前持有者集合（按最后状态）。
 */

/** 角色键，与合约常量一一对应 */
export type SuperAdminRoleKey = "superAdmin" | "admin" | "operator";

/** 单个持有者条目 */
export type RoleHolderEntry = {
  /** 持有者地址（checksum） */
  address: `0x${string}`;
  /** 该地址持有的角色集合 */
  roles: SuperAdminRoleKey[];
  /** 最后一次事件（grant 或 revoke）的时间戳（Unix 秒），用于排序 */
  lastChangedAt: string;
  /** 最后一次事件所在的区块号 */
  lastChangedBlock: string;
};

/** indexer 返回的完整结果 */
export type SuperAdminRolesSnapshot = {
  /** 当前持有者列表（按 lastChangedAt 倒序） */
  holders: RoleHolderEntry[];
  /** 每个角色的持有者数量 */
  counts: {
    superAdmin: number;
    admin: number;
    operator: number;
  };
  /** 索引时的链上最新块 */
  headBlockNumber: string;
  /** 索引起始块 */
  fromBlock: string;
};

/** 单次角色变更事件的原始记录（debug / 审计用） */
export type RoleChangeEvent = {
  role: SuperAdminRoleKey;
  account: `0x${string}`;
  sender: `0x${string}`;
  granted: boolean;
  blockNumber: string;
  blockTimestamp: string;
  transactionHash: `0x${string}`;
  logIndex: number;
};
