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

/** 合约错误码映射：将链上 revert 转为用户可读提示。 */
export function mapContractError(error: unknown): string {
  const text = extractRevertReason(error);

  if (text.includes("BadDebtExists") || text.toLowerCase().includes("bad debt")) return "存在 bad debt，当前不允许 claim。";
  if (text.includes("BelowMinClaim")) return "领取金额低于最小 claim 限制。";
  if (text.includes("TimelockNotReady")) return "Timelock 未到可执行时间，请稍后再执行。";
  if (text.includes("TimelockParamChanged")) return "当前参数和已排队提案不一致，请先取消再重新排队。";
  if (text.includes("TimelockNotFound")) return "未找到可取消的 timelock 操作。";
  if (text.includes("EmergencyModeActive") || text.includes("EmergencyActive")) return "协议处于 Emergency 模式，当前操作不可用。";
  if (text.includes("InvariantViolation") || text.includes("gas limit too high")) {
    return "奖励池资金与负债校验未通过（InvariantViolation）。这通常不是 gas 问题：请先补充少量 TokenB 到质押合约，或先执行一次运营侧的奖励注资/坏账处理后再试。";
  }
  if (text.includes("ExceedsTVLCap")) return "超过 TVL 上限，无法继续质押。";
  if (text.includes("UnlockTimePending")) return "锁仓尚未到期，当前不能正常退出。";
  if (text.includes("InsufficientPending")) return "系统待发奖励不足，请稍后重试。";
  if (text.includes("User rejected") || text.includes("rejected") || text.includes("denied transaction")) return "你已取消钱包签名。";
  if (text.includes("insufficient allowance") || text.includes("ERC20: insufficient allowance")) return "代币授权不足，请先 Approve。";
  if (text.includes("insufficient balance") || text.includes("ERC20: transfer amount exceeds balance")) return "钱包余额不足。";
  if (text.includes("NoRewardsToClaim") || text.includes("no rewards to claim")) return "当前没有可领取的奖励。";
  if (text.includes("NoRewardsToCompound") || text.includes("nothing to compound")) return "当前没有可复投的奖励。";
  if (text.includes("ClaimCooldown") || text.includes("claim cooldown")) return "Claim 冷却尚未结束，请稍后再试。";

  return text.length > 0 ? text : "交易失败，请检查参数和链上状态后重试。";
}
