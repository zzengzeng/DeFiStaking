"use client";

import { useMemo } from "react";

import { useI18n } from "@/lib/i18n";

type Layout = "grid" | "stack";

/** 三步说明 */
export function HowItWorks({
  align = "center",
  layout = "grid",
}: {
  align?: "center" | "left";
  layout?: Layout;
}) {
  const { t } = useI18n();
  const centered = align === "center";

  const steps = useMemo(
    () =>
      [
        { step: "1", title: t("howItWorks.step1Title"), desc: t("howItWorks.step1Desc") },
        { step: "2", title: t("howItWorks.step2Title"), desc: t("howItWorks.step2Desc") },
        { step: "3", title: t("howItWorks.step3Title"), desc: t("howItWorks.step3Desc") },
      ] as const,
    [t],
  );

  if (layout === "stack") {
    return (
      <section className="dp-card overflow-hidden">
        <div className="border-b border-[var(--dp-border)] px-5 py-4 sm:px-6">
          <h2 className="text-lg font-semibold text-zinc-100">{t("howItWorks.title")}</h2>
          <p className="mt-1 text-sm text-zinc-500">{t("howItWorks.subtitle")}</p>
        </div>
        <ol className="divide-y divide-[var(--dp-border)]">
          {steps.map((s) => (
            <li key={s.step} className="flex gap-4 px-5 py-5 sm:px-6">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--dp-accent-muted)] text-sm font-bold text-dp-accent">
                {s.step}
              </div>
              <div className="min-w-0">
                <h3 className="font-semibold text-zinc-100">{s.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-zinc-500">{s.desc}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    );
  }

  return (
    <section>
      <h2 className={`text-lg font-semibold text-zinc-200 sm:text-xl ${centered ? "text-center" : ""}`}>
        {t("howItWorks.title")}
      </h2>
      <p
        className={`mt-2 text-sm text-zinc-500 ${centered ? "mx-auto max-w-lg text-center" : "max-w-2xl"}`}
      >
        {t("howItWorks.subtitle")}
      </p>
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {steps.map((s) => (
          <div key={s.step} className={`dp-card p-5 ${centered ? "text-center sm:text-left" : ""}`}>
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-full bg-[var(--dp-accent-muted)] text-sm font-bold text-dp-accent ${centered ? "mx-auto sm:mx-0" : ""}`}
            >
              {s.step}
            </div>
            <h3 className="mt-3 font-semibold text-zinc-100">{s.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-zinc-500">{s.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
