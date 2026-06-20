"use client";

import Link from "next/link";

import { formatToken } from "@/lib/format";

type Props = {
  poolName: string;
  tokenSymbol: string;
  rewardToken?: string;
  stakedWei: bigint;
  rewardsWei: bigint;
  stakeHref: string;
  locked?: boolean;
};

/** 赎回页左侧信息栏：让无仓位状态也保持和操作卡匹配的信息密度。 */
export function ProductWithdrawInfoPanel({
  poolName,
  tokenSymbol,
  rewardToken = "TokenB",
  stakedWei,
  rewardsWei,
  stakeHref,
  locked = false,
}: Props) {
  const hasPosition = stakedWei > 0n || rewardsWei > 0n;
  const checks = locked
    ? ["确认解锁时间与当前费率", "提前退出可能产生手续费或罚金", "奖励需单独领取或复利"]
    : ["灵活池无锁仓与赎回手续费", "待领取奖励不会随赎回自动发放", "FOT 出账税费由接收方承担"];

  return (
    <section className="dp-card overflow-hidden">
      <div className="border-b border-[var(--dp-border)] px-4 py-4 sm:px-5">
        <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">withdraw checklist</div>
        <h2 className="mt-1 text-base font-semibold text-zinc-100">{poolName}赎回说明</h2>
      </div>

      <div className="grid gap-px bg-[var(--dp-border)] sm:grid-cols-2">
        <div className="bg-[var(--dp-surface)] px-4 py-4 sm:px-5">
          <div className="text-xs text-zinc-500">可赎回本金</div>
          <div className="mt-1 text-2xl font-semibold text-zinc-50">
            {formatToken(stakedWei, 18, 4)} <span className="text-sm text-zinc-500">{tokenSymbol}</span>
          </div>
        </div>
        <div className="bg-[var(--dp-surface)] px-4 py-4 sm:px-5">
          <div className="text-xs text-zinc-500">待领取奖励</div>
          <div className="mt-1 text-2xl font-semibold text-zinc-50">
            {formatToken(rewardsWei, 18, 4)} <span className="text-sm text-zinc-500">{rewardToken}</span>
          </div>
        </div>
      </div>

      <div className="space-y-3 px-4 py-4 sm:px-5">
        <ul className="space-y-2 text-sm text-zinc-400">
          {checks.map((item) => (
            <li key={item} className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[var(--dp-accent)]" aria-hidden />
              <span>{item}</span>
            </li>
          ))}
        </ul>

        {!hasPosition ? (
          <div className="rounded-xl border border-dashed border-[var(--dp-border)] bg-[var(--dp-surface-raised)]/60 px-4 py-4">
            <div className="text-sm font-medium text-zinc-200">当前钱包暂无可赎回仓位</div>
            <p className="mt-1 text-xs leading-relaxed text-zinc-500">
              先进入对应质押池建立仓位后，这里会显示本金、奖励和赎回限制。
            </p>
            <Link href={stakeHref} className="mt-3 inline-flex text-sm font-semibold text-[var(--dp-accent)] hover:underline">
              去质押 {tokenSymbol}
            </Link>
          </div>
        ) : null}
      </div>
    </section>
  );
}
