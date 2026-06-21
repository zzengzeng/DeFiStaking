"use client";

import { ConsoleButton } from "@/components/console/ConsoleButton";
import { useForceClaimAll, type ForceClaimBlockReason } from "@/hooks/useForceClaimAll";
import { useWriteWithStatus } from "@/hooks/useWriteWithStatus";
import { useConsoleCopy } from "@/lib/consoleCopy";
import { formatToken } from "@/lib/format";
import { formatCountdownHms } from "@/lib/timelockCountdown";

const FORCE_CLAIM_CONSOLE_REASON: Record<
  ForceClaimBlockReason,
  "disabledNotAvailable" | "disabledPaused" | "disabledEmergency" | "disabledCooldown" | "disabledNoRewards"
> = {
  notAvailable: "disabledNotAvailable",
  paused: "disabledPaused",
  emergency: "disabledEmergency",
  cooldown: "disabledCooldown",
  noRewards: "disabledNoRewards",
};

type Props = {
  onConfirmed?: () => void | Promise<void>;
};

/** 跨池领取（shutdown / badDebt 逃生舱）。 */
export function ForceClaimAllButton({ onConfirmed }: Props) {
  const copy = useConsoleCopy();
  const force = useForceClaimAll();
  const flow = useWriteWithStatus();
  const busy = flow.state !== "idle";
  if (!force.pathAvailable && force.totalRewards === 0n) return null;

  const cooldownLabel =
    force.claimCooldownRemainingSec > 0n ? formatCountdownHms(Number(force.claimCooldownRemainingSec)) : null;

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 sm:p-4">
      <h3 className="text-sm font-semibold text-amber-100">{copy.forceClaim.title}</h3>
      <p className="mt-1 text-[11px] leading-relaxed text-amber-200/80">{copy.forceClaim.desc}</p>
      <p className="mt-2 text-sm text-zinc-400">
        {copy.forceClaim.totalPending}:{" "}
        <span className="font-mono text-emerald-300/90">{formatToken(force.totalRewards)}</span> TokenB
        <span className="text-zinc-600">
          {" "}
          (A {formatToken(force.rewardsA)} · B {formatToken(force.rewardsB)})
        </span>
      </p>
      {cooldownLabel ? (
        <p className="mt-1 text-xs text-amber-200/90">
          {copy.forceClaim.cooldown}: {cooldownLabel}
        </p>
      ) : null}
      <ConsoleButton
        fullWidth
        className="mt-3"
        disabled={!force.canForceClaimAll || busy}
        onClick={() =>
          void flow.executeWrite(
            {
              actionLabel: copy.forceClaim.submit,
              txType: "claim",
              metadata: { token: "TokenB" },
              onConfirmed,
            },
            () => force.writeForceClaimAll(),
          )
        }
      >
        {busy ? copy.common.pending : copy.forceClaim.submit}
      </ConsoleButton>
      {force.forceClaimBlockReason ? (
        <p className="mt-2 text-xs text-zinc-500">{copy.forceClaim[FORCE_CLAIM_CONSOLE_REASON[force.forceClaimBlockReason]]}</p>
      ) : null}
    </div>
  );
}
