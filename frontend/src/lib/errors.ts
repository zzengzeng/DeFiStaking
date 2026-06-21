import type { TranslateFn } from "@/lib/i18n";
import { translate } from "@/lib/i18n";
import { useLocaleStore } from "@/store/useLocaleStore";

/** 尝试提取 viem / 钱包返回的 revert 或短错误信息。 */
export function extractRevertReason(error: unknown): string {
  if (error && typeof error === "object") {
    const e = error as { shortMessage?: string; details?: string; message?: string; cause?: unknown };
    const fromCause = e.cause ? extractRevertReason(e.cause) : "";
    const parts = [e.shortMessage, e.details, e.message, fromCause].filter(Boolean) as string[];
    const joined = parts.join(" ").trim();
    if (joined) return joined.slice(0, 500);
  }
  if (error instanceof Error) return error.message.slice(0, 500);
  return String(error).slice(0, 500);
}

/**
 * 将链上 revert / 钱包错误映射为 i18n 文案。
 * @param t 组件内传 `useI18n().t`；非 React 场景用 `mapContractErrorLocalized`
 */
export function mapContractError(error: unknown, t: TranslateFn): string {
  const text = extractRevertReason(error);

  if (text.includes("BadDebtExists") || text.toLowerCase().includes("bad debt")) return t("errors.badDebtExists");
  if (text.includes("BelowMinClaim")) return t("errors.belowMinClaim");
  if (text.includes("TimelockNotReady")) return t("errors.timelockNotReady");
  if (text.includes("TimelockParamChanged")) return t("errors.timelockParamChanged");
  if (text.includes("ForceClaimAllNotAvailable")) return t("errors.forceClaimAllNotAvailable");
  if (text.includes("EmergencyModeActive") || text.includes("EmergencyActive")) return t("errors.emergencyModeActive");
  if (text.includes("InvalidRecipient")) return t("errors.invalidRecipient");
  if (text.includes("ExcessiveTransferFee")) return t("errors.excessiveTransferFee");
  if (text.includes("InvalidMaxTransferFeeBp")) return t("errors.invalidMaxTransferFeeBp");
  if (text.includes("NotAContract")) return t("errors.notAContract");
  if (text.includes("InvariantViolation")) return t("errors.invariantViolation");
  if (text.includes("ExceedsTVLCap")) return t("errors.exceedsTvlCap");
  if (text.includes("UnlockTimePending")) return t("errors.unlockTimePending");
  if (text.includes("InsufficientPending")) return t("errors.insufficientPending");
  if (text.includes("User rejected") || text.includes("rejected") || text.includes("denied transaction")) {
    return t("errors.userRejected");
  }
  if (text.includes("insufficient allowance") || text.includes("ERC20: insufficient allowance")) {
    return t("errors.insufficientAllowance");
  }
  if (text.includes("insufficient balance") || text.includes("ERC20: transfer amount exceeds balance")) {
    return t("errors.insufficientBalance");
  }
  if (text.includes("gas limit too high")) return t("errors.gasLimitTooHigh");
  if (text.includes("NoRewardsToClaim") || text.includes("no rewards to claim")) return t("errors.noRewardsToClaim");
  if (text.includes("NoRewardsToCompound") || text.includes("nothing to compound")) return t("errors.noRewardsToCompound");
  if (text.includes("ClaimCooldown") || text.includes("claim cooldown")) return t("errors.claimCooldown");

  return text.length > 0 ? text : t("errors.genericFailed");
}

/** 读取 persist 中的 locale，供 executeTransaction / toast 等非组件路径使用 */
export function mapContractErrorLocalized(error: unknown): string {
  const locale = useLocaleStore.getState().locale;
  return mapContractError(error, (key, vars) => translate(locale, key, vars));
}
