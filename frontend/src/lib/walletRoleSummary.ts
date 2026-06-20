/** 控制台首页：当前钱包链上角色明文汇总 */
export type WalletRoleFlags = {
  isAdmin?: boolean;
  isOperator?: boolean;
  canPropose?: boolean;
  canExecute?: boolean;
  canCancel?: boolean;
  canProposeSuper?: boolean;
  canExecuteSuper?: boolean;
  canCancelSuper?: boolean;
};

export function formatWalletRoleLabels(flags: WalletRoleFlags): string {
  const parts: string[] = [];
  if (flags.isOperator) parts.push("OPERATOR_ROLE");
  if (flags.isAdmin) parts.push("ADMIN_ROLE");
  if (flags.canPropose) parts.push("Timelock PROPOSER (48h)");
  if (flags.canExecute) parts.push("Timelock EXECUTOR (48h)");
  if (flags.canCancel) parts.push("Timelock CANCELLER (48h)");
  if (flags.canProposeSuper) parts.push("Timelock PROPOSER (72h)");
  if (flags.canExecuteSuper) parts.push("Timelock EXECUTOR (72h)");
  if (flags.canCancelSuper) parts.push("Timelock CANCELLER (72h)");
  return parts.length > 0 ? parts.join(" · ") : "无（只读）";
}

export function buildWalletRoleSummaryLine(
  address: `0x${string}` | undefined,
  flags: WalletRoleFlags,
  loading: boolean,
): string {
  if (!address) return "当前地址：未连接 → 角色：—";
  if (loading) return `当前地址：${address} → 角色：检查中…`;
  return `当前地址：${address} → 角色：${formatWalletRoleLabels(flags)}`;
}
