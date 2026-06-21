"use client";

import { useEffect, useMemo, useState } from "react";
import { encodeFunctionData, formatUnits } from "viem";
import { useReadContract } from "wagmi";

import { GovernanceCard } from "@/components/GovernanceCard";
import { dualPoolStakingAbi } from "@/contracts/abis/dualPoolStaking";
import { dualPoolStakingAdminAbi } from "@/contracts/abis/dualPoolStakingAdmin";
import { contractAddresses, governanceAddresses, sepoliaAuxAddresses } from "@/contracts/addresses";
import type { useStaking } from "@/hooks/useStaking";
import {
  BASIS_POINTS,
  MAX_EARLY_EXIT_PENALTY_BP,
  MAX_LOCK_DURATION,
  MAX_MIDTERM_BP,
  MAX_MIN_CLAIM_AMOUNT_WEI,
  MAX_REWARD_DURATION,
  MAX_TRANSFER_FEE_BP,
  MAX_WITHDRAW_BP,
  MIN_REWARD_RATE_DURATION,
  minEarlyExitRequired,
  parseAddressInput,
  parseTokenAmountInput,
  parseUintInput,
} from "@/lib/governanceForm";
import { useI18n } from "@/lib/i18n";

const STAKING = contractAddresses.staking;
const STAKING_ABI = dualPoolStakingAbi;

type StakingSnapshot = ReturnType<typeof useStaking>;

type TimelockRoles = {
  canPropose: boolean;
  canExecute: boolean;
  canCancel: boolean;
};

type Props = {
  minDelayGovernance: bigint;
  minDelaySuper: bigint;
  tlGovernance: TimelockRoles;
  tlSuper: TimelockRoles;
  staking: StakingSnapshot;
  onAfterTx: () => Promise<void>;
};

type GovTabId = "params" | "recipients" | "treasury" | "protocol" | "super";

type GovTab = { id: GovTabId; label: string; count: number };

function GovTabBar({ tabs, active, onChange }: { tabs: GovTab[]; active: GovTabId; onChange: (id: GovTabId) => void }) {
  return (
    <div className="col-span-full -mx-1 flex flex-wrap gap-1.5 border-b border-zinc-800 pb-3">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={
            active === tab.id
              ? "rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-black"
              : "rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-xs font-medium text-zinc-400 transition hover:border-zinc-600 hover:text-zinc-200"
          }
        >
          {tab.label}
          <span className="ml-1 opacity-70">({tab.count})</span>
        </button>
      ))}
    </div>
  );
}

function FieldLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <label className="block text-[11px] text-zinc-500">
      {children}
      {hint ? <span className="mt-0.5 block text-zinc-600">{hint}</span> : null}
    </label>
  );
}

const inputClass = "w-full min-w-0 rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm";

/** Timelock → DualPoolStakingAdmin 参数卡片（按 PRD / 门面函数分组）。 */
export function GovernanceTimelockCards({ minDelayGovernance, minDelaySuper, tlGovernance, tlSuper, staking, onAfterTx }: Props) {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<GovTabId>("params");
  const [pagePort, setPagePort] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const govTabs = useMemo(
    (): GovTab[] => [
      { id: "params", label: t("govTimelock.tabs.params"), count: 11 },
      { id: "recipients", label: t("govTimelock.tabs.recipients"), count: 2 },
      { id: "treasury", label: t("govTimelock.tabs.treasury"), count: 4 },
      { id: "protocol", label: t("govTimelock.tabs.protocol"), count: 3 },
      { id: "super", label: t("govTimelock.tabs.super"), count: 3 },
    ],
    [t],
  );

  useEffect(() => {
    setPagePort(window.location.port || null);
  }, []);

  const [withdrawBp, setWithdrawBp] = useState("100");
  const [midtermBp, setMidtermBp] = useState("50");
  const [penaltyBp, setPenaltyBp] = useState("1000");
  const [lockDuration, setLockDuration] = useState("604800");
  const [minEarlyExitAmountB, setMinEarlyExitAmountB] = useState("10");
  const [maxTransferFeeBp, setMaxTransferFeeBp] = useState("1000");
  const [minClaimAmount, setMinClaimAmount] = useState("0");
  const [rewardDurationA, setRewardDurationA] = useState("604800");
  const [rewardDurationB, setRewardDurationB] = useState("604800");
  const [minStakeA, setMinStakeA] = useState("0");
  const [minStakeB, setMinStakeB] = useState("0");
  const [tvlCapA, setTvlCapA] = useState("0");
  const [tvlCapB, setTvlCapB] = useState("0");
  const [feeRecipient, setFeeRecipient] = useState("");
  const [rebalanceAmount, setRebalanceAmount] = useState("10");
  const [rebalanceFrom, setRebalanceFrom] = useState<"A" | "B">("A");
  const [badDebtRepay, setBadDebtRepay] = useState("100");
  const [recoverTokenKind, setRecoverTokenKind] = useState<"A" | "B" | "custom">("B");
  const [recoverTokenCustom, setRecoverTokenCustom] = useState("");
  const [recoverTo, setRecoverTo] = useState("");
  const [recoverAmount, setRecoverAmount] = useState("1");
  const [userModuleAddr, setUserModuleAddr] = useState<string>(sepoliaAuxAddresses.dualPoolUserModule);
  const [adminModuleAddr, setAdminModuleAddr] = useState<string>(sepoliaAuxAddresses.dualPoolAdminModule);
  const [roleTarget, setRoleTarget] = useState("");
  const [roleEnabled, setRoleEnabled] = useState(true);
  const [roleKind, setRoleKind] = useState<"admin" | "operator">("operator");

  const readOpts = { staleTime: 30_000, refetchOnWindowFocus: false } as const;
  const feeRecipientRead = useReadContract({ address: STAKING, abi: STAKING_ABI, functionName: "feeRecipient", query: readOpts });
  const minEarlyExitRead = useReadContract({ address: STAKING, abi: STAKING_ABI, functionName: "minEarlyExitAmountB", query: readOpts });
  const maxTransferFeeRead = useReadContract({ address: STAKING, abi: STAKING_ABI, functionName: "maxTransferFeeBP", query: readOpts });

  const onChainFeeRecipient = feeRecipientRead.data;
  const onChainMinEarlyExit = minEarlyExitRead.data;
  const onChainMaxTransferFee = maxTransferFeeRead.data;

  useEffect(() => {
    if (hydrated || staking.isLoading) return;
    if (staking.withdrawFeeBP !== undefined) setWithdrawBp(staking.withdrawFeeBP.toString());
    if (staking.midTermFeeBP !== undefined) setMidtermBp(staking.midTermFeeBP.toString());
    if (staking.penaltyfeeBP !== undefined) setPenaltyBp(staking.penaltyfeeBP.toString());
    if (staking.lockDuration !== undefined) setLockDuration(staking.lockDuration.toString());
    if (staking.minClaimAmount !== undefined) {
      setMinClaimAmount(staking.minClaimAmount === 0n ? "0" : formatUnits(staking.minClaimAmount, 18));
    }
    if (staking.poolA?.minStakeAmount !== undefined) {
      setMinStakeA(staking.poolA.minStakeAmount === 0n ? "0" : formatUnits(staking.poolA.minStakeAmount, 18));
    }
    if (staking.poolB?.minStakeAmount !== undefined) {
      setMinStakeB(staking.poolB.minStakeAmount === 0n ? "0" : formatUnits(staking.poolB.minStakeAmount, 18));
    }
    if (staking.poolA?.tvlCap !== undefined) {
      setTvlCapA(staking.poolA.tvlCap === 0n ? "0" : formatUnits(staking.poolA.tvlCap, 18));
    }
    if (staking.poolB?.tvlCap !== undefined) {
      setTvlCapB(staking.poolB.tvlCap === 0n ? "0" : formatUnits(staking.poolB.tvlCap, 18));
    }
    if (staking.poolA?.rewardDuration !== undefined) setRewardDurationA(staking.poolA.rewardDuration.toString());
    if (staking.poolB?.rewardDuration !== undefined) setRewardDurationB(staking.poolB.rewardDuration.toString());
    if (onChainMinEarlyExit !== undefined) setMinEarlyExitAmountB(onChainMinEarlyExit.toString());
    if (onChainMaxTransferFee !== undefined) setMaxTransferFeeBp(onChainMaxTransferFee.toString());
    if (onChainFeeRecipient) setFeeRecipient(onChainFeeRecipient);
    setHydrated(true);
  }, [hydrated, staking, onChainFeeRecipient, onChainMinEarlyExit, onChainMaxTransferFee]);

  const withdrawBpValue = parseUintInput(withdrawBp);
  const midtermBpValue = parseUintInput(midtermBp);
  const penaltyBpValue = parseUintInput(penaltyBp);
  const lockDurationValue = parseUintInput(lockDuration);
  const minEarlyExitAmountBValue = parseUintInput(minEarlyExitAmountB);
  const maxTransferFeeBpValue = parseUintInput(maxTransferFeeBp);
  const minClaimAmountValue = parseTokenAmountInput(minClaimAmount);
  const rewardDurationAValue = parseUintInput(rewardDurationA);
  const rewardDurationBValue = parseUintInput(rewardDurationB);
  const minStakeAValue = parseTokenAmountInput(minStakeA);
  const minStakeBValue = parseTokenAmountInput(minStakeB);
  const tvlCapAValue = parseTokenAmountInput(tvlCapA);
  const tvlCapBValue = parseTokenAmountInput(tvlCapB);
  const feeRecipientValue = parseAddressInput(feeRecipient);
  const rebalanceAmountValue = parseTokenAmountInput(rebalanceAmount);
  const badDebtRepayValue = parseTokenAmountInput(badDebtRepay);
  const recoverToValue = parseAddressInput(recoverTo);
  const recoverAmountValue = parseTokenAmountInput(recoverAmount);
  const userModuleValue = parseAddressInput(userModuleAddr);
  const adminModuleValue = parseAddressInput(adminModuleAddr);
  const roleTargetValue = parseAddressInput(roleTarget);

  const recoverTokenAddress = useMemo((): `0x${string}` | null => {
    if (recoverTokenKind === "A") return contractAddresses.tokenA;
    if (recoverTokenKind === "B") return contractAddresses.tokenB;
    return parseAddressInput(recoverTokenCustom);
  }, [recoverTokenKind, recoverTokenCustom]);

  const feesError =
    withdrawBpValue === null || midtermBpValue === null || penaltyBpValue === null
      ? t("govTimelock.validation.feesInteger")
      : withdrawBpValue > MAX_WITHDRAW_BP
        ? t("govTimelock.validation.withdrawFeeMax")
        : midtermBpValue > MAX_MIDTERM_BP
          ? t("govTimelock.validation.midTermFeeMax")
          : penaltyBpValue > MAX_EARLY_EXIT_PENALTY_BP
            ? t("govTimelock.validation.penaltyFeeMax")
            : null;

  const lockError =
    lockDurationValue === null
      ? t("govTimelock.validation.lockDurationInteger")
      : lockDurationValue === 0n || lockDurationValue > MAX_LOCK_DURATION
        ? t("govTimelock.validation.lockDurationRange", { max: MAX_LOCK_DURATION.toString() })
        : null;

  const minEarlyRequired = minEarlyExitRequired(penaltyBpValue);
  const minEarlyError =
    minEarlyExitAmountBValue === null
      ? t("govTimelock.validation.minEarlyInteger")
      : minEarlyExitAmountBValue === 0n
        ? t("govTimelock.validation.minEarlyPositive")
        : minEarlyExitAmountBValue < minEarlyRequired
          ? t("govTimelock.validation.minEarlyMin", { min: minEarlyRequired.toString() })
          : null;

  const maxTransferError =
    maxTransferFeeBpValue === null
      ? t("govTimelock.validation.bpInteger")
      : maxTransferFeeBpValue > MAX_TRANSFER_FEE_BP
        ? t("govTimelock.validation.bpMax10000")
        : null;

  const minClaimError =
    minClaimAmountValue === null
      ? t("govTimelock.validation.minClaimInvalid")
      : minClaimAmountValue > MAX_MIN_CLAIM_AMOUNT_WEI
        ? t("govTimelock.validation.minClaimMax")
        : null;

  const rewardDurationError = (v: bigint | null, label: string) =>
    v === null
      ? t("govTimelock.validation.rewardDurationInteger", { label })
      : v !== 0n && (v < MIN_REWARD_RATE_DURATION || v > MAX_REWARD_DURATION)
        ? t("govTimelock.validation.rewardDurationRange", {
            label,
            min: MIN_REWARD_RATE_DURATION.toString(),
            max: MAX_REWARD_DURATION.toString(),
          })
        : null;

  const tokenAmountOrZeroError = (v: bigint | null, label: string) =>
    v === null ? t("govTimelock.validation.tokenAmountInvalid", { label }) : null;

  const addressError = (v: `0x${string}` | null, label: string) =>
    v ? null : t("govTimelock.validation.addressInvalid", { label });

  const rebalanceError =
    rebalanceAmountValue === null || rebalanceAmountValue <= 0n ? t("govTimelock.validation.rebalanceInvalid") : null;

  const badDebtError = badDebtRepayValue === null || badDebtRepayValue <= 0n ? t("govTimelock.validation.badDebtPositive") : null;

  const recoverError =
    !recoverTokenAddress
      ? t("govTimelock.validation.recoverTokenInvalid")
      : !recoverToValue
        ? t("govTimelock.validation.recoverToInvalid")
        : recoverAmountValue === null || recoverAmountValue <= 0n
          ? t("govTimelock.validation.recoverAmountInvalid")
          : null;

  const roleError = !roleTargetValue ? t("govTimelock.validation.roleTargetInvalid") : null;

  const superTimelockUnsetReason = t("govTimelock.validation.superTimelockUnset");

  const govCardProps = {
    timelockAddress: governanceAddresses.timelock,
    minDelay: minDelayGovernance,
    canPropose: tlGovernance.canPropose,
    canExecute: tlGovernance.canExecute,
    canCancel: tlGovernance.canCancel,
    onAfterTx,
  };
  const superCardProps = {
    timelockAddress: governanceAddresses.timelockSuper,
    minDelay: minDelaySuper,
    canPropose: tlSuper.canPropose,
    canExecute: tlSuper.canExecute,
    canCancel: tlSuper.canCancel,
    onAfterTx,
  };
  const superTimelockUnset = governanceAddresses.timelockSuper === "0x0000000000000000000000000000000000000000";

  const totalCards = govTabs.reduce((n, tab) => n + tab.count, 0);

  return (
    <div className="space-y-3">
      <p className="text-xs leading-relaxed text-zinc-500">
        {t("govTimelock.introPrefix", { total: totalCards })}
        <button type="button" className="text-sky-400 underline" onClick={() => setActiveTab("params")}>
          {t("govTimelock.tabParams")}
        </button>
        {t("govTimelock.introSuffix")}
        {pagePort && pagePort !== "3000" ? (
          <span className="mt-1 block text-amber-200/90">{t("govTimelock.portWarning", { port: pagePort })}</span>
        ) : null}
      </p>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <GovTabBar tabs={govTabs} active={activeTab} onChange={setActiveTab} />

      {activeTab === "params" ? (
        <>
      <GovernanceCard title={t("govTimelock.cards.setFees.title")} hint={t("govTimelock.cards.setFees.hint")} payload={encodeFunctionData({ abi: dualPoolStakingAdminAbi, functionName: "setFees", args: [withdrawBpValue ?? 0n, midtermBpValue ?? 0n, penaltyBpValue ?? 0n] })} {...govCardProps} disabledReason={feesError} executeRows={() => [{ label: "withdraw", value: withdrawBp }, { label: "midterm", value: midtermBp }, { label: "penalty", value: penaltyBp }]}>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <FieldLabel hint="withdrawFeeBP">{t("govTimelock.fields.withdrawBp")}<input value={withdrawBp} onChange={(e) => setWithdrawBp(e.target.value)} className={inputClass} /></FieldLabel>
          <FieldLabel hint="midTermFeeBP">{t("govTimelock.fields.midtermBp")}<input value={midtermBp} onChange={(e) => setMidtermBp(e.target.value)} className={inputClass} /></FieldLabel>
          <FieldLabel hint="penaltyFeeBP">{t("govTimelock.fields.penaltyBp")}<input value={penaltyBp} onChange={(e) => setPenaltyBp(e.target.value)} className={inputClass} /></FieldLabel>
        </div>
      </GovernanceCard>

      <GovernanceCard title={t("govTimelock.cards.setLockDuration.title")} hint={t("govTimelock.cards.setLockDuration.hint")} payload={encodeFunctionData({ abi: dualPoolStakingAdminAbi, functionName: "setLockDuration", args: [lockDurationValue ?? 0n] })} {...govCardProps} disabledReason={lockError} executeRows={() => [{ label: "lockDuration", value: lockDuration }]}>
        <FieldLabel hint={t("govTimelock.cards.setLockDuration.fieldHint")}>{t("govTimelock.fields.seconds")}<input value={lockDuration} onChange={(e) => setLockDuration(e.target.value)} className={inputClass} /></FieldLabel>
      </GovernanceCard>

      <GovernanceCard title={t("govTimelock.cards.setMinClaimAmount.title")} hint={t("govTimelock.cards.setMinClaimAmount.hint")} payload={encodeFunctionData({ abi: dualPoolStakingAdminAbi, functionName: "setMinClaimAmount", args: [minClaimAmountValue ?? 0n] })} {...govCardProps} disabledReason={minClaimError} executeRows={() => [{ label: "amount (TokenB)", value: minClaimAmount }]}>
        <FieldLabel hint={t("govTimelock.cards.setMinClaimAmount.fieldHint")}>{t("govTimelock.fields.amount")}<input value={minClaimAmount} onChange={(e) => setMinClaimAmount(e.target.value)} placeholder={t("govTimelock.fields.placeholderMinClaim")} className={inputClass} /></FieldLabel>
      </GovernanceCard>

      <GovernanceCard title={t("govTimelock.cards.setMinEarlyExitAmountB.title")} hint={t("govTimelock.cards.setMinEarlyExitAmountB.hint")} payload={encodeFunctionData({ abi: dualPoolStakingAdminAbi, functionName: "setMinEarlyExitAmountB", args: [minEarlyExitAmountBValue ?? 0n] })} {...govCardProps} disabledReason={minEarlyError} executeRows={() => [{ label: "wei", value: minEarlyExitAmountB }]}>
        <FieldLabel hint={t("govTimelock.fields.onChainCurrent", { value: onChainMinEarlyExit?.toString() ?? "—" })}>{t("govTimelock.fields.wei")}<input value={minEarlyExitAmountB} onChange={(e) => setMinEarlyExitAmountB(e.target.value)} placeholder="10" className={inputClass} /></FieldLabel>
      </GovernanceCard>

      <GovernanceCard title={t("govTimelock.cards.setMaxTransferFeeBP.title")} hint={t("govTimelock.cards.setMaxTransferFeeBP.hint")} payload={encodeFunctionData({ abi: dualPoolStakingAdminAbi, functionName: "setMaxTransferFeeBP", args: [maxTransferFeeBpValue ?? 0n] })} {...govCardProps} disabledReason={maxTransferError} executeRows={() => [{ label: "bp", value: maxTransferFeeBp }]}>
        <FieldLabel>bp<input value={maxTransferFeeBp} onChange={(e) => setMaxTransferFeeBp(e.target.value)} className={inputClass} /></FieldLabel>
      </GovernanceCard>

      <GovernanceCard title={t("govTimelock.cards.setRewardDurationA.title")} hint={t("govTimelock.cards.setRewardDurationA.hint")} payload={encodeFunctionData({ abi: dualPoolStakingAdminAbi, functionName: "setRewardDurationA", args: [rewardDurationAValue ?? 0n] })} {...govCardProps} disabledReason={rewardDurationError(rewardDurationAValue, "A")} executeRows={() => [{ label: "seconds", value: rewardDurationA }]}>
        <FieldLabel hint={t("govTimelock.cards.setRewardDurationA.fieldHint")}>{t("govTimelock.fields.seconds")}<input value={rewardDurationA} onChange={(e) => setRewardDurationA(e.target.value)} className={inputClass} /></FieldLabel>
      </GovernanceCard>

      <GovernanceCard title={t("govTimelock.cards.setRewardDurationB.title")} hint={t("govTimelock.cards.setRewardDurationB.hint")} payload={encodeFunctionData({ abi: dualPoolStakingAdminAbi, functionName: "setRewardDurationB", args: [rewardDurationBValue ?? 0n] })} {...govCardProps} disabledReason={rewardDurationError(rewardDurationBValue, "B")} executeRows={() => [{ label: "seconds", value: rewardDurationB }]}>
        <FieldLabel hint={t("govTimelock.cards.setRewardDurationB.fieldHint")}>{t("govTimelock.fields.seconds")}<input value={rewardDurationB} onChange={(e) => setRewardDurationB(e.target.value)} className={inputClass} /></FieldLabel>
      </GovernanceCard>

      <GovernanceCard title={t("govTimelock.cards.setMinStakeAmountA.title")} hint={t("govTimelock.cards.setMinStakeAmountA.hint")} payload={encodeFunctionData({ abi: dualPoolStakingAdminAbi, functionName: "setMinStakeAmountA", args: [minStakeAValue ?? 0n] })} {...govCardProps} disabledReason={tokenAmountOrZeroError(minStakeAValue, "A")} executeRows={() => [{ label: "TokenA", value: minStakeA }]}>
        <FieldLabel>{t("govTimelock.fields.amount")}<input value={minStakeA} onChange={(e) => setMinStakeA(e.target.value)} className={inputClass} /></FieldLabel>
      </GovernanceCard>

      <GovernanceCard title={t("govTimelock.cards.setMinStakeAmountB.title")} hint={t("govTimelock.cards.setMinStakeAmountB.hint")} payload={encodeFunctionData({ abi: dualPoolStakingAdminAbi, functionName: "setMinStakeAmountB", args: [minStakeBValue ?? 0n] })} {...govCardProps} disabledReason={tokenAmountOrZeroError(minStakeBValue, "B")} executeRows={() => [{ label: "TokenB", value: minStakeB }]}>
        <FieldLabel>{t("govTimelock.fields.amount")}<input value={minStakeB} onChange={(e) => setMinStakeB(e.target.value)} className={inputClass} /></FieldLabel>
      </GovernanceCard>

      <GovernanceCard title={t("govTimelock.cards.setTVLCapA.title")} hint={t("govTimelock.cards.setTVLCapA.hint")} payload={encodeFunctionData({ abi: dualPoolStakingAdminAbi, functionName: "setTVLCapA", args: [tvlCapAValue ?? 0n] })} {...govCardProps} disabledReason={tokenAmountOrZeroError(tvlCapAValue, "cap A")} executeRows={() => [{ label: "TokenA cap", value: tvlCapA }]}>
        <FieldLabel>{t("govTimelock.fields.cap")}<input value={tvlCapA} onChange={(e) => setTvlCapA(e.target.value)} className={inputClass} /></FieldLabel>
      </GovernanceCard>

      <GovernanceCard title={t("govTimelock.cards.setTVLCapB.title")} hint={t("govTimelock.cards.setTVLCapB.hint")} payload={encodeFunctionData({ abi: dualPoolStakingAdminAbi, functionName: "setTVLCapB", args: [tvlCapBValue ?? 0n] })} {...govCardProps} disabledReason={tokenAmountOrZeroError(tvlCapBValue, "cap B")} executeRows={() => [{ label: "TokenB cap", value: tvlCapB }]}>
        <FieldLabel>{t("govTimelock.fields.cap")}<input value={tvlCapB} onChange={(e) => setTvlCapB(e.target.value)} className={inputClass} /></FieldLabel>
      </GovernanceCard>
        </>
      ) : null}

      {activeTab === "recipients" ? (
        <>
      <GovernanceCard title={t("govTimelock.cards.setFeeRecipient.title")} hint={t("govTimelock.cards.setFeeRecipient.hint")} payload={encodeFunctionData({ abi: dualPoolStakingAdminAbi, functionName: "setFeeRecipient", args: [feeRecipientValue ?? "0x0000000000000000000000000000000000000000"] })} {...govCardProps} disabledReason={addressError(feeRecipientValue, "feeRecipient")} executeRows={() => [{ label: "address", value: feeRecipient }]}>
        <FieldLabel hint={onChainFeeRecipient ? t("govTimelock.fields.onChain", { value: onChainFeeRecipient }) : undefined}>{t("govTimelock.fields.address")}<input value={feeRecipient} onChange={(e) => setFeeRecipient(e.target.value)} className={inputClass} /></FieldLabel>
      </GovernanceCard>
        </>
      ) : null}

      {activeTab === "treasury" ? (
        <>
      <GovernanceCard title={t("govTimelock.cards.rebalanceBudgets.title")} hint={t("govTimelock.cards.rebalanceBudgets.hint")} payload={encodeFunctionData({ abi: dualPoolStakingAdminAbi, functionName: "rebalanceBudgets", args: [rebalanceFrom === "A" ? 0 : 1, rebalanceFrom === "A" ? 1 : 0, rebalanceAmountValue ?? 0n] })} {...govCardProps} disabledReason={rebalanceError} executeRows={() => [{ label: "dir", value: rebalanceFrom === "A" ? "A→B" : "B→A" }, { label: "amount", value: rebalanceAmount }]}>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <select value={rebalanceFrom} onChange={(e) => setRebalanceFrom(e.target.value as "A" | "B")} className={inputClass}>
            <option value="A">A → B</option>
            <option value="B">B → A</option>
          </select>
          <input value={rebalanceAmount} onChange={(e) => setRebalanceAmount(e.target.value)} placeholder={t("govTimelock.fields.tokenBAmount")} className={inputClass} />
        </div>
      </GovernanceCard>

      <GovernanceCard title={t("govTimelock.cards.claimFees.title")} hint={t("govTimelock.cards.claimFees.hint")} payload={encodeFunctionData({ abi: dualPoolStakingAdminAbi, functionName: "claimFees", args: [] })} {...govCardProps} executeRows={() => [{ label: "unclaimedFeesB", value: staking.unclaimedFeesB?.toString() ?? "—" }]}>
        <p className="text-[11px] text-zinc-500">{t("govTimelock.cards.claimFees.noParams")}</p>
      </GovernanceCard>

      <GovernanceCard title={t("govTimelock.cards.resolveBadDebt.title")} hint={t("govTimelock.cards.resolveBadDebt.hint")} payload={encodeFunctionData({ abi: dualPoolStakingAdminAbi, functionName: "resolveBadDebt", args: [badDebtRepayValue ?? 0n] })} {...govCardProps} disabledReason={badDebtError} executeRows={() => [{ label: "TokenB", value: badDebtRepay }, { label: "globalBadDebt", value: staking.globalBadDebt?.toString() ?? "—" }]}>
        <FieldLabel>{t("govTimelock.fields.repayAmount")}<input value={badDebtRepay} onChange={(e) => setBadDebtRepay(e.target.value)} className={inputClass} /></FieldLabel>
      </GovernanceCard>

      <GovernanceCard title={t("govTimelock.cards.recoverToken.title")} hint={t("govTimelock.cards.recoverToken.hint")} payload={encodeFunctionData({ abi: dualPoolStakingAdminAbi, functionName: "recoverToken", args: [recoverTokenAddress ?? "0x0000000000000000000000000000000000000000", recoverToValue ?? "0x0000000000000000000000000000000000000000", recoverAmountValue ?? 0n] })} {...govCardProps} disabledReason={recoverError} executeRows={() => [{ label: "token", value: recoverTokenAddress ?? "—" }, { label: "to", value: recoverTo }, { label: "amount", value: recoverAmount }]}>
        <div className="space-y-2">
          <select value={recoverTokenKind} onChange={(e) => setRecoverTokenKind(e.target.value as "A" | "B" | "custom")} className={inputClass}>
            <option value="A">TokenA</option>
            <option value="B">TokenB</option>
            <option value="custom">{t("govTimelock.fields.customAddress")}</option>
          </select>
          {recoverTokenKind === "custom" ? <input value={recoverTokenCustom} onChange={(e) => setRecoverTokenCustom(e.target.value)} placeholder="0x…" className={inputClass} /> : null}
          <FieldLabel>{t("govTimelock.fields.recoverTo")}<input value={recoverTo} onChange={(e) => setRecoverTo(e.target.value)} className={inputClass} /></FieldLabel>
          <FieldLabel>{t("govTimelock.fields.amount")}<input value={recoverAmount} onChange={(e) => setRecoverAmount(e.target.value)} className={inputClass} /></FieldLabel>
        </div>
      </GovernanceCard>
        </>
      ) : null}

      {activeTab === "protocol" ? (
        <>
      <GovernanceCard title={t("govTimelock.cards.unpause.title")} hint={t("govTimelock.cards.unpause.hint")} payload={encodeFunctionData({ abi: dualPoolStakingAdminAbi, functionName: "unpause", args: [] })} {...govCardProps} executeRows={() => [{ label: "status", value: staking.status }]}>
        <p className="text-[11px] text-zinc-500">{t("govTimelock.cards.unpause.noParams", { status: staking.status })}</p>
      </GovernanceCard>

      <GovernanceCard title={t("govTimelock.cards.activateShutdown.title")} hint={t("govTimelock.cards.activateShutdown.hint")} payload={encodeFunctionData({ abi: dualPoolStakingAdminAbi, functionName: "activateShutdown", args: [] })} {...govCardProps} executeRows={() => [{ label: "warning", value: t("govTimelock.cards.activateShutdown.warning") }]}>
        <p className="text-[11px] text-amber-200/90">{t("govTimelock.cards.activateShutdown.risk")}</p>
      </GovernanceCard>

      <GovernanceCard title={t("govTimelock.cards.forceShutdownFinalize.title")} hint={t("govTimelock.cards.forceShutdownFinalize.hint")} payload={encodeFunctionData({ abi: dualPoolStakingAdminAbi, functionName: "forceShutdownFinalize", args: [] })} {...govCardProps} executeRows={() => [{ label: "warning", value: t("govTimelock.cards.forceShutdownFinalize.warning") }]}>
        <p className="text-[11px] text-amber-200/90">{t("govTimelock.cards.forceShutdownFinalize.risk")}</p>
      </GovernanceCard>
        </>
      ) : null}

      {activeTab === "super" ? (
        <>
      <p className="col-span-full text-[11px] text-amber-200/90">
        {t("govTimelock.super.hint")}
        {superTimelockUnset ? t("govTimelock.super.timelockUnset") : null}
      </p>
      <GovernanceCard title={t("govTimelock.cards.setUserModule.title")} hint={t("govTimelock.cards.setUserModule.hint")} payload={encodeFunctionData({ abi: dualPoolStakingAdminAbi, functionName: "setUserModule", args: [userModuleValue ?? "0x0000000000000000000000000000000000000000"] })} {...superCardProps} disabledReason={superTimelockUnset ? superTimelockUnsetReason : addressError(userModuleValue, "module")} executeRows={() => [{ label: "newModule", value: userModuleAddr }]}>
        <FieldLabel>{t("govTimelock.fields.newModuleAddr")}<input value={userModuleAddr} onChange={(e) => setUserModuleAddr(e.target.value)} className={inputClass} /></FieldLabel>
      </GovernanceCard>

      <GovernanceCard title={t("govTimelock.cards.setAdminModule.title")} hint={t("govTimelock.cards.setAdminModule.hint")} payload={encodeFunctionData({ abi: dualPoolStakingAdminAbi, functionName: "setAdminModule", args: [adminModuleValue ?? "0x0000000000000000000000000000000000000000"] })} {...superCardProps} disabledReason={superTimelockUnset ? superTimelockUnsetReason : addressError(adminModuleValue, "module")} executeRows={() => [{ label: "newModule", value: adminModuleAddr }]}>
        <FieldLabel>{t("govTimelock.fields.newModuleAddr")}<input value={adminModuleAddr} onChange={(e) => setAdminModuleAddr(e.target.value)} className={inputClass} /></FieldLabel>
      </GovernanceCard>

      <GovernanceCard
        title={roleKind === "admin" ? t("govTimelock.cards.setAdmin.title") : t("govTimelock.cards.setOperator.title")}
        hint={roleKind === "admin" ? t("govTimelock.cards.setAdmin.hint") : t("govTimelock.cards.setOperator.hint")}
        payload={encodeFunctionData({
          abi: dualPoolStakingAdminAbi,
          functionName: roleKind === "admin" ? "setAdmin" : "setOperator",
          args: [roleTargetValue ?? "0x0000000000000000000000000000000000000000", roleEnabled],
        })}
        {...superCardProps}
        disabledReason={superTimelockUnset ? superTimelockUnsetReason : roleError}
        executeRows={() => [{ label: "target", value: roleTarget }, { label: "enabled", value: roleEnabled ? "true" : "false" }]}
      >
        <div className="space-y-2">
          <select value={roleKind} onChange={(e) => setRoleKind(e.target.value as "admin" | "operator")} className={inputClass}>
            <option value="operator">OPERATOR_ROLE</option>
            <option value="admin">ADMIN_ROLE</option>
          </select>
          <input value={roleTarget} onChange={(e) => setRoleTarget(e.target.value)} placeholder="0x…" className={inputClass} />
          <label className="flex items-center gap-2 text-xs text-zinc-400">
            <input type="checkbox" checked={roleEnabled} onChange={(e) => setRoleEnabled(e.target.checked)} />
            {t("govTimelock.fields.enabledGrant")}
          </label>
        </div>
      </GovernanceCard>
        </>
      ) : null}
      </div>
    </div>
  );
}
