"use client";

import Link from "next/link";
import clsx from "clsx";

import { TokenLabel } from "@/components/TokenLabel";
import { POOL_COPY } from "@/lib/appMode";
import { useI18n } from "@/lib/i18n";

/** Learn 落地页底部：双池 CTA */
export function LearnPoolPicker() {
  const { t } = useI18n();

  const pools = [
    {
      copy: POOL_COPY.flexible,
      token: "TokenA",
      reward: "TokenB",
      title: t("pool.flexible.productTitle"),
      subtitle: t("pool.flexible.productSubtitle"),
      tag: t("learnPicker.flexibleTag"),
      accentClass: "dp-pool-card--flexible",
      btnClass: "dp-button min-h-[48px] rounded-xl px-4 py-3 text-sm",
    },
    {
      copy: POOL_COPY.locked,
      token: "TokenB",
      reward: "TokenB",
      title: t("pool.locked.productTitle"),
      subtitle: t("pool.locked.productSubtitle"),
      tag: t("learnPicker.lockedTag"),
      accentClass: "dp-pool-card--locked",
      btnClass:
        "min-h-[48px] rounded-xl px-4 py-3 text-sm font-semibold bg-violet-500 text-white transition hover:bg-violet-400",
    },
  ] as const;

  return (
    <section className="dp-card overflow-hidden">
      <div className="border-b border-[var(--dp-border)] bg-[var(--dp-surface-raised)] px-5 py-6 text-center sm:px-8">
        <h2 className="text-xl font-semibold text-zinc-50 sm:text-2xl">{t("learnPicker.startTitle")}</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-zinc-500">{t("learnPicker.startDesc")}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 p-5 sm:p-6 lg:grid-cols-2">
        {pools.map(({ copy, token, reward, title, subtitle, tag, accentClass, btnClass }) => (
          <div key={copy.slug} className={clsx("dp-pool-card", accentClass)}>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold text-zinc-50">{title}</h3>
              <span className="rounded-md border border-[var(--dp-border)] bg-[var(--dp-surface)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-400">
                {tag}
              </span>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-zinc-500">{subtitle}</p>

            <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-lg bg-[var(--dp-surface)]/80 px-3 py-2">
                <dt className="text-zinc-500">{t("learnPicker.stake")}</dt>
                <dd className="mt-1">
                  <TokenLabel symbol={token} size="sm" />
                </dd>
              </div>
              <div className="rounded-lg bg-[var(--dp-surface)]/80 px-3 py-2">
                <dt className="text-zinc-500">{t("learnPicker.reward")}</dt>
                <dd className="mt-1">
                  <TokenLabel symbol={reward} size="sm" />
                </dd>
              </div>
            </dl>

            <Link href={copy.earnHref} className={`mt-4 block text-center ${btnClass}`}>
              {t("learnPicker.stakeToken", { token })}
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}
