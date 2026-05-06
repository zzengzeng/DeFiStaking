"use client";

type Props = {
  status: "NORMAL" | "PAUSED" | "EMERGENCY" | "SHUTDOWN";
};

export function StatusBanner({ status }: Props) {
  if (status === "NORMAL") return null;

  if (status === "EMERGENCY") {
    return (
      <div className="sticky top-0 z-50 mb-4">
        <div className="flex flex-col gap-2 rounded-2xl border border-red-500/30 bg-gradient-to-r from-red-500/20 to-rose-500/10 px-3 py-3 text-sm text-red-100 backdrop-blur sm:flex-row sm:items-start sm:justify-between sm:gap-4 sm:px-4">
          <div className="shrink-0 font-semibold">Emergency Mode Active</div>
          <div className="min-w-0 break-words text-xs leading-relaxed text-red-200/90 sm:text-right">
            Stake / Claim / Compound disabled. Emergency withdraw only.
          </div>
        </div>
      </div>
    );
  }

  if (status === "PAUSED") {
    return (
      <div className="sticky top-0 z-50 mb-4">
        <div className="flex flex-col gap-2 rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-500/20 to-yellow-500/10 px-3 py-3 text-sm text-amber-100 backdrop-blur sm:flex-row sm:items-start sm:justify-between sm:gap-4 sm:px-4">
          <div className="shrink-0 font-semibold">Protocol Paused</div>
          <div className="min-w-0 break-words text-xs leading-relaxed text-amber-200/90 sm:text-right">All operations are temporarily disabled.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="sticky top-0 z-50 mb-4">
      <div className="flex flex-col gap-2 rounded-2xl border border-zinc-500/30 bg-gradient-to-r from-zinc-500/20 to-zinc-500/10 px-3 py-3 text-sm text-zinc-100 backdrop-blur sm:flex-row sm:items-start sm:justify-between sm:gap-4 sm:px-4">
        <div className="shrink-0 font-semibold">Shutdown Mode</div>
        <div className="min-w-0 break-words text-xs leading-relaxed text-zinc-200/90 sm:text-right">Only withdrawals remain available.</div>
      </div>
    </div>
  );
}
