"use client";

import { useMemo, useState } from "react";

import { ConfirmActionModal } from "@/components/ConfirmActionModal";
import { useForceClaimAll } from "@/hooks/useForceClaimAll";
import { usePoolA } from "@/hooks/usePoolA";
import { usePoolB } from "@/hooks/usePoolB";
import { useStaking } from "@/hooks/useStaking";
import { useWriteWithStatus } from "@/hooks/useWriteWithStatus";
import { formatToken } from "@/lib/format";
import { formatCountdownHms } from "@/lib/timelockCountdown";
import { parseUserInfoTuple } from "@/lib/userInfo";

type EmergencyPool = "A" | "B";

type Props = {
  onRefetch?: () => void | Promise<unknown>;
  /** 展示哪些池的紧急退出；默认按用户仓位自动展示 */
  emergencyPools?: EmergencyPool[];
};

/** 产品端逃生操作：紧急模式下的 emergencyWithdraw + 关停/坏账时的 forceClaimAll */
export function ProductEscapeActions({ onRefetch, emergencyPools }: Props) {
  const staking = useStaking();
  const poolA = usePoolA();
  const poolB = usePoolB();
  const force = useForceClaimAll();
  const flow = useWriteWithStatus();
  const [emergencyTarget, setEmergencyTarget] = useState<EmergencyPool | null>(null);

  const busy = flow.state !== "idle";
  const userA = parseUserInfoTuple(staking.userA);
  const userB = parseUserInfoTuple(staking.userB);

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

  const emergencyRows =
    emergencyTarget === "A"
      ? [
          { label: "预计返还本金", value: `${formatToken(userA.staked)} TokenA` },
          { label: "将放弃奖励", value: `${formatToken(userA.rewards)} TokenB` },
        ]
      : emergencyTarget === "B"
        ? [
            { label: "预计返还本金", value: `${formatToken(userB.staked)} TokenB` },
            { label: "将放弃奖励", value: `${formatToken(userB.rewards)} TokenB` },
          ]
        : [];

  const runEmergency = async () => {
    if (!emergencyTarget) return;
    const isA = emergencyTarget === "A";
    await flow.executeWrite(
      {
        actionLabel: isA ? "紧急退出（灵活池）" : "紧急退出（锁仓池）",
        txType: "emergency",
        metadata: { pool: isA ? "A" : "B", token: isA ? "TokenA" : "TokenB" },
        onConfirmed: onRefetch,
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
          <h3 className="text-sm font-semibold text-red-100">紧急退出</h3>
          <p className="mt-1 text-xs leading-relaxed text-red-200/80">
            协议处于紧急模式：质押、领取、复利已暂停。你可取回本金，未领取奖励将永久放弃。
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {poolsToShow.includes("A") ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => setEmergencyTarget("A")}
                className="min-h-[44px] rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                紧急退出灵活池（TokenA）
              </button>
            ) : null}
            {poolsToShow.includes("B") ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => setEmergencyTarget("B")}
                className="min-h-[44px] rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                紧急退出锁仓池（TokenB）
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {showForceClaim ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <h3 className="text-sm font-semibold text-amber-100">跨池领取奖励</h3>
          <p className="mt-1 text-xs leading-relaxed text-amber-200/80">
            协议关停或存在坏账时，可一次性领取灵活池与锁仓池的 TokenB 奖励（链上{" "}
            <span className="font-mono text-amber-100/90">forceClaimAll</span>
            ）。紧急模式未关停前请先完成紧急退出。
          </p>
          <p className="mt-2 text-sm text-zinc-400">
            合计待领:{" "}
            <span className="font-mono text-emerald-300/90">{formatToken(force.totalRewards)}</span> TokenB
            <span className="text-zinc-600">
              {" "}
              (A {formatToken(force.rewardsA)} · B {formatToken(force.rewardsB)})
            </span>
          </p>
          {cooldownLabel ? <p className="mt-1 text-xs text-amber-200/90">领取冷却：{cooldownLabel}</p> : null}
          <button
            type="button"
            disabled={!force.canForceClaimAll || busy}
            onClick={() =>
              void flow.executeWrite(
                {
                  actionLabel: "跨池领取奖励",
                  txType: "claim",
                  metadata: { token: "TokenB" },
                  onConfirmed: onRefetch,
                },
                () => force.writeForceClaimAll(),
              )
            }
            className="mt-3 min-h-[44px] w-full rounded-lg bg-amber-400 px-4 py-2 text-sm font-medium text-black disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
          >
            {busy ? "处理中…" : "跨池领取"}
          </button>
          {force.forceClaimDisabledReason ? (
            <p className="mt-2 text-xs text-zinc-500">{force.forceClaimDisabledReason}</p>
          ) : null}
        </div>
      ) : null}

      <ConfirmActionModal
        open={emergencyTarget !== null}
        title="确认紧急退出"
        variant="danger"
        rows={emergencyRows}
        warning="紧急退出后未领取奖励将永久放弃。"
        confirmText="确认退出"
        busy={busy}
        onClose={() => !busy && setEmergencyTarget(null)}
        onConfirm={() => void runEmergency()}
      />
    </div>
  );
}
