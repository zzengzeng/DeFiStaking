"use client";

import { useEffect, useMemo, useState } from "react";

type Props = {
  stakeTimestamp: bigint;
  unlockTime: bigint;
};

function formatDuration(seconds: number) {
  if (seconds <= 0) return "Unlocked";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  return `${d} days ${h} hours`;
}

export function LockProgress({ stakeTimestamp, unlockTime }: Props) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);

  const { progress, remaining } = useMemo(() => {
    const start = Number(stakeTimestamp);
    const end = Number(unlockTime);
    if (!start || !end || end <= start) return { progress: 0, remaining: "N/A" };
    const total = end - start;
    const elapsed = Math.min(Math.max(now - start, 0), total);
    const percent = Math.round((elapsed * 100) / total);
    return { progress: percent, remaining: formatDuration(end - now) };
  }, [stakeTimestamp, unlockTime, now]);

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-sm">
      <div className="mb-2 flex min-w-0 flex-col gap-1 text-sm sm:flex-row sm:items-center sm:justify-between">
        <span className="text-zinc-400">Unlock Countdown</span>
        <span className="min-w-0 shrink-0 font-medium sm:text-right">{remaining}</span>
      </div>
      <div className="h-2 w-full rounded bg-zinc-800">
        <div className="h-2 rounded bg-sky-400 transition-all" style={{ width: `${progress}%` }} />
      </div>
      <div className="mt-1 text-right text-xs text-zinc-500">{progress}%</div>
    </div>
  );
}
