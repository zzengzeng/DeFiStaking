import type { TranslateFn } from "@/lib/i18n";

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

export function formatWalletRoleLabels(t: TranslateFn, flags: WalletRoleFlags): string {
  const parts: string[] = [];
  if (flags.isOperator) parts.push(t("console.walletRole.operatorRole"));
  if (flags.isAdmin) parts.push(t("console.walletRole.adminRole"));
  if (flags.canPropose) parts.push(t("console.walletRole.proposer48h"));
  if (flags.canExecute) parts.push(t("console.walletRole.executor48h"));
  if (flags.canCancel) parts.push(t("console.walletRole.canceller48h"));
  if (flags.canProposeSuper) parts.push(t("console.walletRole.proposer72h"));
  if (flags.canExecuteSuper) parts.push(t("console.walletRole.executor72h"));
  if (flags.canCancelSuper) parts.push(t("console.walletRole.canceller72h"));
  return parts.length > 0 ? parts.join(" · ") : t("console.walletRole.noneReadOnly");
}

export function buildWalletRoleSummaryLine(
  t: TranslateFn,
  address: `0x${string}` | undefined,
  flags: WalletRoleFlags,
  loading: boolean,
): string {
  if (!address) return t("console.walletRole.addressNotConnected");
  if (loading) return t("console.walletRole.addressChecking", { address });
  return t("console.walletRole.addressWithRoles", {
    address,
    roles: formatWalletRoleLabels(t, flags),
  });
}
