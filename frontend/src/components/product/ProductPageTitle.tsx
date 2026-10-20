"use client";

import clsx from "clsx";

type Props = {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** 首页等大标题 */
  variant?: "default" | "hero";
  centered?: boolean;
  className?: string;
};

/** 产品页标题区 */
export function ProductPageTitle({
  title,
  subtitle,
  variant = "default",
  centered = false,
  className,
}: Props) {
  return (
    <header className={clsx("min-w-0", centered && "text-center", className)}>
      <h1
        className={clsx(
          "min-w-0 break-words font-bold tracking-tight text-zinc-50",
          variant === "hero"
            ? "text-3xl leading-[1.15] sm:text-4xl md:text-5xl"
            : "text-3xl sm:text-4xl md:text-5xl",
        )}
      >
        {title}
      </h1>
      {subtitle ? (
        <p
          className={clsx(
            "mt-3 min-w-0 break-words text-sm leading-relaxed text-zinc-400 sm:text-base",
            centered ? "mx-auto max-w-xl" : "max-w-2xl",
          )}
        >
          {subtitle}
        </p>
      ) : null}
    </header>
  );
}
