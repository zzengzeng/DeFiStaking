"use client";

/** 主流 DApp 右侧操作卡：Tab / 标题 + 内容 + 可选页脚 */
export function ProductActionCard({
  tabs,
  heading,
  children,
  footer,
  compact = false,
}: {
  tabs?: React.ReactNode;
  heading?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** 首页等紧凑场景：减少内边距 */
  compact?: boolean;
}) {
  const showHeader = Boolean(tabs || heading);

  return (
    <div className="dp-action overflow-hidden">
      {showHeader ? (
        <div className="border-b border-[var(--dp-border)] bg-[var(--dp-surface-raised)]">
          {tabs ? <div className={compact ? "p-1" : "p-1.5"}>{tabs}</div> : null}
          {!tabs && heading ? (
            <div className={compact ? "px-3 py-2.5 text-sm font-semibold text-zinc-200" : "px-4 py-3.5 text-sm font-semibold text-zinc-200"}>
              {heading}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className={compact ? "p-3 sm:p-4" : "p-4 sm:p-5"}>{children}</div>
      {footer ? (
        <div
          className={
            compact
              ? "border-t border-[var(--dp-border)] bg-[var(--dp-surface)]/50 px-3 py-2 text-center text-xs text-zinc-500"
              : "border-t border-[var(--dp-border)] bg-[var(--dp-surface)]/50 px-4 py-3 text-center text-sm text-zinc-500"
          }
        >
          {footer}
        </div>
      ) : null}
    </div>
  );
}
