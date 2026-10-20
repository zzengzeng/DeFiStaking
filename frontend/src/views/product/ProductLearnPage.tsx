"use client";

import Link from "next/link";
import { useMemo } from "react";

import { ExperienceGuide } from "@/components/product/ExperienceGuide";
import { HowItWorks } from "@/components/product/widgets/HowItWorks";
import { LearnPoolPicker } from "@/components/product/LearnPoolPicker";
import { ProductDocPageLayout } from "@/components/product/ProductDocPageLayout";
import { ProductInfoCard } from "@/components/product/ProductInfoCard";
import { ProductPageShell } from "@/components/product/ProductPageShell";
import { ProductPageTitle } from "@/components/product/ProductPageTitle";
import { useI18n } from "@/lib/i18n";

/** 协议说明页 — 单栏文档 / 落地页 */
export function ProductLearnPage() {
  const { t } = useI18n();

  const highlights = useMemo(
    () =>
      [
        t("learn.highlights.nonCustodial"),
        t("learn.highlights.verifiable"),
        t("learn.highlights.dualPool"),
        t("learn.highlights.tokenBReward"),
      ] as const,
    [t],
  );

  const trustItems = useMemo(
    () =>
      [
        { label: t("learn.trustAsset"), value: t("learn.trustAssetVal"), detail: t("learn.trustAssetDetail") },
        { label: t("learn.trustOracle"), value: t("learn.trustOracleVal"), detail: t("learn.trustOracleDetail") },
        { label: t("learn.trustFot"), value: t("learn.trustFotVal"), detail: t("learn.trustFotDetail") },
      ] as const,
    [t],
  );

  return (
    <ProductPageShell>
      <ProductDocPageLayout>
        <ProductPageTitle centered variant="hero" title={t("learn.title")} subtitle={t("learn.subtitle")} />
        <ul className="flex flex-wrap justify-center gap-2">
          {highlights.map((label) => (
            <li
              key={label}
              className="rounded-full border border-[var(--dp-border)] bg-[var(--dp-surface-raised)] px-3 py-1 text-xs font-medium text-zinc-400"
            >
              {label}
            </li>
          ))}
        </ul>

        <section className="dp-card grid grid-cols-1 gap-px overflow-hidden sm:grid-cols-3">
          {trustItems.map((item) => (
            <div key={item.label} className="bg-[var(--dp-surface-raised)] px-4 py-4">
              <div className="text-xs text-zinc-500">{item.label}</div>
              <div className="mt-1 text-lg font-semibold text-zinc-100">{item.value}</div>
              <p className="mt-1 text-xs leading-relaxed text-zinc-500">{item.detail}</p>
            </div>
          ))}
        </section>

        <HowItWorks align="center" layout="stack" />

        <ExperienceGuide />

        <LearnPoolPicker />

        <ProductInfoCard title={t("learn.riskTitle")} variant="compact">
          <ul className="list-inside list-disc space-y-1">
            <li>{t("learn.risk1")}</li>
            <li>{t("learn.risk2")}</li>
            <li>{t("learn.risk3")}</li>
          </ul>
          <p className="mt-2">
            {t("learn.riskConsole")}{" "}
            <Link href="/console" className="text-dp-accent hover:underline">
              {t("learn.riskConsoleLink")}
            </Link>
            {t("learn.riskConsoleEnd")}
          </p>
        </ProductInfoCard>
      </ProductDocPageLayout>
    </ProductPageShell>
  );
}
