"use client";

import { useForceClaimAll } from "@/hooks/useForceClaimAll";
import { useWriteWithStatus } from "@/hooks/useWriteWithStatus";
import { formatToken } from "@/lib/format";
import { formatCountdownHms } from "@/lib/timelockCountdown";

type Props = {
  onConfirmed?: () => void | Promise<void>;
};

/** 跨池领取（shutdown / badDebt 逃生舱）。 */
export function ForceClaimAllButton({ onConfirmed }: Props) {
  const force = useForceClaimAll();
  const flow = useWriteWithStatus();
  const busy = flow.state !== "idle";
  if (!force.pathAvailable && force.totalRewards === 0n) return null;

  const cooldownLabel =
    force.claimCooldownRemainingSec > 0n ? formatCountdownHms(Number(force.claimCooldownRemainingSec)) : null;

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 sm:p-4">
      <h3 className="text-sm font-semibold text-amber-100">跨池领取 (forceClaimAll)</h3>
      <p className="mt-1 text-[11px] leading-relaxed text-amber-200/80">
        一次性结算 Pool A + B 的 TokenB 奖励。仅在关停或存在坏账时开放；关停下可绕过单池最低领取门槛。
      </p>
      <p className="mt-2 text-sm text-zinc-400">
        合计待领: <span className="font-mono text-emerald-300/90">{formatToken(force.totalRewards)}</span> TokenB
        <span className="text-zinc-600">
          {" "}
          (A {formatToken(force.rewardsA)} · B {formatToken(force.rewardsB)})
        </span>
      </p>
      {cooldownLabel ? (
        <p className="mt-1 text-xs text-amber-200/90">领取冷却: {cooldownLabel}</p>
      ) : null}
      <button
        type="button"
        disabled={!force.canForceClaimAll || busy}
        onClick={() =>
          void flow.executeWrite(
            {
              actionLabel: "Force claim all pools",
              txType: "claim",
              metadata: { token: "TokenB" },
              onConfirmed,
            },
            () => force.writeForceClaimAll(),
          )
        }
        className="mt-3 min-h-[44px] w-full rounded-lg bg-amber-400 px-3 py-2 text-sm font-medium text-black disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
      >
        {busy ? "Pending…" : "Force claim all"}
      </button>
      {force.forceClaimDisabledReason ? (
        <p className="mt-2 text-xs text-zinc-500">{force.forceClaimDisabledReason}</p>
      ) : null}
    </div>
  );
}
