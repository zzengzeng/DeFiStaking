"use client";

import clsx from "clsx";

type Props = {
  variant?: "product" | "console";
  size?: "sm" | "md";
};

/** 统一品牌符号：产品端为双池菱形，控制台端叠加治理/运维语义。 */
export function BrandMark({ variant = "product", size = "md" }: Props) {
  const isConsole = variant === "console";

  return (
    <span
      className={clsx(
        "relative grid shrink-0 place-items-center overflow-hidden rounded-xl border",
        size === "sm" ? "size-8" : "size-10",
        isConsole
          ? "border-amber-300/20 bg-amber-300/10 text-amber-200 shadow-[0_0_24px_-16px_rgba(251,191,36,0.8)]"
          : "border-sky-300/20 bg-sky-400/10 text-[var(--dp-accent)] shadow-[0_0_24px_-16px_rgba(0,163,255,0.9)]",
      )}
      aria-hidden
    >
      <span
        className={clsx(
          "absolute inset-0 opacity-60",
          isConsole
            ? "bg-[radial-gradient(circle_at_30%_25%,rgba(251,191,36,0.32),transparent_36%)]"
            : "bg-[radial-gradient(circle_at_30%_25%,rgba(0,163,255,0.34),transparent_36%)]",
        )}
      />
      <span className={clsx("relative rotate-45 rounded-[3px]", size === "sm" ? "size-3" : "size-3.5", isConsole ? "bg-amber-300" : "bg-[var(--dp-accent)]")} />
      <span
        className={clsx(
          "absolute rounded-full border",
          size === "sm" ? "inset-2" : "inset-2.5",
          isConsole ? "border-amber-200/20" : "border-sky-200/20",
        )}
      />
    </span>
  );
}
