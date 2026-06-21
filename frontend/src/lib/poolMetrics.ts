import { safeNumber } from "@/lib/format";

const SECONDS_PER_YEAR = 31_536_000n;

/**
 * 线性 APR（%）高于该阈值时，不再展示「按 365 日复利」的 APY。
 * 此时 `apr/100/365` 已接近或超过 1，`(1+r)^365` 会指数爆炸，失去参考意义（并非链上真的会按该复利结算）。
 */
export const APR_PERCENT_DAILY_APY_DISPLAY_MAX = 250;

/** 链上 MAX_APR_BP=20000 对应 200%；图表展示上限与此一致，避免极小 TVL 时数值爆炸。 */
export const APR_DISPLAY_CAP_PERCENT = 200;

/** TVL=0 时 APR 历史图按典型首笔质押量（与空投 1000 枚一致）估算走势。 */
export const CHART_REFERENCE_STAKE_WEI = 1000n * 10n ** 18n;

/** 图表用 TVL：有质押用实际值，否则用参考质押量以便展示注资后 APR 走势。 */
export function chartTvlForApr(actualTvl: bigint): bigint {
  return actualTvl > 0n ? actualTvl : CHART_REFERENCE_STAKE_WEI;
}

/** 线性年化 APR（%），与 Dashboard 一致：`rewardRate * year / TVL` 缩放为可读百分比。 */
export function estAprPercent(rewardRate: bigint, totalStaked: bigint): number {
  if (totalStaked <= 0n) return 0;
  return capAprDisplayPercent(safeNumber(Number((rewardRate * SECONDS_PER_YEAR * 10_000n) / totalStaked) / 100));
}

/** 图表 / 统计卡片用：限制 APR 展示上限，过滤非有限值。 */
export function capAprDisplayPercent(apr: number, maxPercent = APR_DISPLAY_CAP_PERCENT): number {
  const n = safeNumber(apr);
  if (n <= 0) return 0;
  return Math.min(n, maxPercent);
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
