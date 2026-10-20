"use client";

import { useMemo, useState } from "react";

import { ConfirmActionModal } from "@/components/ConfirmActionModal";
import { useForceClaimAll } from "@/hooks/useForceClaimAll";
import { usePoolA } from "@/hooks/usePoolA";
import { usePoolB } from "@/hooks/usePoolB";
import { useStaking } from "@/hooks/useStaking";
import { useWriteWithStatus } from "@/hooks/useWriteWithStatus";
import { formatToken } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { CATCH_UP_A, CATCH_UP_B, CATCH_UP_BOTH } from "@/lib/poolCatchUp";
import { formatCountdownHms } from "@/lib/timelockCountdown";
import { parseUserInfoTuple } from "@/lib/userInfo";

type EmergencyPool = "A" | "B";

type Props = {
  onRefetch?: () => void | Promise<unknown>;
  /** 展示哪些池的紧急退出；默认按用户仓位自动展示 */
  emergencyPools?: EmergencyPool[];
};

const FORCE_CLAIM_REASON_KEYS = {
  notAvailable: "forceClaimNotAvailable",
  paused: "protocolPaused",
  emergency: "emergencyFirst",
  cooldown: "claimCooldown",
  noRewards: "noRewards",
  zeroLiquidity: "zeroLiquidity",
  liquidityUnknown: "liquidityUnknown",
} as const;

/** 产品端逃生操作：紧急模式下的 emergencyWithdraw + 关停/坏账时的 forceClaimAll */
export function ProductEscapeActions({ onRefetch, emergencyPools }: Props) {
  const { t } = useI18n();
  const staking = useStaking();
  const poolA = usePoolA();
  const poolB = usePoolB();
  const force = useForceClaimAll();
  const flow = useWriteWithStatus();
  const [emergencyTarget, setEmergencyTarget] = useState<EmergencyPool | null>(null);
  const [forceClaimConfirmOpen, setForceClaimConfirmOpen] = useState(false);

  const busy = flow.state !== "idle";
  const userA = parseUserInfoTuple(staking.userA);
  const userB = parseUserInfoTuple(staking.userB);
  const pendingA = staking.pendingRewardA;
  const pendingB = staking.pendingRewardB;

  const poolsToShow = useMemo(() => {
    const allowed = emergencyPools ?? (["A", "B"] as EmergencyPool[]);
    return allowed.filter((pool) => {
      if (pool === "A") return userA.staked > 0n;
      return userB.staked > 0n;
    });
  }, [emergencyPools, userA.staked, userB.staked]);

  const showEmergency = staking.status === "EMERGENCY" && poolsToShow.length > 0;
  const showForceClaim = force.pathAvailable;

  if (!showEmergency && !showForceClaim) return null;

  const cooldownLabel =
    force.claimCooldownRemainingSec > 0n ? formatCountdownHms(Number(force.claimCooldownRemainingSec)) : null;

  const forceClaimDisabledReason = force.forceClaimBlockReason
    ? t(`escape.${FORCE_CLAIM_REASON_KEYS[force.forceClaimBlockReason]}`)
    : null;

  const runForceClaim = () =>
    flow.executeWrite(
      {
        actionLabel: t("action.forceClaimAll"),
        txType: "claim",
        metadata: { token: "TokenB" },
        onConfirmed: onRefetch,
        catchUpPools: CATCH_UP_BOTH,
      },
      () => force.writeForceClaimAll(),
    );

  const forceClaimConfirmRows =
    force.liquidityStatus === "partial"
      ? [
          { label: t("escape.forceClaimTotal"), value: `${formatToken(force.totalRewards)} TokenB` },
          { label: t("escape.estPayout"), value: `${formatToken(force.estimatedPayTotal)} TokenB` },
          {
            label: t("escape.spendableRemain"),
            value: force.spendableRemain !== null ? `${formatToken(force.spendableRemain)} TokenB` : "—",
          },
        ]
      : [];

  const emergencyRows =
    emergencyTarget === "A"
      ? [
          { label: t("escape.estPrincipal"), value: `${formatToken(userA.staked)} TokenA` },
          { label: t("escape.forfeitRewards"), value: `${formatToken(pendingA)} TokenB` },
        ]
      : emergencyTarget === "B"
        ? [
            { label: t("escape.estPrincipal"), value: `${formatToken(userB.staked)} TokenB` },
            { label: t("escape.forfeitRewards"), value: `${formatToken(pendingB)} TokenB` },
          ]
        : [];

  const runEmergency = async () => {
    if (!emergencyTarget) return;
    const isA = emergencyTarget === "A";
    await flow.executeWrite(
      {
        actionLabel: isA ? t("action.emergencyFlexible") : t("action.emergencyLocked"),
        txType: "emergency",
        metadata: { pool: isA ? "A" : "B", token: isA ? "TokenA" : "TokenB" },
        onConfirmed: onRefetch,
        catchUpPools: isA ? CATCH_UP_A : CATCH_UP_B,
      },
      () => (isA ? poolA.writeEmergencyWithdrawA() : poolB.writeEmergencyWithdrawB()),
    );
    flow.reset({ closeGlobal: true });
    setEmergencyTarget(null);
  };

  return (
    <div id="product-escape-actions" className="scroll-mt-24 space-y-4">
      {showEmergency ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
          <h3 className="text-sm font-semibold text-red-100">{t("escape.emergencyTitle")}</h3>
          <p className="mt-1 text-xs leading-relaxed text-red-200/80">{t("escape.emergencyDesc")}</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {poolsToShow.includes("A") ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => setEmergencyTarget("A")}
                className="min-h-[44px] rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                {t("escape.emergencyFlexible")}
              </button>
            ) : null}
            {poolsToShow.includes("B") ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => setEmergencyTarget("B")}
                className="min-h-[44px] rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                {t("escape.emergencyLocked")}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {showForceClaim ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <h3 className="text-sm font-semibold text-amber-100">{t("escape.forceClaimTitle")}</h3>
          <p className="mt-1 text-xs leading-relaxed text-amber-200/80">{t("escape.forceClaimDesc")}</p>
          <p className="mt-2 text-sm text-zinc-400">
            {t("escape.forceClaimTotal")}{" "}
            <span className="font-mono text-emerald-300/90">{formatToken(force.totalRewards)}</span> TokenB
            <span className="text-zinc-600">
              {" "}
              (A {formatToken(force.rewardsA)} · B {formatToken(force.rewardsB)})
            </span>
          </p>
          {cooldownLabel ? (
            <p className="mt-1 text-xs text-amber-200/90">{t("productPage.claimCooldown", { countdown: cooldownLabel })}</p>
          ) : null}
          {force.liquidityStatus === "partial" ? (
            <p className="mt-2 text-xs leading-relaxed text-amber-200/90">
              {t("escape.liquidityPartialWarn", {
                pay: formatToken(force.estimatedPayTotal),
                pending: formatToken(force.totalRewards),
              })}
            </p>
          ) : null}
          {force.liquidityStatus === "zero" ? (
            <p className="mt-2 text-xs leading-relaxed text-red-300/90">{t("escape.liquidityZeroWarn")}</p>
          ) : null}
          <button
            type="button"
            disabled={!force.canForceClaimAll || busy}
            onClick={() => {
              if (force.needsLiquidityConfirm) setForceClaimConfirmOpen(true);
              else void runForceClaim();
            }}
            className="mt-3 min-h-[44px] w-full rounded-lg bg-amber-400 px-4 py-2 text-sm font-medium text-black disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
          >
            {busy ? t("common.busy") : t("escape.forceClaimBtn")}
          </button>
          {forceClaimDisabledReason ? (
            <p className="mt-2 text-xs text-zinc-500">{forceClaimDisabledReason}</p>
          ) : null}
        </div>
      ) : null}

      <ConfirmActionModal
        open={forceClaimConfirmOpen}
        title={t("escape.confirmForceClaimPartial")}
        variant="danger"
        rows={forceClaimConfirmRows}
        warning={t("escape.confirmForceClaimPartialWarning")}
        confirmText={t("escape.forceClaimBtn")}
        busy={busy}
        onClose={() => !busy && setForceClaimConfirmOpen(false)}
        onConfirm={() => {
          void runForceClaim().finally(() => setForceClaimConfirmOpen(false));
        }}
      />

      <ConfirmActionModal
        open={emergencyTarget !== null}
        title={t("escape.confirmEmergency")}
        variant="danger"
        rows={emergencyRows}
        warning={t("escape.forfeitWarning")}
        confirmText={t("escape.confirmExit")}
        busy={busy}
        onClose={() => !busy && setEmergencyTarget(null)}
        onConfirm={() => void runEmergency()}
      />
    </div>
  );
}
