"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatUnits } from "viem";
import { toast } from "sonner";

import { ConfirmActionModal } from "@/components/ConfirmActionModal";
import { ConsoleButton } from "@/components/console/ConsoleButton";
import { WithdrawPreview } from "@/components/WithdrawPreview";
import { bpToPercent, formatToken, safeNumber } from "@/lib/format";
import { formatCountdownHms } from "@/lib/timelockCountdown";
import { useConsoleCopy } from "@/lib/consoleCopy";

export type SmartActionTag = string;

type Props = {
  title: string;
  computePreview: (amount: bigint) => {
    netAmount: bigint;
    feeAmount: bigint;
    penaltyAmount: bigint;
    feeBp: bigint;
    penaltyBp: bigint;
    isLocked: boolean;
  };
  suggestion?: {
    stakeTimestamp: bigint;
    unlockTime: bigint;
    withdrawFeeBP: bigint;
    midTermFeeBP: bigint;
    penaltyFeeBP: bigint;
  };
  protocolStatus?: "NORMAL" | "PAUSED" | "EMERGENCY" | "SHUTDOWN";
  maxWithdrawWei?: bigint;
  onWithdraw: (value: string) => Promise<unknown>;
  disabled?: boolean;
  tokenSymbol?: string;
  /** FOT outbound tax ceiling from core (`0` = standard ERC20). */
  maxTransferFeeBP?: bigint;
  /** 默认：有 suggestion 时显示 B 池费率说明 */
  showFeeTiers?: boolean;
};

const DAY = 24n * 60n * 60n;

function trimDecimalInput(raw: string): string {
  const s = raw.replace(/0+$/, "").replace(/\.$/, "");
  return s === "" ? "0" : s;
}

function feeBpAt(stakeTs: bigint, evalTime: bigint, unlockTime: bigint, withdrawFeeBP: bigint, midTermFeeBP: bigint) {
  if (evalTime < unlockTime) return 0n;
  const stakedFor = evalTime > stakeTs ? evalTime - stakeTs : 0n;
  if (stakedFor < 90n * DAY) return withdrawFeeBP;
  if (stakedFor <= 180n * DAY) return midTermFeeBP;
  return 0n;
}

function penaltyBpAt(evalTime: bigint, unlockTime: bigint, penaltyFeeBP: bigint) {
  return evalTime < unlockTime ? penaltyFeeBP : 0n;
}

/** 提现面板：实时预览 + Smart Suggestions V2 */
export function WithdrawPanel({
  title,
  computePreview,
  suggestion,
  protocolStatus = "NORMAL",
  maxWithdrawWei,
  onWithdraw,
  disabled,
  tokenSymbol = "TokenB",
  maxTransferFeeBP = 0n,
  showFeeTiers,
}: Props) {
  const copy = useConsoleCopy();
  const feeTiersVisible = showFeeTiers ?? Boolean(suggestion);
  const [amount, setAmount] = useState("");
  const [debouncedAmount, setDebouncedAmount] = useState("");
  const [pending, setPending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [waitReminder, setWaitReminder] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const amountInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedAmount(amount), 250);
    return () => clearTimeout(timer);
  }, [amount]);

  const parsed = useMemo(() => {
    const num = Number(debouncedAmount);
    if (!Number.isFinite(num) || num <= 0) return 0n;
    return BigInt(Math.floor(num * 1e18));
  }, [debouncedAmount]);

  const parsedLive = useMemo(() => {
    const num = Number(amount);
    if (!Number.isFinite(num) || num <= 0) return 0n;
    return BigInt(Math.floor(num * 1e18));
  }, [amount]);

  const preview = computePreview(parsed);
  const previewLive = computePreview(parsedLive);

  const basisAmount = useMemo(() => {
    if (parsed > 0n) return parsed;
    if (maxWithdrawWei !== undefined && maxWithdrawWei > 0n) return maxWithdrawWei;
    return 0n;
  }, [parsed, maxWithdrawWei]);

  const smart = useMemo(() => {
    void tick;
    if (!suggestion) return null;
    const nowSec = BigInt(Math.floor(Date.now() / 1000));
    const { stakeTimestamp, unlockTime, withdrawFeeBP, midTermFeeBP, penaltyFeeBP } = suggestion;
    const stakedFor = nowSec > stakeTimestamp ? nowSec - stakeTimestamp : 0n;
    const locked = nowSec < unlockTime;
    const toUnlock = locked ? unlockTime - nowSec : 0n;
    const daysToUnlock = locked ? Number(toUnlock / DAY) : 0;

    let currentFeeBp = 0n;
    if (stakedFor < 90n * DAY) currentFeeBp = withdrawFeeBP;
    else if (stakedFor <= 180n * DAY) currentFeeBp = midTermFeeBP;
    else currentFeeBp = 0n;

    let daysToBetterFee = 0;
    let saveBp = 0n;
    if (!locked && currentFeeBp > 0n) {
      const nextTierIn =
        stakedFor < 90n * DAY
          ? 90n * DAY - stakedFor
          : stakedFor <= 180n * DAY
            ? 180n * DAY + 1n - stakedFor
            : 0n;
      daysToBetterFee = Number(nextTierIn / DAY);
      saveBp = stakedFor < 90n * DAY ? withdrawFeeBP - midTermFeeBP : midTermFeeBP;
    }

    const best = (() => {
      if (locked)
        return { waitDays: daysToUnlock, waitKind: "unlock" as const };
      if (currentFeeBp > 0n) return { waitDays: daysToBetterFee, waitKind: "fee" as const };
      return { waitDays: 0, waitKind: "none" as const };
    })();

    let actionTag: SmartActionTag = copy.withdraw.tagNow;
    if (protocolStatus === "EMERGENCY") actionTag = copy.withdraw.tagEmergency;
    else if (locked || (!locked && currentFeeBp > 0n)) actionTag = copy.withdraw.tagWait;
    else actionTag = copy.withdraw.tagNow;

    /** 下一更优窗口时间戳与费用对比（basisAmount 为预览基准） */
    let nextBestTs = nowSec;
    if (locked) nextBestTs = unlockTime;
    else if (stakedFor < 90n * DAY) nextBestTs = stakeTimestamp + 90n * DAY;
    else if (stakedFor <= 180n * DAY) nextBestTs = stakeTimestamp + 180n * DAY + 1n;
    else nextBestTs = nowSec;

    const feeNowBp = penaltyBpAt(nowSec, unlockTime, penaltyFeeBP) + feeBpAt(stakeTimestamp, nowSec, unlockTime, withdrawFeeBP, midTermFeeBP);
    const feeOptBp =
      nextBestTs > nowSec
        ? feeBpAt(stakeTimestamp, nextBestTs, unlockTime, withdrawFeeBP, midTermFeeBP) + penaltyBpAt(nextBestTs, unlockTime, penaltyFeeBP)
        : feeNowBp;

    const feeNowWei = basisAmount > 0n ? (basisAmount * feeNowBp) / 10_000n : 0n;
    const feeOptWei = basisAmount > 0n ? (basisAmount * feeOptBp) / 10_000n : 0n;
    const saveWei = feeNowWei > feeOptWei ? feeNowWei - feeOptWei : 0n;
    const receiveNowWei = basisAmount >= feeNowWei ? basisAmount - feeNowWei : 0n;
    const receiveOptWei = basisAmount >= feeOptWei ? basisAmount - feeOptWei : 0n;
    const savePctOfAmount =
      basisAmount > 0n && saveWei > 0n ? safeNumber(Number((saveWei * 10_000n) / basisAmount) / 100) : 0;
    const countdownSec = nextBestTs > nowSec ? nextBestTs - nowSec : 0n;
    const optimalLabel = nextBestTs > nowSec ? new Date(Number(nextBestTs) * 1000).toLocaleString() : copy.withdraw.optimalNow;

    const waitDaysMessaging =
      saveWei > 0n && nextBestTs > nowSec
        ? locked && toUnlock > 0n
          ? Math.max(1, Math.ceil(Number(toUnlock) / 86400))
          : Math.max(1, Math.ceil(Number(nextBestTs - nowSec) / 86400))
        : 0;

    const earnLine =
      saveWei > 0n && waitDaysMessaging > 0
        ? copy.withdraw.earnLine(waitDaysMessaging, formatToken(saveWei))
        : null;

    const feeSaveBp = !locked && currentFeeBp > 0n ? saveBp : 0n;

    return {
      locked,
      daysToUnlock,
      currentFeeBp,
      best,
      actionTag,
      unlockTime,
      nextBestTs,
      feeNowWei,
      feeOptWei,
      receiveNowWei,
      receiveOptWei,
      saveWei,
      savePctOfAmount,
      countdownSec,
      optimalLabel,
      earnLine,
      waitDaysMessaging,
      feeSaveBp,
    };
  }, [suggestion, protocolStatus, basisAmount, tick, copy]);

  const exceedsMax =
    maxWithdrawWei !== undefined && maxWithdrawWei > 0n && parsedLive > maxWithdrawWei;

  const onMax = () => {
    if (maxWithdrawWei === undefined || maxWithdrawWei <= 0n) return;
    setAmount(trimDecimalInput(formatUnits(maxWithdrawWei, 18)));
    amountInputRef.current?.focus();
  };

  const openConfirm = () => {
    if (!amount || disabled || pending) return;
    if (parsedLive <= 0n) return;
    if (exceedsMax) {
      toast.error(copy.withdraw.exceedsMaxTitle, {
        description: copy.withdraw.exceedsMaxDesc(formatToken(maxWithdrawWei ?? 0n), tokenSymbol),
      });
      return;
    }
    setConfirmOpen(true);
  };

  const submitConfirmed = async () => {
    if (!amount || disabled) return;
    setPending(true);
    try {
      await onWithdraw(amount);
      setAmount("");
      setWaitReminder(null);
      setConfirmOpen(false);
    } finally {
      setPending(false);
    }
  };

  const onWaitDaysClick = () => {
    if (!smart || smart.best.waitKind === "none") return;
    const days = smart.waitDaysMessaging || smart.best.waitDays;
    const unlockDate = new Date(Number(smart.unlockTime) * 1000).toLocaleString();
    if (smart.best.waitKind === "unlock") {
      toast.info(copy.withdraw.reminderRecorded, {
        description: copy.withdraw.reminderUnlockDesc(
          days,
          String(Number(suggestion?.penaltyFeeBP ?? 0n) / 100),
          unlockDate,
        ),
      });
      setWaitReminder(copy.withdraw.reminderUnlockRecorded(days, unlockDate));
    } else {
      toast.info(copy.withdraw.reminderRecorded, {
        description: copy.withdraw.reminderFeeDesc(days),
      });
      setWaitReminder(copy.withdraw.reminderFeeRecorded(days));
    }
    if (maxWithdrawWei !== undefined && maxWithdrawWei > 0n) {
      const filled = trimDecimalInput(formatUnits(maxWithdrawWei, 18));
      setAmount(filled);
      toast.success(copy.withdraw.maxFilledTitle, { description: copy.withdraw.maxFilledDesc });
    }
    amountInputRef.current?.focus();
  };

  const tagStyles =
    smart?.actionTag === copy.withdraw.tagEmergency
      ? "border-orange-500/40 bg-orange-500/15 text-orange-200"
      : smart?.actionTag === copy.withdraw.tagWait
        ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
        : "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";

  const confirmRows = [
    { label: copy.withdraw.principal, value: `${formatToken(parsedLive)} ${tokenSymbol}` },
    { label: copy.withdraw.receiveEst, value: `${formatToken(previewLive.netAmount)} ${tokenSymbol}` },
    { label: copy.withdraw.feeEst, value: `${formatToken(previewLive.feeAmount)} ${tokenSymbol}` },
    { label: copy.withdraw.penaltyEst, value: `${formatToken(previewLive.penaltyAmount)} ${tokenSymbol}` },
  ];

  return (
    <div className="min-w-0 rounded-2xl border border-zinc-800 bg-gradient-to-b from-zinc-950 to-zinc-900/60 p-3 transition hover:border-zinc-700 sm:p-4">
      <ConfirmActionModal
        open={confirmOpen}
        title={copy.withdraw.confirmTitle}
        rows={confirmRows}
        warning={previewLive.isLocked ? copy.withdraw.confirmLocked : copy.withdraw.confirmNormal}
        confirmText={copy.withdraw.confirmSubmit}
        busy={pending}
        onClose={() => !pending && setConfirmOpen(false)}
        onConfirm={() => void submitConfirmed()}
      />
      <h3 className="text-lg font-semibold text-zinc-100">{title}</h3>
      <div className="mt-2 space-y-2">
        <WithdrawPreview
          netAmount={preview.netAmount}
          feeAmount={preview.feeAmount}
          penaltyAmount={preview.penaltyAmount}
          feeBp={preview.feeBp}
          penaltyBp={preview.penaltyBp}
          tokenSymbol={tokenSymbol}
          maxTransferFeeBP={maxTransferFeeBP}
        />
        {feeTiersVisible ? (
          <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-2 text-xs text-zinc-400">
            <div>{copy.withdraw.feeTierTitle}</div>
            <div>{copy.withdraw.feeTierLt90(bpToPercent(suggestion?.withdrawFeeBP ?? 0n))}</div>
            <div>{copy.withdraw.feeTier90_180(bpToPercent(suggestion?.midTermFeeBP ?? 0n))}</div>
            <div>{copy.withdraw.feeTierGt180}</div>
            {preview.isLocked && <div className="mt-1 text-red-300">{copy.withdraw.lockedPenalty} {bpToPercent(suggestion?.penaltyFeeBP ?? 0n)}。</div>}
          </div>
        ) : (
          <p className="rounded-lg border border-zinc-800 bg-zinc-950/80 px-3 py-2 text-xs text-zinc-500">{copy.withdraw.noLockFee}</p>
        )}
        {smart && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-sm">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold tracking-wide text-zinc-300">{copy.withdraw.smartSuggestions}</span>
              <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${tagStyles}`}>{smart.actionTag}</span>
            </div>

            <div className="mb-3 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 text-xs text-zinc-300">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{copy.withdraw.comparison}</div>
              <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">{copy.withdraw.comparisonHint}</p>

              {smart.countdownSec > 0n && (
                <div className="mt-2 flex flex-col gap-0.5 rounded-md border border-zinc-700/60 bg-zinc-950/50 px-2 py-1.5 font-mono text-[11px] text-zinc-400 sm:flex-row sm:items-center sm:justify-between">
                  <span>{copy.withdraw.betterWindow}</span>
                  <span className="text-zinc-300">{smart.optimalLabel}</span>
                  <span className="tabular-nums text-amber-200/90">{formatCountdownHms(Number(smart.countdownSec))}</span>
                </div>
              )}

              {basisAmount > 0n ? (
                <>
                  {smart.earnLine && (
                    <div className="mt-3 rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-3 py-2.5 text-sm font-semibold tabular-nums text-emerald-100">{smart.earnLine}</div>
                  )}
                  <div className="mt-3 grid gap-2 rounded-md border border-zinc-700/80 bg-zinc-950/80 p-2.5">
                    <div className="flex flex-col justify-between gap-0.5 border-b border-zinc-800 pb-2 sm:flex-row sm:items-baseline sm:gap-4">
                      <span className="text-zinc-500">{copy.withdraw.withdrawNow}</span>
                      <span className="font-mono text-sm font-semibold text-zinc-100">{formatToken(smart.receiveNowWei)} TokenB</span>
                    </div>
                    <div className="flex flex-col justify-between gap-0.5 border-b border-zinc-800 pb-2 sm:flex-row sm:items-baseline sm:gap-4">
                      <span className="text-zinc-500">{copy.withdraw.withdrawLater}</span>
                      <span className="font-mono text-sm font-semibold text-emerald-200/95">{formatToken(smart.receiveOptWei)} TokenB</span>
                    </div>
                    <div className="flex flex-col justify-between gap-0.5 sm:flex-row sm:items-baseline sm:gap-4">
                      <span className="text-zinc-500">{copy.withdraw.difference}</span>
                      <span className={`font-mono text-sm font-semibold ${smart.saveWei > 0n ? "text-emerald-300" : "text-zinc-400"}`}>
                        {smart.saveWei > 0n ? "+" : ""}
                        {formatToken(smart.saveWei)} TokenB
                        {smart.savePctOfAmount > 0 ? (
                          <span className="ml-1 text-xs font-normal text-zinc-500">({safeNumber(smart.savePctOfAmount).toFixed(2)}% {copy.withdraw.basisPct})</span>
                        ) : null}
                      </span>
                    </div>
                  </div>
                  {smart.best.waitKind !== "none" && (
                    <button
                      type="button"
                      onClick={onWaitDaysClick}
                      className="mt-2 w-full rounded-lg border border-sky-500/40 bg-sky-500/10 px-2 py-1.5 text-[11px] font-semibold text-sky-200 transition hover:bg-sky-500/20 sm:w-auto"
                    >
                      {copy.withdraw.recordReminder(smart.waitDaysMessaging || smart.best.waitDays)}
                    </button>
                  )}
                </>
              ) : (
                <p className="mt-2 text-zinc-500">{copy.withdraw.enterAmountHint}</p>
              )}
            </div>

            <div className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-3 text-xs">
              {smart.locked && (
                <div className="text-red-300/95">{copy.withdraw.lockedPenalty} {bpToPercent(suggestion?.penaltyFeeBP ?? 0n)}。</div>
              )}
              {!smart.locked && smart.currentFeeBp > 0n && smart.best.waitKind === "fee" && smart.feeSaveBp > 0n && (
                <div className="text-zinc-400">{copy.withdraw.feeTier} {bpToPercent(smart.feeSaveBp)}。</div>
              )}
              {smart.best.waitKind === "none" && !smart.locked && <div className="text-zinc-500">{copy.withdraw.noDelayAdvantage}</div>}
              {protocolStatus === "EMERGENCY" && (
                <div className="mt-2 text-orange-200/95">{copy.withdraw.emergencyHint}</div>
              )}
            </div>
            {waitReminder && <div className="mt-2 rounded-lg border border-sky-500/30 bg-sky-500/10 px-2 py-1.5 text-xs text-sky-100">{waitReminder}</div>}
          </div>
        )}
      </div>
      <div className="mt-4 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-stretch">
        <input
          ref={amountInputRef}
          value={amount}
          onChange={(e) => {
            const value = e.target.value.replace(/[^\d.]/g, "");
            setAmount(value);
          }}
          placeholder={copy.withdraw.amountPlaceholder}
          className="min-h-[44px] min-w-0 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-zinc-500 sm:flex-1"
        />
        <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-none sm:flex-row sm:items-stretch sm:gap-2">
          {maxWithdrawWei !== undefined && maxWithdrawWei > 0n ? (
            <button
              type="button"
              onClick={onMax}
              disabled={disabled || pending}
              className="min-h-[44px] w-full shrink-0 rounded-lg border border-zinc-600 px-3 py-2 text-xs font-semibold text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto sm:min-w-[4.5rem]"
            >
              {copy.withdraw.max}
            </button>
          ) : null}
          <ConsoleButton
            fullWidth
            disabled={disabled || pending || parsedLive <= 0n}
            onClick={openConfirm}
            className="sm:min-w-[7rem] sm:flex-1"
          >
            {pending ? copy.common.pending : copy.withdraw.submit}
          </ConsoleButton>
        </div>
      </div>
      {maxWithdrawWei !== undefined && maxWithdrawWei > 0n ? (
        <p className="mt-2 text-xs text-zinc-500">
          {copy.withdraw.stakedLine(formatToken(maxWithdrawWei), tokenSymbol)}
          {amount ? ` · ${copy.withdraw.inputLabel}: ${formatToken(parsed)} ${tokenSymbol}` : null}
          {exceedsMax ? <span className="text-red-300/90"> · {copy.withdraw.exceedsBalance}</span> : null}
        </p>
      ) : (
        <p className="mt-2 text-xs text-zinc-500">{copy.withdraw.inputLabel}: {amount ? formatToken(parsed) : "0"} {tokenSymbol}</p>
      )}
    </div>
  );
}
