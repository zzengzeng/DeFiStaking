import { keccak256, toBytes } from "viem";

/** 与合约 timelock 排队使用的 opId 常量一致（需与 Governance 调用侧相同）。 */
export const TIMELOCK_GOVERNANCE_OP_IDS = {
  setLockDuration: keccak256(toBytes("SET_LOCK_DURATION")),
  setFees: keccak256(toBytes("SET_FEES")),
  setMinEarlyExitAmountB: keccak256(toBytes("SET_MIN_EARLY_EXIT_B")),
  setMaxTransferFeeBp: keccak256(toBytes("SET_MAX_TRANSFER_FEE_BP")),
  rebalanceBudgets: keccak256(toBytes("REBALANCE_BUDGETS")),
} as const;

const LABEL_BY_ID: Record<string, string> = {
  [TIMELOCK_GOVERNANCE_OP_IDS.setFees]: "setFees",
  [TIMELOCK_GOVERNANCE_OP_IDS.setLockDuration]: "setLockDuration",
  [TIMELOCK_GOVERNANCE_OP_IDS.setMinEarlyExitAmountB]: "setMinEarlyExitAmountB",
  [TIMELOCK_GOVERNANCE_OP_IDS.setMaxTransferFeeBp]: "setMaxTransferFeeBP",
  [TIMELOCK_GOVERNANCE_OP_IDS.rebalanceBudgets]: "rebalanceBudgets",
};

/** 将链上 opId 解析为可读函数名；未知则回退为短哈希。 */
export function resolveTimelockOpLabel(opId: string): string {
  return LABEL_BY_ID[opId] ?? `unknown (${opId.slice(0, 10)}…)`;
}
