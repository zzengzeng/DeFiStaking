import { safeNumber } from "@/lib/format";

const SECONDS_PER_YEAR = 31_536_000n;

/**
 * 线性 APR（%）高于该阈值时，不再展示「按 365 日复利」的 APY。
 * 此时 `apr/100/365` 已接近或超过 1，`(1+r)^365` 会指数爆炸，失去参考意义（并非链上真的会按该复利结算）。
 */
export const APR_PERCENT_DAILY_APY_DISPLAY_MAX = 250;

/** 线性年化 APR（%），与 Dashboard 一致：`rewardRate * year / TVL` 缩放为可读百分比。 */
export function estAprPercent(rewardRate: bigint, totalStaked: bigint): number {
  if (totalStaked <= 0n) return 0;
  return safeNumber(Number((rewardRate * SECONDS_PER_YEAR * 10_000n) / totalStaked) / 100);
}

/**
 * 按「把线性 APR 均摊到自然日、再复利 365 次」得到的近似 APY（%）。
 * 仅在 `aprPercent <= APR_PERCENT_DAILY_APY_DISPLAY_MAX` 时返回数字；否则返回 `null`（由 UI 显示为「—」）。
 */
export function estApyDailyCompoundPercent(aprPercent: number): number | null {
  const apr = safeNumber(aprPercent);
  if (apr <= 0) return 0;
  if (apr > APR_PERCENT_DAILY_APY_DISPLAY_MAX) return null;
  const r = apr / 100 / 365;
  return safeNumber((Math.pow(1 + r, 365) - 1) * 100);
}

/** 用户占池子 TVL 比例（%）。 */
export function userSharePercent(userStaked: bigint, totalStaked: bigint): number {
  if (totalStaked <= 0n || userStaked <= 0n) return 0;
  return safeNumber(Number((userStaked * 10_000n) / totalStaked) / 100);
}
