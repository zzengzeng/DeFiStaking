"use client";

type Props = {
  title: string;
  children: React.ReactNode;
  variant?: "default" | "compact";
};

/** 产品页说明 / 风险提示卡片 */
export function ProductInfoCard({ title, children, variant = "default" }: Props) {
  const compact = variant === "compact";

  return (
    <section className={compact ? "rounded-xl border border-[var(--dp-border)] bg-[var(--dp-surface)]/60 px-4 py-3 text-xs text-zinc-500" : "dp-card p-5 text-sm text-zinc-500 sm:p-6"}>
      <h2 className={compact ? "text-xs font-semibold text-zinc-400" : "text-sm font-semibold text-zinc-300"}>{title}</h2>
      <div className={compact ? "mt-2 leading-relaxed" : "mt-3 leading-relaxed"}>{children}</div>
    </section>
  );
}
