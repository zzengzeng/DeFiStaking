"use client";

import Link from "next/link";

import { formatToken } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

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
  const { t } = useI18n();
  const hasPosition = stakedWei > 0n || rewardsWei > 0n;
  const checks = locked
    ? [
        t("withdrawInfo.lockedChecks.unlock"),
        t("withdrawInfo.lockedChecks.penalty"),
        t("withdrawInfo.lockedChecks.rewards"),
      ]
    : [
        t("withdrawInfo.flexibleChecks.noFee"),
        t("withdrawInfo.flexibleChecks.rewardsSeparate"),
        t("withdrawInfo.flexibleChecks.fot"),
      ];

  return (
    <section className="dp-card overflow-hidden">
      <div className="border-b border-[var(--dp-border)] px-4 py-4 sm:px-5">
        <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">{t("withdrawInfo.checklist")}</div>
        <h2 className="mt-1 text-base font-semibold text-zinc-100">{t("withdrawInfo.title", { pool: poolName })}</h2>
      </div>

      <div className="grid gap-px bg-[var(--dp-border)] sm:grid-cols-2">
        <div className="bg-[var(--dp-surface)] px-4 py-4 sm:px-5">
          <div className="text-xs text-zinc-500">{t("withdrawInfo.redeemable")}</div>
          <div className="mt-1 text-2xl font-semibold text-zinc-50">
            {formatToken(stakedWei, 18, 4)} <span className="text-sm text-zinc-500">{tokenSymbol}</span>
          </div>
        </div>
        <div className="bg-[var(--dp-surface)] px-4 py-4 sm:px-5">
          <div className="text-xs text-zinc-500">{t("withdrawInfo.pendingRewards")}</div>
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
            <div className="text-sm font-medium text-zinc-200">{t("withdrawInfo.noPosition")}</div>
            <p className="mt-1 text-xs leading-relaxed text-zinc-500">{t("withdrawInfo.noPositionDesc")}</p>
            <Link href={stakeHref} className="mt-3 inline-flex text-sm font-semibold text-[var(--dp-accent)] hover:underline">
              {t("withdrawInfo.goStake", { token: tokenSymbol })}
            </Link>
          </div>
        ) : null}
      </div>
    </section>
  );
}
