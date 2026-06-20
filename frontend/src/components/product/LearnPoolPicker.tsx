"use client";

import Link from "next/link";
import clsx from "clsx";

import { POOL_COPY } from "@/lib/appMode";

const POOLS = [
  {
    copy: POOL_COPY.flexible,
    token: "TokenA",
    reward: "TokenB",
    tag: "随存随取",
    accentClass: "dp-pool-card--flexible",
    btnClass: "dp-button min-h-[48px] rounded-xl px-4 py-3 text-sm",
  },
  {
    copy: POOL_COPY.locked,
    token: "TokenB",
    reward: "TokenB",
    tag: "更高收益 · 可复利",
    accentClass: "dp-pool-card--locked",
    btnClass:
      "min-h-[48px] rounded-xl px-4 py-3 text-sm font-semibold bg-violet-500 text-white transition hover:bg-violet-400",
  },
] as const;

/** Learn 落地页底部：双池 CTA */
export function LearnPoolPicker() {
  return (
    <section className="dp-card overflow-hidden">
      <div className="border-b border-[var(--dp-border)] bg-[var(--dp-surface-raised)] px-5 py-6 text-center sm:px-8">
        <h2 className="text-xl font-semibold text-zinc-50 sm:text-2xl">开始质押</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-zinc-500">
          连接钱包后存入对应代币，奖励以 <span className="text-zinc-300">TokenB</span> 累积。
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 p-5 sm:p-6 lg:grid-cols-2">
        {POOLS.map(({ copy, token, reward, tag, accentClass, btnClass }) => (
          <div key={copy.slug} className={clsx("dp-pool-card", accentClass)}>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold text-zinc-50">{copy.productTitle}</h3>
              <span className="rounded-md border border-[var(--dp-border)] bg-[var(--dp-surface)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-400">
                {tag}
              </span>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-zinc-500">{copy.productSubtitle}</p>

            <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-lg bg-[var(--dp-surface)]/80 px-3 py-2">
                <dt className="text-zinc-500">质押</dt>
                <dd className="mt-0.5 font-semibold text-zinc-200">{token}</dd>
              </div>
              <div className="rounded-lg bg-[var(--dp-surface)]/80 px-3 py-2">
                <dt className="text-zinc-500">奖励</dt>
                <dd className="mt-0.5 font-semibold text-zinc-200">{reward}</dd>
              </div>
            </dl>

            <Link href={copy.earnHref} className={`mt-4 block text-center ${btnClass}`}>
              质押 {token}
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}
