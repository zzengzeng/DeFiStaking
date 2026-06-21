"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatUnits } from "viem";
import { useAccount } from "wagmi";
import { toast } from "sonner";

import { ConfirmActionModal } from "@/components/ConfirmActionModal";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";
import { NetworkFeeHint } from "@/components/NetworkFeeHint";
import { TransactionPreview } from "@/components/product/TransactionPreview";
import { TokenLabel } from "@/components/TokenLabel";
import { UsdSubtext } from "@/components/UsdSubtext";
import { bpToPercent, formatToken, safeNumber } from "@/lib/format";
import { walletReceiveAfterFee } from "@/lib/fot";
import { dateLocale, useI18n } from "@/lib/i18n";
import { formatCountdownHms } from "@/lib/timelockCountdown";

type Preview = {
  netAmount: bigint;
  feeAmount: bigint;
  penaltyAmount: bigint;
  feeBp: bigint;
  penaltyBp: bigint;
  isLocked: boolean;
};

type Suggestion = {
  stakeTimestamp: bigint;
  unlockTime: bigint;
  withdrawFeeBP: bigint;
  midTermFeeBP: bigint;
  penaltyFeeBP: bigint;
};

type Props = {
  tokenSymbol: string;
  computePreview: (amount: bigint) => Preview;
  suggestion?: Suggestion;
  protocolStatus?: "NORMAL" | "PAUSED" | "EMERGENCY" | "SHUTDOWN";
  maxWithdrawWei?: bigint;
  onWithdraw: (value: string) => Promise<unknown>;
  disabled?: boolean;
  maxTransferFeeBP?: bigint;
  /** 灵活池无费率阶梯说明 */
  showFeeTiers?: boolean;
  /** 嵌入操作卡内时去掉外层卡片 */
  embedded?: boolean;
};

const DAY = 24n * 60n * 60n;

function trimDecimalInput(raw: string): string {
  const s = raw.replace(/0+$/, "").replace(/\.$/, "");
  return s === "" ? "0" : s;
}

/** 赎回组件：大输入、预计到账前置、费用拆解、全宽主按钮。 */
export function WithdrawWidget({
  tokenSymbol,
  computePreview,
  suggestion,
  protocolStatus = "NORMAL",
  maxWithdrawWei,
  onWithdraw,
  disabled,
  maxTransferFeeBP = 0n,
  showFeeTiers,
  embedded = false,
}: Props) {
  const { isConnected } = useAccount();
  const { t, locale } = useI18n();
  const feeTiersVisible = showFeeTiers ?? Boolean(suggestion);
  const [amount, setAmount] = useState("");
  const [debouncedAmount, setDebouncedAmount] = useState("");
  const [pending, setPending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [tick, setTick] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedAmount(amount), 200);
    return () => clearTimeout(timer);
  }, [amount]);

  const parsedLive = useMemo(() => {
    const num = Number(amount);
    if (!Number.isFinite(num) || num <= 0) return 0n;
    return BigInt(Math.floor(num * 1e18));
  }, [amount]);

  const parsed = useMemo(() => {
    const num = Number(debouncedAmount);
    if (!Number.isFinite(num) || num <= 0) return 0n;
    return BigInt(Math.floor(num * 1e18));
  }, [debouncedAmount]);

  const preview = computePreview(parsed > 0n ? parsed : maxWithdrawWei ?? 0n);
  const previewInput = computePreview(parsedLive);

  const unlockHint = useMemo(() => {
    void tick;
    if (!suggestion) return null;
    const now = BigInt(Math.floor(Date.now() / 1000));
    const { unlockTime, stakeTimestamp, withdrawFeeBP, midTermFeeBP, penaltyFeeBP } = suggestion;
    if (now < unlockTime) {
      const left = unlockTime - now;
      return {
        kind: "locked" as const,
        countdown: formatCountdownHms(Number(left)),
        unlockDate: new Date(Number(unlockTime) * 1000).toLocaleString(dateLocale(locale)),
        penalty: bpToPercent(penaltyFeeBP),
      };
    }
    const stakedFor = now > stakeTimestamp ? now - stakeTimestamp : 0n;
    let feeBp = 0n;
    if (stakedFor < 90n * DAY) feeBp = withdrawFeeBP;
    else if (stakedFor <= 180n * DAY) feeBp = midTermFeeBP;
    if (feeBp > 0n) {
      const nextTier =
        stakedFor < 90n * DAY ? stakeTimestamp + 90n * DAY : stakeTimestamp + 180n * DAY + 1n;
      return {
        kind: "fee" as const,
        countdown: formatCountdownHms(Number(nextTier > now ? nextTier - now : 0n)),
        fee: bpToPercent(feeBp),
      };
    }
    return { kind: "optimal" as const };
  }, [suggestion, tick, locale]);

  const fotActive = maxTransferFeeBP > 0n;
  const walletEst = walletReceiveAfterFee(preview.netAmount < 0n ? 0n : preview.netAmount, maxTransferFeeBP);
  const displayReceive = fotActive ? walletEst : preview.netAmount < 0n ? 0n : preview.netAmount;

  const exceedsMax = maxWithdrawWei !== undefined && maxWithdrawWei > 0n && parsedLive > maxWithdrawWei;

  const onMax = () => {
    if (maxWithdrawWei === undefined || maxWithdrawWei <= 0n) return;
    setAmount(trimDecimalInput(formatUnits(maxWithdrawWei, 18)));
    inputRef.current?.focus();
  };

  const openConfirm = () => {
    if (!amount || disabled || pending || parsedLive <= 0n) return;
    if (exceedsMax) {
      toast.error(t("withdraw.exceedsToast"), {
        description: t("withdraw.exceedsToastDesc", {
          amount: formatToken(maxWithdrawWei ?? 0n),
          token: tokenSymbol,
        }),
      });
      return;
    }
    setConfirmOpen(true);
  };

  const submit = async () => {
    setPending(true);
    try {
      await onWithdraw(amount);
      setAmount("");
      setConfirmOpen(false);
    } finally {
      setPending(false);
    }
  };

  const inputAmount = parsedLive > 0n ? parsedLive : maxWithdrawWei ?? 0n;
  const hasPosition = maxWithdrawWei !== undefined && maxWithdrawWei > 0n;

  const body = (
    <>
      <ConfirmActionModal
        open={confirmOpen}
        title={t("withdraw.confirmTitle")}
        rows={[
          { label: t("withdraw.amount"), value: `${formatToken(parsedLive)} ${tokenSymbol}` },
          { label: t("withdraw.receive"), value: `${formatToken(displayReceive)} ${tokenSymbol}` },
          { label: t("withdraw.fee"), value: `${formatToken(previewInput.feeAmount)} (${bpToPercent(previewInput.feeBp)})` },
          {
            label: t("withdraw.earlyPenalty"),
            value: `${formatToken(previewInput.penaltyAmount)} (${bpToPercent(previewInput.penaltyBp)})`,
          },
        ]}
        warning={previewInput.isLocked ? t("withdraw.lockedWarning") : t("withdraw.gasWarning")}
        confirmText={t("withdraw.confirmBtn")}
        busy={pending}
        onClose={() => !pending && setConfirmOpen(false)}
        onConfirm={() => void submit()}
      />

      <div className="rounded-xl border border-[var(--dp-border)] bg-[var(--dp-accent-muted)] px-4 py-3.5">
        <div className="text-xs font-medium uppercase tracking-wide text-[var(--dp-accent)]">{t("withdraw.receive")}</div>
        <div className="mt-1 text-3xl font-bold tracking-tight text-zinc-50">
          {hasPosition || parsedLive > 0n ? formatToken(displayReceive, 18, 4) : "0"}
          <span className="ml-2 inline-flex align-middle">
            <TokenLabel symbol={tokenSymbol} size="sm" symbolClassName="text-lg text-zinc-300" />
          </span>
        </div>
        {displayReceive > 0n ? (
          <UsdSubtext amountWei={displayReceive} symbol={tokenSymbol} className="mt-1 block" />
        ) : null}
        {fotActive ? (
          <p className="mt-1 text-xs text-zinc-500">
            {t("withdraw.fotProtocolLine", {
              amount: formatToken(preview.netAmount),
              token: tokenSymbol,
              pct: bpToPercent(maxTransferFeeBP),
            })}
          </p>
        ) : null}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-lg border border-[var(--dp-border)] bg-[var(--dp-surface-raised)] px-3 py-2.5">
          <div className="text-xs text-zinc-500">{t("withdraw.fee")}</div>
          <div className="mt-0.5 font-medium text-zinc-200">
            {formatToken(preview.feeAmount)} <span className="text-zinc-500">({bpToPercent(preview.feeBp)})</span>
          </div>
        </div>
        <div className="rounded-lg border border-[var(--dp-border)] bg-[var(--dp-surface-raised)] px-3 py-2.5">
          <div className="text-xs text-zinc-500">{t("withdraw.penalty")}</div>
          <div className={`mt-0.5 font-medium ${preview.penaltyAmount > 0n ? "text-red-300" : "text-zinc-200"}`}>
            {formatToken(preview.penaltyAmount)} <span className="text-zinc-500">({bpToPercent(preview.penaltyBp)})</span>
          </div>
        </div>
      </div>

      {parsedLive > 0n || hasPosition ? (
        <div className="mt-4">
          <TransactionPreview
            rows={[
              {
                label: t("txPreview.principal"),
                value: `${formatToken(inputAmount, 18, 4)} ${tokenSymbol}`,
              },
              {
                label: t("txPreview.protocolPayout"),
                value: `${formatToken(preview.netAmount < 0n ? 0n : preview.netAmount, 18, 4)} ${tokenSymbol}`,
                subvalue: t("txPreview.grossAfterFee"),
              },
              {
                label: t("txPreview.walletReceive"),
                value: `${formatToken(displayReceive, 18, 4)} ${tokenSymbol}`,
                subvalue: fotActive ? t("txPreview.fotEstimate", { pct: bpToPercent(maxTransferFeeBP) }) : undefined,
                tone: "good",
              },
              {
                label: t("txPreview.totalDeduction"),
                value: `${formatToken(preview.feeAmount + preview.penaltyAmount, 18, 4)} ${tokenSymbol}`,
                subvalue: t("txPreview.feePenaltyBreakdown", {
                  fee: bpToPercent(preview.feeBp),
                  penalty: bpToPercent(preview.penaltyBp),
                }),
                tone: preview.feeAmount + preview.penaltyAmount > 0n ? "warn" : "neutral",
              },
            ]}
            footnote={fotActive ? t("txPreview.fotWithdrawFootnote") : t("txPreview.netFootnote")}
          />
        </div>
      ) : null}

      {unlockHint?.kind === "locked" ? (
        <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-100">
          <div className="font-medium">{t("withdraw.lockedRemaining", { countdown: unlockHint.countdown })}</div>
          <div className="mt-1 text-xs text-amber-200/80">
            {t("withdraw.lockedPenalty", {
              date: unlockHint.unlockDate,
              penalty: unlockHint.penalty,
            })}
          </div>
        </div>
      ) : unlockHint?.kind === "fee" ? (
        <div className="mt-3 rounded-lg border border-sky-500/25 bg-sky-500/10 px-3 py-2.5 text-sm text-sky-100">
          <div className="font-medium">{t("withdraw.feeTier", { fee: unlockHint.fee })}</div>
          <div className="mt-1 text-xs text-sky-200/80">{t("withdraw.feeTierNext", { countdown: unlockHint.countdown })}</div>
        </div>
      ) : feeTiersVisible ? (
        <p className="mt-3 text-xs text-emerald-400/90">{t("withdraw.optimal")}</p>
      ) : (
        <p className="mt-3 text-xs text-zinc-500">{t("withdraw.flexibleNoFee")}</p>
      )}

      <div className="mt-4 flex items-center justify-between gap-3 text-sm font-medium text-zinc-400">
        <span>{t("withdraw.amount")}</span>
        <TokenLabel symbol={tokenSymbol} size="sm" symbolClassName="text-sm text-[var(--dp-accent)]" />
      </div>
      <div className="mt-2 rounded-xl border border-[var(--dp-border)] bg-[var(--dp-surface-raised)] p-4">
        <input
          ref={inputRef}
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
          placeholder="0.0"
          inputMode="decimal"
          disabled={!isConnected || pending || disabled}
          className="w-full bg-transparent text-3xl font-bold tracking-tight text-zinc-50 outline-none placeholder:text-zinc-600 disabled:opacity-50"
        />
        {hasPosition && isConnected ? (
          <div className="mt-2 flex items-center justify-between text-sm">
            <span className="text-zinc-500">
              {t("withdraw.redeemable", {
                amount: formatToken(maxWithdrawWei ?? 0n, 18, 4),
                token: tokenSymbol,
              })}
            </span>
            <button
              type="button"
              onClick={onMax}
              disabled={disabled || pending}
              className="font-semibold text-[var(--dp-accent)] hover:underline disabled:opacity-40"
            >
              {t("withdraw.all")}
            </button>
          </div>
        ) : null}
        {parsedLive > 0n ? (
          <div className="mt-1 flex justify-end">
            <UsdSubtext amountWei={parsedLive} symbol={tokenSymbol} />
          </div>
        ) : null}
      </div>

      {exceedsMax ? <p className="mt-2 text-xs text-red-400">{t("withdraw.exceedsMax")}</p> : null}

      <div className="mt-5">
        {!isConnected ? (
          <ConnectWalletButton className="dp-button min-h-[52px] w-full rounded-xl text-base">
            {t("withdraw.connect")}
          </ConnectWalletButton>
        ) : (
          <button
            type="button"
            onClick={openConfirm}
            disabled={disabled || pending || parsedLive <= 0n || !hasPosition}
            className="dp-button min-h-[52px] w-full rounded-xl text-base disabled:opacity-45"
          >
            {pending
              ? t("withdraw.busy")
              : protocolStatus === "EMERGENCY"
                ? t("withdraw.emergency")
                : t("withdraw.submit")}
          </button>
        )}
      </div>

      {inputAmount > 0n && preview.feeAmount + preview.penaltyAmount > 0n ? (
        <p className="mt-3 text-center text-xs text-zinc-500">
          {t("withdraw.totalFeeApprox", {
            amount: formatToken(preview.feeAmount + preview.penaltyAmount),
            token: tokenSymbol,
          })}
          {inputAmount > 0n
            ? t("withdraw.pctOfTotal", {
                pct: safeNumber(
                  Number(((preview.feeAmount + preview.penaltyAmount) * 10_000n) / inputAmount) / 100,
                ).toFixed(2),
              })
            : ""}
        </p>
      ) : null}
      <NetworkFeeHint className="mt-3" />
    </>
  );

  if (embedded) return body;
  return <div className="dp-card p-5 sm:p-6">{body}</div>;
}
