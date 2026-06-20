"use client";

import Link from "next/link";

type Props = {
  status: "NORMAL" | "PAUSED" | "EMERGENCY" | "SHUTDOWN";
  /** 产品端页面含 #product-escape-actions 时启用 */
  showEscapeAnchor?: boolean;
};

const ESCAPE_ANCHOR = "#product-escape-actions";

function EscapeLink({ className }: { className: string }) {
  return (
    <Link href={ESCAPE_ANCHOR} className={`mt-1.5 inline-block font-medium underline underline-offset-2 ${className}`}>
      前往逃生操作 ↓
    </Link>
  );
}

export function StatusBanner({ status, showEscapeAnchor = false }: Props) {
  if (status === "NORMAL") return null;

  if (status === "EMERGENCY") {
    return (
      <div className="sticky top-0 z-50 mb-4">
        <div className="flex flex-col gap-2 rounded-2xl border border-red-500/30 bg-gradient-to-r from-red-500/20 to-rose-500/10 px-3 py-3 text-sm text-red-100 backdrop-blur sm:flex-row sm:items-start sm:justify-between sm:gap-4 sm:px-4">
          <div className="shrink-0 font-semibold">紧急模式</div>
          <div className="min-w-0 break-words text-xs leading-relaxed text-red-200/90 sm:text-right">
            质押、领取、复利已暂停。请使用紧急退出取回本金（未领奖励将放弃）。
            {showEscapeAnchor ? <EscapeLink className="text-red-100" /> : null}
          </div>
        </div>
      </div>
    );
  }

  if (status === "PAUSED") {
    return (
      <div className="sticky top-0 z-50 mb-4">
        <div className="flex flex-col gap-2 rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-500/20 to-yellow-500/10 px-3 py-3 text-sm text-amber-100 backdrop-blur sm:flex-row sm:items-start sm:justify-between sm:gap-4 sm:px-4">
          <div className="shrink-0 font-semibold">协议已暂停</div>
          <div className="min-w-0 break-words text-xs leading-relaxed text-amber-200/90 sm:text-right">
            所有操作暂时不可用，请等待运营解除暂停。暂停期间无法紧急退出或领取奖励。
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="sticky top-0 z-50 mb-4">
      <div className="flex flex-col gap-2 rounded-2xl border border-zinc-500/30 bg-gradient-to-r from-zinc-500/20 to-zinc-500/10 px-3 py-3 text-sm text-zinc-100 backdrop-blur sm:flex-row sm:items-start sm:justify-between sm:gap-4 sm:px-4">
        <div className="shrink-0 font-semibold">协议已关停</div>
        <div className="min-w-0 break-words text-xs leading-relaxed text-zinc-200/90 sm:text-right">
          可照常赎回本金、领取奖励；若有待领 TokenB，可使用跨池领取。
          {showEscapeAnchor ? <EscapeLink className="text-zinc-100" /> : null}
        </div>
      </div>
    </div>
  );
}
