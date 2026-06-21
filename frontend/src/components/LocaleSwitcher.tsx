"use client";

import clsx from "clsx";

import { useI18n, type Locale } from "@/lib/i18n";

type Props = {
  compact?: boolean;
  className?: string;
};

const OPTIONS: { id: Locale; labelKey: string }[] = [
  { id: "zh", labelKey: "locale.zh" },
  { id: "en", labelKey: "locale.en" },
];

/** 中英文切换 */
export function LocaleSwitcher({ compact = false, className }: Props) {
  const { locale, setLocale, t } = useI18n();

  return (
    <div
      className={clsx(
        "inline-flex items-center rounded-full border border-zinc-700 bg-zinc-950 p-0.5",
        className,
      )}
      role="group"
      aria-label={t("locale.label")}
    >
      {OPTIONS.map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => setLocale(opt.id)}
          className={clsx(
            "rounded-full font-medium transition",
            compact ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px] sm:text-xs",
            locale === opt.id ? "bg-zinc-100 text-black" : "text-zinc-500 hover:text-zinc-200",
          )}
          aria-pressed={locale === opt.id}
        >
          {t(opt.labelKey)}
        </button>
      ))}
    </div>
  );
}
