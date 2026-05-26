"use client";

import { useEffect, useMemo, useState } from "react";
import { encodeFunctionData, formatUnits } from "viem";
import { useReadContract } from "wagmi";

import { GovernanceCard } from "@/components/GovernanceCard";
import { dualPoolStakingAbi } from "@/contracts/abis/dualPoolStaking";
import { dualPoolStakingAdminAbi } from "@/contracts/abis/dualPoolStakingAdmin";
import { contractAddresses, sepoliaAuxAddresses } from "@/contracts/addresses";
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

const STAKING = contractAddresses.staking;
const STAKING_ABI = dualPoolStakingAbi;

type StakingSnapshot = ReturnType<typeof useStaking>;

type TimelockRoles = {
  canPropose: boolean;
  canExecute: boolean;
  canCancel: boolean;
};

type Props = {
  minDelay: bigint;
  tl: TimelockRoles;
  staking: StakingSnapshot;
  onAfterTx: () => Promise<void>;
};

type GovTabId = "params" | "recipients" | "treasury" | "protocol" | "super";

const GOV_TABS: { id: GovTabId; label: string; count: number }[] = [
  { id: "params", label: "参数与费率", count: 11 },
  { id: "recipients", label: "收款地址", count: 2 },
  { id: "treasury", label: "金库与预算", count: 4 },
  { id: "protocol", label: "协议状态", count: 3 },
  { id: "super", label: "超级路径", count: 3 },
];

function GovTabBar({ active, onChange }: { active: GovTabId; onChange: (id: GovTabId) => void }) {
  return (
    <div className="col-span-full -mx-1 flex flex-wrap gap-1.5 border-b border-zinc-800 pb-3">
      {GOV_TABS.map((tab) => (
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
export function GovernanceTimelockCards({ minDelay, tl, staking, onAfterTx }: Props) {
  const [activeTab, setActiveTab] = useState<GovTabId>("params");
  const [pagePort, setPagePort] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

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
  const [forfeitedRecipient, setForfeitedRecipient] = useState("");
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
  const forfeitedRecipientRead = useReadContract({ address: STAKING, abi: STAKING_ABI, functionName: "forfeitedRecipient", query: readOpts });
  const minEarlyExitRead = useReadContract({ address: STAKING, abi: STAKING_ABI, functionName: "minEarlyExitAmountB", query: readOpts });
  const maxTransferFeeRead = useReadContract({ address: STAKING, abi: STAKING_ABI, functionName: "maxTransferFeeBP", query: readOpts });

  const onChainFeeRecipient = feeRecipientRead.data;
  const onChainForfeitedRecipient = forfeitedRecipientRead.data;
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
    if (onChainForfeitedRecipient) setForfeitedRecipient(onChainForfeitedRecipient);
    setHydrated(true);
  }, [hydrated, staking, onChainFeeRecipient, onChainForfeitedRecipient, onChainMinEarlyExit, onChainMaxTransferFee]);

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
  const forfeitedRecipientValue = parseAddressInput(forfeitedRecipient);
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
      ? "费用参数必须是整数 bp"
      : withdrawBpValue > MAX_WITHDRAW_BP
        ? "withdrawFeeBP 不能超过 500 bp"
        : midtermBpValue > MAX_MIDTERM_BP
          ? "midTermFeeBP 不能超过 500 bp"
          : penaltyBpValue > MAX_EARLY_EXIT_PENALTY_BP
            ? "penaltyFeeBP 不能超过 2000 bp"
            : null;

  const lockError =
    lockDurationValue === null
      ? "lockDuration 必须是整数秒"
      : lockDurationValue === 0n || lockDurationValue > MAX_LOCK_DURATION
        ? `lockDuration 须在 1～${MAX_LOCK_DURATION.toString()} 秒`
        : null;

  const minEarlyRequired = minEarlyExitRequired(penaltyBpValue);
  const minEarlyError =
    minEarlyExitAmountBValue === null
      ? "minEarlyExitAmountB 须为整数（wei）"
      : minEarlyExitAmountBValue === 0n
        ? "须大于 0"
        : minEarlyExitAmountBValue < minEarlyRequired
          ? `至少 ${minEarlyRequired.toString()} wei`
          : null;

  const maxTransferError =
    maxTransferFeeBpValue === null
      ? "须为整数 bp"
      : maxTransferFeeBpValue > MAX_TRANSFER_FEE_BP
        ? "不能超过 10000 bp"
        : null;

  const minClaimError =
    minClaimAmountValue === null
      ? "须为有效 TokenB 数量（18 位小数）"
      : minClaimAmountValue > MAX_MIN_CLAIM_AMOUNT_WEI
        ? "不能超过 0.1 TokenB（1e17 wei）"
        : null;

  const rewardDurationError = (v: bigint | null, label: string) =>
    v === null
      ? `${label} 须为整数秒（0=清除默认）`
      : v !== 0n && (v < MIN_REWARD_RATE_DURATION || v > MAX_REWARD_DURATION)
        ? `${label} 为 0 或 ${MIN_REWARD_RATE_DURATION.toString()}～${MAX_REWARD_DURATION.toString()} 秒`
        : null;

  const tokenAmountOrZeroError = (v: bigint | null, label: string) =>
    v === null ? `${label} 须为有效数量（0=不限制）` : null;

  const addressError = (v: `0x${string}` | null, label: string) => (v ? null : `${label} 须为有效 0x 地址`);

  const rebalanceError =
    rebalanceAmountValue === null || rebalanceAmountValue <= 0n ? "rebalance 须为大于 0 的 TokenB" : null;

  const badDebtError = badDebtRepayValue === null || badDebtRepayValue <= 0n ? "还款额须大于 0" : null;

  const recoverError =
    !recoverTokenAddress
      ? "token 地址无效"
      : !recoverToValue
        ? "收款地址无效"
        : recoverAmountValue === null || recoverAmountValue <= 0n
          ? "amount 须大于 0"
          : null;

  const roleError = !roleTargetValue ? "目标地址无效" : null;

  const cardProps = { minDelay, canPropose: tl.canPropose, canExecute: tl.canExecute, canCancel: tl.canCancel, onAfterTx };

  const totalCards = GOV_TABS.reduce((n, t) => n + t.count, 0);

  return (
    <div className="space-y-3">
      <p className="text-xs leading-relaxed text-zinc-500">
        Timelock 治理共 <span className="font-semibold text-zinc-300">{totalCards}</span> 项操作（经{" "}
        <span className="font-mono text-zinc-400">DualPoolStakingAdmin</span>）。请用下方 Tab 切换分组；例如{" "}
        <button type="button" className="text-sky-400 underline" onClick={() => setActiveTab("params")}>
          参数与费率
        </button>{" "}
        中含 setMinClaimAmount、setRewardDuration、setTVLCap 等。
        {pagePort && pagePort !== "3000" ? (
          <span className="mt-1 block text-amber-200/90">
            当前访问端口 {pagePort}：若 Governance 仍只有 6 张旧卡片，说明打开了旧 dev 实例，请改用此端口或关掉占用 3000 的进程后重启。
          </span>
        ) : null}
      </p>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <GovTabBar active={activeTab} onChange={setActiveTab} />

      {activeTab === "params" ? (
        <>
      <GovernanceCard title="setFees (bp)" hint="B 池提现 / 中期 / 提前退出费率" payload={encodeFunctionData({ abi: dualPoolStakingAdminAbi, functionName: "setFees", args: [withdrawBpValue ?? 0n, midtermBpValue ?? 0n, penaltyBpValue ?? 0n] })} {...cardProps} disabledReason={feesError} executeRows={() => [{ label: "withdraw", value: withdrawBp }, { label: "midterm", value: midtermBp }, { label: "penalty", value: penaltyBp }]}>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <FieldLabel hint="withdrawFeeBP">提现 bp<input value={withdrawBp} onChange={(e) => setWithdrawBp(e.target.value)} className={inputClass} /></FieldLabel>
          <FieldLabel hint="midTermFeeBP">中期 bp<input value={midtermBp} onChange={(e) => setMidtermBp(e.target.value)} className={inputClass} /></FieldLabel>
          <FieldLabel hint="penaltyFeeBP">提前退出 bp<input value={penaltyBp} onChange={(e) => setPenaltyBp(e.target.value)} className={inputClass} /></FieldLabel>
        </div>
      </GovernanceCard>

      <GovernanceCard title="setLockDuration (seconds)" hint="B 池滚动锁仓时长" payload={encodeFunctionData({ abi: dualPoolStakingAdminAbi, functionName: "setLockDuration", args: [lockDurationValue ?? 0n] })} {...cardProps} disabledReason={lockError} executeRows={() => [{ label: "lockDuration", value: lockDuration }]}>
        <FieldLabel hint="默认 604800 = 7 天">秒<input value={lockDuration} onChange={(e) => setLockDuration(e.target.value)} className={inputClass} /></FieldLabel>
      </GovernanceCard>

      <GovernanceCard title="setMinClaimAmount" hint="领取 TokenB 奖励最低门槛；0=无门槛，上限 0.1 TokenB" payload={encodeFunctionData({ abi: dualPoolStakingAdminAbi, functionName: "setMinClaimAmount", args: [minClaimAmountValue ?? 0n] })} {...cardProps} disabledReason={minClaimError} executeRows={() => [{ label: "amount (TokenB)", value: minClaimAmount }]}>
        <FieldLabel hint="TokenB 数量（18 decimals）">数量<input value={minClaimAmount} onChange={(e) => setMinClaimAmount(e.target.value)} placeholder="0 或 0.001" className={inputClass} /></FieldLabel>
      </GovernanceCard>

      <GovernanceCard title="setMinEarlyExitAmountB (wei)" hint="B 池提前退出最小本金（最小单位 wei，非 Token 小数）" payload={encodeFunctionData({ abi: dualPoolStakingAdminAbi, functionName: "setMinEarlyExitAmountB", args: [minEarlyExitAmountBValue ?? 0n] })} {...cardProps} disabledReason={minEarlyError} executeRows={() => [{ label: "wei", value: minEarlyExitAmountB }]}>
        <FieldLabel hint={`链上当前: ${onChainMinEarlyExit?.toString() ?? "—"}`}>wei<input value={minEarlyExitAmountB} onChange={(e) => setMinEarlyExitAmountB(e.target.value)} placeholder="10" className={inputClass} /></FieldLabel>
      </GovernanceCard>

      <GovernanceCard title="setMaxTransferFeeBP" hint="FOT Token 转账损耗容差（bp）" payload={encodeFunctionData({ abi: dualPoolStakingAdminAbi, functionName: "setMaxTransferFeeBP", args: [maxTransferFeeBpValue ?? 0n] })} {...cardProps} disabledReason={maxTransferError} executeRows={() => [{ label: "bp", value: maxTransferFeeBp }]}>
        <FieldLabel>bp<input value={maxTransferFeeBp} onChange={(e) => setMaxTransferFeeBp(e.target.value)} className={inputClass} /></FieldLabel>
      </GovernanceCard>

      <GovernanceCard title="setRewardDurationA" hint="notifyRewardAmountA(amount,0) 使用的默认周期；0=清除" payload={encodeFunctionData({ abi: dualPoolStakingAdminAbi, functionName: "setRewardDurationA", args: [rewardDurationAValue ?? 0n] })} {...cardProps} disabledReason={rewardDurationError(rewardDurationAValue, "A")} executeRows={() => [{ label: "seconds", value: rewardDurationA }]}>
        <FieldLabel hint="86400～31536000 或 0">秒<input value={rewardDurationA} onChange={(e) => setRewardDurationA(e.target.value)} className={inputClass} /></FieldLabel>
      </GovernanceCard>

      <GovernanceCard title="setRewardDurationB" hint="notifyRewardAmountB(amount,0) 使用的默认周期；0=清除" payload={encodeFunctionData({ abi: dualPoolStakingAdminAbi, functionName: "setRewardDurationB", args: [rewardDurationBValue ?? 0n] })} {...cardProps} disabledReason={rewardDurationError(rewardDurationBValue, "B")} executeRows={() => [{ label: "seconds", value: rewardDurationB }]}>
        <FieldLabel hint="86400～31536000 或 0">秒<input value={rewardDurationB} onChange={(e) => setRewardDurationB(e.target.value)} className={inputClass} /></FieldLabel>
      </GovernanceCard>

      <GovernanceCard title="setMinStakeAmountA" hint="Pool A 最小质押（TokenA）；0=不限制" payload={encodeFunctionData({ abi: dualPoolStakingAdminAbi, functionName: "setMinStakeAmountA", args: [minStakeAValue ?? 0n] })} {...cardProps} disabledReason={tokenAmountOrZeroError(minStakeAValue, "A")} executeRows={() => [{ label: "TokenA", value: minStakeA }]}>
        <FieldLabel>数量<input value={minStakeA} onChange={(e) => setMinStakeA(e.target.value)} className={inputClass} /></FieldLabel>
      </GovernanceCard>

      <GovernanceCard title="setMinStakeAmountB" hint="Pool B 最小质押（TokenB）；0=不限制" payload={encodeFunctionData({ abi: dualPoolStakingAdminAbi, functionName: "setMinStakeAmountB", args: [minStakeBValue ?? 0n] })} {...cardProps} disabledReason={tokenAmountOrZeroError(minStakeBValue, "B")} executeRows={() => [{ label: "TokenB", value: minStakeB }]}>
        <FieldLabel>数量<input value={minStakeB} onChange={(e) => setMinStakeB(e.target.value)} className={inputClass} /></FieldLabel>
      </GovernanceCard>

      <GovernanceCard title="setTVLCapA" hint="Pool A TVL 上限（TokenA）；0=不 cap" payload={encodeFunctionData({ abi: dualPoolStakingAdminAbi, functionName: "setTVLCapA", args: [tvlCapAValue ?? 0n] })} {...cardProps} disabledReason={tokenAmountOrZeroError(tvlCapAValue, "cap A")} executeRows={() => [{ label: "TokenA cap", value: tvlCapA }]}>
        <FieldLabel>上限<input value={tvlCapA} onChange={(e) => setTvlCapA(e.target.value)} className={inputClass} /></FieldLabel>
      </GovernanceCard>

      <GovernanceCard title="setTVLCapB" hint="Pool B TVL 上限（TokenB）；0=不 cap" payload={encodeFunctionData({ abi: dualPoolStakingAdminAbi, functionName: "setTVLCapB", args: [tvlCapBValue ?? 0n] })} {...cardProps} disabledReason={tokenAmountOrZeroError(tvlCapBValue, "cap B")} executeRows={() => [{ label: "TokenB cap", value: tvlCapB }]}>
        <FieldLabel>上限<input value={tvlCapB} onChange={(e) => setTvlCapB(e.target.value)} className={inputClass} /></FieldLabel>
      </GovernanceCard>
        </>
      ) : null}

      {activeTab === "recipients" ? (
        <>
      <GovernanceCard title="setFeeRecipient" hint="B 池提现手续费收款地址" payload={encodeFunctionData({ abi: dualPoolStakingAdminAbi, functionName: "setFeeRecipient", args: [feeRecipientValue ?? "0x0000000000000000000000000000000000000000"] })} {...cardProps} disabledReason={addressError(feeRecipientValue, "feeRecipient")} executeRows={() => [{ label: "address", value: feeRecipient }]}>
        <FieldLabel hint={onChainFeeRecipient ? `链上: ${onChainFeeRecipient}` : undefined}>地址<input value={feeRecipient} onChange={(e) => setFeeRecipient(e.target.value)} className={inputClass} /></FieldLabel>
      </GovernanceCard>

      <GovernanceCard title="setForfeitedRecipient" hint="罚没 / 紧急退出 forfeited 收款地址" payload={encodeFunctionData({ abi: dualPoolStakingAdminAbi, functionName: "setForfeitedRecipient", args: [forfeitedRecipientValue ?? "0x0000000000000000000000000000000000000000"] })} {...cardProps} disabledReason={addressError(forfeitedRecipientValue, "forfeitedRecipient")} executeRows={() => [{ label: "address", value: forfeitedRecipient }]}>
        <FieldLabel hint={onChainForfeitedRecipient ? `链上: ${onChainForfeitedRecipient}` : undefined}>地址<input value={forfeitedRecipient} onChange={(e) => setForfeitedRecipient(e.target.value)} className={inputClass} /></FieldLabel>
      </GovernanceCard>
        </>
      ) : null}

      {activeTab === "treasury" ? (
        <>
      <GovernanceCard title="rebalanceBudgets" hint="池间奖励预算调拨（TokenB）" payload={encodeFunctionData({ abi: dualPoolStakingAdminAbi, functionName: "rebalanceBudgets", args: [rebalanceFrom === "A" ? 0 : 1, rebalanceFrom === "A" ? 1 : 0, rebalanceAmountValue ?? 0n] })} {...cardProps} disabledReason={rebalanceError} executeRows={() => [{ label: "dir", value: rebalanceFrom === "A" ? "A→B" : "B→A" }, { label: "amount", value: rebalanceAmount }]}>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <select value={rebalanceFrom} onChange={(e) => setRebalanceFrom(e.target.value as "A" | "B")} className={inputClass}>
            <option value="A">A → B</option>
            <option value="B">B → A</option>
          </select>
          <input value={rebalanceAmount} onChange={(e) => setRebalanceAmount(e.target.value)} placeholder="TokenB 数量" className={inputClass} />
        </div>
      </GovernanceCard>

      <GovernanceCard title="claimFees" hint="将累计 B 池手续费扫至 feeRecipient" payload={encodeFunctionData({ abi: dualPoolStakingAdminAbi, functionName: "claimFees", args: [] })} {...cardProps} executeRows={() => [{ label: "unclaimedFeesB", value: staking.unclaimedFeesB?.toString() ?? "—" }]}>
        <p className="text-[11px] text-zinc-500">无参数。执行前请确认链上 unclaimedFeesB &gt; 0。</p>
      </GovernanceCard>

      <GovernanceCard title="resolveBadDebt" hint="治理方偿还坏账（需事先 approve TokenB 给核心）" payload={encodeFunctionData({ abi: dualPoolStakingAdminAbi, functionName: "resolveBadDebt", args: [badDebtRepayValue ?? 0n] })} {...cardProps} disabledReason={badDebtError} executeRows={() => [{ label: "TokenB", value: badDebtRepay }, { label: "globalBadDebt", value: staking.globalBadDebt?.toString() ?? "—" }]}>
        <FieldLabel>还款 TokenB 数量<input value={badDebtRepay} onChange={(e) => setBadDebtRepay(e.target.value)} className={inputClass} /></FieldLabel>
      </GovernanceCard>

      <GovernanceCard title="recoverToken" hint="在会计规则允许时回收误转代币（慎用）" payload={encodeFunctionData({ abi: dualPoolStakingAdminAbi, functionName: "recoverToken", args: [recoverTokenAddress ?? "0x0000000000000000000000000000000000000000", recoverToValue ?? "0x0000000000000000000000000000000000000000", recoverAmountValue ?? 0n] })} {...cardProps} disabledReason={recoverError} executeRows={() => [{ label: "token", value: recoverTokenAddress ?? "—" }, { label: "to", value: recoverTo }, { label: "amount", value: recoverAmount }]}>
        <div className="space-y-2">
          <select value={recoverTokenKind} onChange={(e) => setRecoverTokenKind(e.target.value as "A" | "B" | "custom")} className={inputClass}>
            <option value="A">TokenA</option>
            <option value="B">TokenB</option>
            <option value="custom">自定义地址</option>
          </select>
          {recoverTokenKind === "custom" ? <input value={recoverTokenCustom} onChange={(e) => setRecoverTokenCustom(e.target.value)} placeholder="0x…" className={inputClass} /> : null}
          <FieldLabel>收款 to<input value={recoverTo} onChange={(e) => setRecoverTo(e.target.value)} className={inputClass} /></FieldLabel>
          <FieldLabel>数量<input value={recoverAmount} onChange={(e) => setRecoverAmount(e.target.value)} className={inputClass} /></FieldLabel>
        </div>
      </GovernanceCard>
        </>
      ) : null}

      {activeTab === "protocol" ? (
        <>
      <GovernanceCard title="unpause" hint="pause 之后解冻；须满足核心 unpause 条件" payload={encodeFunctionData({ abi: dualPoolStakingAdminAbi, functionName: "unpause", args: [] })} {...cardProps} executeRows={() => [{ label: "status", value: staking.status }]}>
        <p className="text-[11px] text-zinc-500">无参数。当前状态: {staking.status}</p>
      </GovernanceCard>

      <GovernanceCard title="activateShutdown" hint="进入关停流程（通常需已 enableEmergencyMode）" payload={encodeFunctionData({ abi: dualPoolStakingAdminAbi, functionName: "activateShutdown", args: [] })} {...cardProps} executeRows={() => [{ label: "warning", value: "不可逆路径，仅演练/生产预案" }]}>
        <p className="text-[11px] text-amber-200/90">高风险：请确认 PRD 前置条件后再 schedule。</p>
      </GovernanceCard>

      <GovernanceCard title="forceShutdownFinalize" hint="关停终局清算" payload={encodeFunctionData({ abi: dualPoolStakingAdminAbi, functionName: "forceShutdownFinalize", args: [] })} {...cardProps} executeRows={() => [{ label: "warning", value: "终局操作" }]}>
        <p className="text-[11px] text-amber-200/90">高风险：schedule 前请再次核对链上 shutdown 状态。</p>
      </GovernanceCard>
        </>
      ) : null}

      {activeTab === "super" ? (
        <>
      <p className="col-span-full text-[11px] text-amber-200/90">模块与角色变更影响全局权限，建议生产环境单独拉长 Timelock 流程并多签复核。</p>
      <GovernanceCard title="setUserModule" hint="更换用户模块 delegate 地址" payload={encodeFunctionData({ abi: dualPoolStakingAdminAbi, functionName: "setUserModule", args: [userModuleValue ?? "0x0000000000000000000000000000000000000000"] })} {...cardProps} disabledReason={addressError(userModuleValue, "module")} executeRows={() => [{ label: "newModule", value: userModuleAddr }]}>
        <FieldLabel>新模块地址<input value={userModuleAddr} onChange={(e) => setUserModuleAddr(e.target.value)} className={inputClass} /></FieldLabel>
      </GovernanceCard>

      <GovernanceCard title="setAdminModule" hint="更换管理模块 delegate 地址" payload={encodeFunctionData({ abi: dualPoolStakingAdminAbi, functionName: "setAdminModule", args: [adminModuleValue ?? "0x0000000000000000000000000000000000000000"] })} {...cardProps} disabledReason={addressError(adminModuleValue, "module")} executeRows={() => [{ label: "newModule", value: adminModuleAddr }]}>
        <FieldLabel>新模块地址<input value={adminModuleAddr} onChange={(e) => setAdminModuleAddr(e.target.value)} className={inputClass} /></FieldLabel>
      </GovernanceCard>

      <GovernanceCard
        title={roleKind === "admin" ? "setAdmin" : "setOperator"}
        hint={roleKind === "admin" ? "授予/撤销核心 ADMIN_ROLE" : "授予/撤销核心 OPERATOR_ROLE（热路径）"}
        payload={encodeFunctionData({
          abi: dualPoolStakingAdminAbi,
          functionName: roleKind === "admin" ? "setAdmin" : "setOperator",
          args: [roleTargetValue ?? "0x0000000000000000000000000000000000000000", roleEnabled],
        })}
        {...cardProps}
        disabledReason={roleError}
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
            enabled（勾选=授予，取消=撤销）
          </label>
        </div>
      </GovernanceCard>
        </>
      ) : null}
      </div>
    </div>
  );
}
