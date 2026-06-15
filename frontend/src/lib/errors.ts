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
  if (text.includes("ForceClaimAllNotAvailable")) return "forceClaimAll 仅在关停或存在坏账时可用，请使用 claimA/claimB。";
  if (text.includes("EmergencyModeActive") || text.includes("EmergencyActive")) return "协议处于 Emergency 模式，当前操作不可用。";
  if (text.includes("InvalidRecipient")) return "收款地址不可用：不能设置为质押合约自身，请更换治理金库或多签地址。";
  if (text.includes("ExcessiveTransferFee")) return "代币转账税超过协议当前 maxTransferFeeBP 容忍上限，交易已保护性回滚。";
  if (text.includes("InvalidMaxTransferFeeBp")) return "maxTransferFeeBP 参数无效，不能超过 10000 bp。";
  if (text.includes("NotAContract")) return "模块地址无合约代码，请确认部署地址和网络。";
  if (text.includes("InvariantViolation")) {
    return "奖励池资金与负债校验未通过（InvariantViolation）。请先由运营向质押合约注入 TokenB（notifyReward），或向合约直接转入少量 TokenB 补足账面缺口后再试。";
  }
  if (text.includes("ExceedsTVLCap")) return "超过 TVL 上限，无法继续质押。";
  if (text.includes("UnlockTimePending")) return "锁仓尚未到期，当前不能正常退出。";
  if (text.includes("InsufficientPending")) return "系统待发奖励不足，请稍后重试。";
  if (text.includes("User rejected") || text.includes("rejected") || text.includes("denied transaction")) return "你已取消钱包签名。";
  if (text.includes("insufficient allowance") || text.includes("ERC20: insufficient allowance")) {
    return "代币授权不足：请先对 ZZTKA（Pool A）或 ZZTKB（Pool B）执行 Approve，再质押。";
  }
  if (text.includes("insufficient balance") || text.includes("ERC20: transfer amount exceeds balance")) {
    return "钱包 ZZTKA/ZZTKB 余额不足。新部署后请先在首页领取空投（mint），或向你的地址转入测试币。";
  }
  if (text.includes("gas limit too high")) {
    return "交易模拟失败（合约会 revert）。新部署常见原因：① 未领 ZZTKA 空投 ② 未 Approve ③ 运营注资未做。协议当前未暂停；若刚改 .env.local 请重启 yarn dev。";
  }
  if (text.includes("NoRewardsToClaim") || text.includes("no rewards to claim")) return "当前没有可领取的奖励。";
  if (text.includes("NoRewardsToCompound") || text.includes("nothing to compound")) return "当前没有可复投的奖励。";
  if (text.includes("ClaimCooldown") || text.includes("claim cooldown")) return "Claim 冷却尚未结束，请稍后再试。";

  return text.length > 0 ? text : "交易失败，请检查参数和链上状态后重试。";
}
