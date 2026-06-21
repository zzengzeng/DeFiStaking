"use client";

import Link from "next/link";
import { useMemo } from "react";

import { appChainLabel } from "@/config/chains";
import { useI18n } from "@/lib/i18n";

const SEPOLIA_FAUCET = "https://sepoliafaucet.com/";

/** 测试网体验者分步指南 */
export function ExperienceGuide() {
  const { t } = useI18n();

  const steps = useMemo(
    () =>
      [
        { n: "1", title: t("guide.step1Title"), body: t("guide.step1Body", { network: appChainLabel }) },
        { n: "2", title: t("guide.step2Title"), body: t("guide.step2Body"), href: SEPOLIA_FAUCET, link: t("guide.step2Link") },
        { n: "3", title: t("guide.step3Title"), body: t("guide.step3Body"), href: "/", link: t("guide.step3Link") },
        { n: "4", title: t("guide.step4Title"), body: t("guide.step4Body") },
        { n: "5", title: t("guide.step5Title"), body: t("guide.step5Body"), href: "/earn/flexible", link: t("guide.step5Link") },
        { n: "6", title: t("guide.step6Title"), body: t("guide.step6Body"), href: "/withdraw/flexible", link: t("guide.step6Link") },
      ] as const,
    [t],
  );

  return (
    <section className="dp-card overflow-hidden">
      <div className="border-b border-[var(--dp-border)] bg-[var(--dp-surface-raised)] px-5 py-4 sm:px-6">
        <h2 className="text-lg font-semibold text-zinc-100">{t("guide.title")}</h2>
        <p className="mt-1 text-sm text-zinc-500">{t("guide.subtitle")}</p>
      </div>
      <ol className="divide-y divide-[var(--dp-border)]">
        {steps.map((step) => (
          <li key={step.n} className="flex gap-4 px-5 py-5 sm:px-6">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-sky-500/30 bg-sky-500/10 text-sm font-bold text-sky-300">
              {step.n}
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-zinc-100">{step.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-zinc-500">{step.body}</p>
              {"href" in step && step.href ? (
                <Link
                  href={step.href}
                  {...(step.href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                  className="mt-2 inline-flex text-sm font-medium text-dp-accent hover:underline"
                >
                  {step.link}
                  {step.href.startsWith("http") ? " ↗" : ""}
                </Link>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
      <div className="border-t border-[var(--dp-border)] bg-[var(--dp-surface)]/50 px-5 py-3 text-center text-[11px] leading-relaxed text-zinc-600 sm:px-6">
        {t("guide.footer")}
      </div>
    </section>
  );
}
