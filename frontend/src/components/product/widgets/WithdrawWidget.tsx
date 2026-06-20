"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatUnits } from "viem";
import { useAccount } from "wagmi";
import { toast } from "sonner";

import { ConfirmActionModal } from "@/components/ConfirmActionModal";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";
import { bpToPercent, formatToken, safeNumber } from "@/lib/format";
import { walletReceiveAfterFee } from "@/lib/fot";
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

/**
 * 赎回组件：大输入、预计到账前置、费用拆解、全宽主按钮。
 */
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
  const feeTiersVisible = showFeeTiers ?? Boolean(suggestion);
  const [amount, setAmount] = useState("");
  const [debouncedAmount, setDebouncedAmount] = useState("");
  const [pending, setPending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [tick, setTick] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
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
        unlockDate: new Date(Number(unlockTime) * 1000).toLocaleString("zh-CN"),
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
  }, [suggestion, tick]);

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
      toast.error("超过可赎回数量", { description: `最多 ${formatToken(maxWithdrawWei ?? 0n)} ${tokenSymbol}` });
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
        title="确认赎回"
        rows={[
          { label: "赎回数量", value: `${formatToken(parsedLive)} ${tokenSymbol}` },
          { label: "预计到账", value: `${formatToken(displayReceive)} ${tokenSymbol}` },
          { label: "手续费", value: `${formatToken(previewInput.feeAmount)} (${bpToPercent(previewInput.feeBp)})` },
          { label: "提前退出罚金", value: `${formatToken(previewInput.penaltyAmount)} (${bpToPercent(previewInput.penaltyBp)})` },
        ]}
        warning={
          previewInput.isLocked
            ? "锁仓期内赎回将产生罚金，请确认预计到账金额。"
            : "网络 Gas 费用另计。金额为链上参数估算值。"
        }
        confirmText="确认赎回"
        busy={pending}
        onClose={() => !pending && setConfirmOpen(false)}
        onConfirm={() => void submit()}
      />

      {/* 预计到账大数字前置 */}
      <div className="rounded-xl border border-[var(--dp-border)] bg-[var(--dp-accent-muted)] px-4 py-3.5">
        <div className="text-xs font-medium uppercase tracking-wide text-[var(--dp-accent)]">预计到账</div>
        <div className="mt-1 text-3xl font-bold tracking-tight text-zinc-50">
          {hasPosition || parsedLive > 0n ? formatToken(displayReceive, 18, 4) : "0"}
          <span className="ml-2 text-lg font-semibold text-zinc-400">{tokenSymbol}</span>
        </div>
        {fotActive ? (
          <p className="mt-1 text-xs text-zinc-500">
            协议发出 {formatToken(preview.netAmount)} {tokenSymbol}，转账税最高 {bpToPercent(maxTransferFeeBP)} 由用户承担
          </p>
        ) : null}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-lg border border-[var(--dp-border)] bg-[var(--dp-surface-raised)] px-3 py-2.5">
          <div className="text-xs text-zinc-500">手续费</div>
          <div className="mt-0.5 font-medium text-zinc-200">
            {formatToken(preview.feeAmount)} <span className="text-zinc-500">({bpToPercent(preview.feeBp)})</span>
          </div>
        </div>
        <div className="rounded-lg border border-[var(--dp-border)] bg-[var(--dp-surface-raised)] px-3 py-2.5">
          <div className="text-xs text-zinc-500">罚金</div>
          <div className={`mt-0.5 font-medium ${preview.penaltyAmount > 0n ? "text-red-300" : "text-zinc-200"}`}>
            {formatToken(preview.penaltyAmount)} <span className="text-zinc-500">({bpToPercent(preview.penaltyBp)})</span>
          </div>
        </div>
      </div>

      {unlockHint?.kind === "locked" ? (
        <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-100">
          <div className="font-medium">锁仓中 · 剩余 {unlockHint.countdown}</div>
          <div className="mt-1 text-xs text-amber-200/80">
            解锁时间 {unlockHint.unlockDate}；提前退出罚金约 {unlockHint.penalty}
          </div>
        </div>
      ) : unlockHint?.kind === "fee" ? (
        <div className="mt-3 rounded-lg border border-sky-500/25 bg-sky-500/10 px-3 py-2.5 text-sm text-sky-100">
          <div className="font-medium">当前赎回费率 {unlockHint.fee}</div>
          <div className="mt-1 text-xs text-sky-200/80">约 {unlockHint.countdown} 后费率可能更优</div>
        </div>
      ) : feeTiersVisible ? (
        <p className="mt-3 text-xs text-emerald-400/90">当前处于较优赎回窗口，无额外手续费。</p>
      ) : (
        <p className="mt-3 text-xs text-zinc-500">灵活池无锁仓与赎回手续费。</p>
      )}

      <div className="mt-4 flex items-center justify-between gap-3 text-sm font-medium text-zinc-400">
        <span>赎回数量</span>
        <span className="rounded-lg bg-[var(--dp-accent-muted)] px-2.5 py-1 text-sm font-semibold text-[var(--dp-accent)]">
          {tokenSymbol}
        </span>
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
              可赎回 {formatToken(maxWithdrawWei ?? 0n, 18, 4)} {tokenSymbol}
            </span>
            <button
              type="button"
              onClick={onMax}
              disabled={disabled || pending}
              className="font-semibold text-[var(--dp-accent)] hover:underline disabled:opacity-40"
            >
              全部
            </button>
          </div>
        ) : null}
      </div>

      {exceedsMax ? <p className="mt-2 text-xs text-red-400">超过可赎回余额</p> : null}

      <div className="mt-5">
        {!isConnected ? (
          <ConnectWalletButton className="dp-button min-h-[52px] w-full rounded-xl text-base">
            连接钱包以赎回
          </ConnectWalletButton>
        ) : (
          <button
            type="button"
            onClick={openConfirm}
            disabled={disabled || pending || parsedLive <= 0n || !hasPosition}
            className="dp-button min-h-[52px] w-full rounded-xl text-base disabled:opacity-45"
          >
            {pending ? "处理中…" : protocolStatus === "EMERGENCY" ? "赎回（紧急模式下请用紧急退出）" : "赎回"}
          </button>
        )}
      </div>

      {inputAmount > 0n && preview.feeAmount + preview.penaltyAmount > 0n ? (
        <p className="mt-3 text-center text-xs text-zinc-500">
          总扣费约 {formatToken(preview.feeAmount + preview.penaltyAmount)} {tokenSymbol}
          {inputAmount > 0n
            ? `（占 ${safeNumber(Number(((preview.feeAmount + preview.penaltyAmount) * 10_000n) / inputAmount) / 100).toFixed(2)}%）`
            : ""}
        </p>
      ) : null}
    </>
  );

  if (embedded) return body;
  return <div className="dp-card p-5 sm:p-6">{body}</div>;
}
