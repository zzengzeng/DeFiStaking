"use client";

import { useState } from "react";

import { ConfirmActionModal } from "@/components/ConfirmActionModal";
import { ConsoleButton } from "@/components/console/ConsoleButton";
import { useForceClaimAll, type ForceClaimBlockReason } from "@/hooks/useForceClaimAll";
import { useWriteWithStatus } from "@/hooks/useWriteWithStatus";
import { useConsoleCopy } from "@/lib/consoleCopy";
import { CATCH_UP_BOTH } from "@/lib/poolCatchUp";
import { formatToken } from "@/lib/format";
import { formatCountdownHms } from "@/lib/timelockCountdown";

const FORCE_CLAIM_CONSOLE_REASON: Record<
  ForceClaimBlockReason,
  | "disabledNotAvailable"
  | "disabledPaused"
  | "disabledEmergency"
  | "disabledCooldown"
  | "disabledNoRewards"
  | "disabledZeroLiquidity"
  | "disabledLiquidityUnknown"
> = {
  notAvailable: "disabledNotAvailable",
  paused: "disabledPaused",
  emergency: "disabledEmergency",
  cooldown: "disabledCooldown",
  noRewards: "disabledNoRewards",
  zeroLiquidity: "disabledZeroLiquidity",
  liquidityUnknown: "disabledLiquidityUnknown",
};

type Props = {
  onConfirmed?: () => void | Promise<void>;
};

/** 跨池领取（shutdown / badDebt 逃生舱）。 */
export function ForceClaimAllButton({ onConfirmed }: Props) {
  const copy = useConsoleCopy();
  const force = useForceClaimAll();
  const flow = useWriteWithStatus();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const busy = flow.state !== "idle";
  if (!force.pathAvailable && force.totalRewards === 0n) return null;

  const cooldownLabel =
    force.claimCooldownRemainingSec > 0n ? formatCountdownHms(Number(force.claimCooldownRemainingSec)) : null;

  const runForceClaim = () =>
    flow.executeWrite(
      {
        actionLabel: copy.forceClaim.submit,
        txType: "claim",
        metadata: { token: "TokenB" },
        onConfirmed,
        catchUpPools: CATCH_UP_BOTH,
      },
      () => force.writeForceClaimAll(),
    );

  const onSubmitClick = () => {
    if (force.needsLiquidityConfirm) {
      setConfirmOpen(true);
      return;
    }
    void runForceClaim();
  };

  const confirmRows =
    force.liquidityStatus === "partial"
      ? [
          { label: copy.forceClaim.totalPending, value: `${formatToken(force.totalRewards)} TokenB` },
          { label: copy.forceClaim.estPayout, value: `${formatToken(force.estimatedPayTotal)} TokenB` },
          {
            label: copy.forceClaim.spendableRemain,
            value: force.spendableRemain !== null ? `${formatToken(force.spendableRemain)} TokenB` : "—",
          },
        ]
      : [];

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
      {force.liquidityStatus === "partial" ? (
        <p className="mt-2 text-xs leading-relaxed text-amber-200/90">
          {copy.forceClaim.liquidityPartialWarn(
            formatToken(force.estimatedPayTotal),
            formatToken(force.totalRewards),
          )}
        </p>
      ) : null}
      {force.liquidityStatus === "zero" ? (
        <p className="mt-2 text-xs leading-relaxed text-red-300/90">{copy.forceClaim.liquidityZeroWarn}</p>
      ) : null}
      {cooldownLabel ? (
        <p className="mt-1 text-xs text-amber-200/90">
          {copy.forceClaim.cooldown}: {cooldownLabel}
        </p>
      ) : null}
      <ConsoleButton
        fullWidth
        className="mt-3"
        disabled={!force.canForceClaimAll || busy}
        onClick={onSubmitClick}
      >
        {busy ? copy.common.pending : copy.forceClaim.submit}
      </ConsoleButton>
      {force.forceClaimBlockReason ? (
        <p className="mt-2 text-xs text-zinc-500">{copy.forceClaim[FORCE_CLAIM_CONSOLE_REASON[force.forceClaimBlockReason]]}</p>
      ) : null}

      <ConfirmActionModal
        open={confirmOpen}
        title={copy.forceClaim.confirmPartialTitle}
        variant="danger"
        rows={confirmRows}
        warning={copy.forceClaim.confirmPartialWarning}
        confirmText={copy.forceClaim.submit}
        busy={busy}
        onClose={() => !busy && setConfirmOpen(false)}
        onConfirm={() => {
          void runForceClaim().finally(() => setConfirmOpen(false));
        }}
      />
    </div>
  );
}
