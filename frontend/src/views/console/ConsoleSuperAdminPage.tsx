"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { isAddress } from "viem";
import { useAccount, useWriteContract } from "wagmi";
import clsx from "clsx";

import { BrandedWalletButton } from "@/components/ConnectWalletButton";
import { dualPoolSuperAdminAbi } from "@/contracts/abis/dualPoolSuperAdmin";
import { useSuperAdminRoles } from "@/hooks/useSuperAdminRoles";
import { useWriteWithStatus } from "@/hooks/useWriteWithStatus";
import { useLocaleStore } from "@/store/useLocaleStore";
import type { TxState } from "@/lib/txFlowTypes";
import { isTxBusy } from "@/lib/txFlowTypes";

type Copy = {
  eyebrow: string;
  title: string;
  subtitle: string;
  contract: string;
  owner: string;
  yourRole: string;
  yourRoleHint: string;
  targetLookup: string;
  targetLookupPlaceholder: string;
  lookup: string;
  lookupHint: string;
  roleManage: string;
  roleManageHint: string;
  grant: string;
  revoke: string;
  adminRole: string;
  operatorRole: string;
  defaultAdminRole: string;
  connectWallet: string;
  connectWalletHint: string;
  noDefaultAdmin: string;
  noDefaultAdminHint: string;
  notConfigured: string;
  notConfiguredHint: string;
  unknown: string;
  yes: string;
  no: string;
  you: string;
  invalidAddress: string;
  refresh: string;
};

const COPY: Record<"zh" | "en", Copy> = {
  zh: {
    eyebrow: "SUPER ADMIN",
    title: "角色管理后台",
    subtitle: "授予或撤销 ADMIN_ROLE 与 OPERATOR_ROLE，掌控合约治理层级",
    contract: "合约地址",
    owner: "Ownable 所有者",
    yourRole: "当前钱包角色",
    yourRoleHint: "当前连接钱包在 SuperAdmin 合约中持有的角色",
    targetLookup: "目标地址查询",
    targetLookupPlaceholder: "0x... 或 .eth",
    lookup: "查询",
    lookupHint: "查看任意地址在 SuperAdmin 中持有的角色",
    roleManage: "角色管理",
    roleManageHint: "仅 DEFAULT_ADMIN_ROLE 持有者可授予 / 撤销其他角色",
    grant: "授予",
    revoke: "撤销",
    adminRole: "ADMIN_ROLE · 普通管理员",
    operatorRole: "OPERATOR_ROLE · 运营",
    defaultAdminRole: "DEFAULT_ADMIN_ROLE · 超级管理员",
    connectWallet: "连接钱包",
    connectWalletHint: "连接钱包后查看你的角色并执行管理操作",
    noDefaultAdmin: "当前钱包没有超级管理员权限",
    noDefaultAdminHint: "只有 DEFAULT_ADMIN_ROLE 持有者可以授予或撤销角色",
    notConfigured: "SuperAdmin 合约未配置",
    notConfiguredHint: "请在 .env.local 中设置 NEXT_PUBLIC_DUAL_POOL_SUPER_ADMIN_ADDRESS 后刷新",
    unknown: "未知",
    yes: "是",
    no: "否",
    you: "你",
    invalidAddress: "地址格式不正确",
    refresh: "刷新",
  },
  en: {
    eyebrow: "SUPER ADMIN",
    title: "Role Management Console",
    subtitle: "Grant or revoke ADMIN_ROLE and OPERATOR_ROLE to govern the contract hierarchy",
    contract: "Contract",
    owner: "Ownable Owner",
    yourRole: "Your Wallet Roles",
    yourRoleHint: "Roles held by the currently connected wallet in the SuperAdmin contract",
    targetLookup: "Target Lookup",
    targetLookupPlaceholder: "0x... or .eth",
    lookup: "Lookup",
    lookupHint: "Inspect roles of any address in SuperAdmin",
    roleManage: "Role Management",
    roleManageHint: "Only DEFAULT_ADMIN_ROLE holders can grant or revoke other roles",
    grant: "Grant",
    revoke: "Revoke",
    adminRole: "ADMIN_ROLE · Administrator",
    operatorRole: "OPERATOR_ROLE · Operator",
    defaultAdminRole: "DEFAULT_ADMIN_ROLE · Super Admin",
    connectWallet: "Connect Wallet",
    connectWalletHint: "Connect a wallet to view your roles and perform admin operations",
    noDefaultAdmin: "Wallet lacks super admin privileges",
    noDefaultAdminHint: "Only DEFAULT_ADMIN_ROLE holders can grant or revoke roles",
    notConfigured: "SuperAdmin contract not configured",
    notConfiguredHint: "Set NEXT_PUBLIC_DUAL_POOL_SUPER_ADMIN_ADDRESS in .env.local and refresh",
    unknown: "Unknown",
    yes: "Yes",
    no: "No",
    you: "You",
    invalidAddress: "Invalid address",
    refresh: "Refresh",
  },
};

function shorten(addr: `0x${string}` | undefined): string {
  if (!addr) return "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

type RoleBadgeProps = {
  label: string;
  active: boolean;
  tone?: "super" | "admin" | "operator";
};

function RoleBadge({ label, active, tone = "admin" }: RoleBadgeProps) {
  const palette =
    tone === "super"
      ? "from-violet-500/30 to-fuchsia-500/30 border-violet-400/40 text-violet-100"
      : tone === "operator"
        ? "from-cyan-500/30 to-sky-500/30 border-cyan-400/40 text-cyan-100"
        : "from-indigo-500/30 to-blue-500/30 border-indigo-400/40 text-indigo-100";

  return (
    <span
      className={clsx(
        "inline-flex items-center gap-2 rounded-full border bg-gradient-to-r px-3 py-1 text-xs font-medium tracking-wide transition",
        palette,
        !active && "opacity-40 grayscale",
      )}
    >
      <span
        className={clsx(
          "inline-block size-1.5 rounded-full",
          active ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" : "bg-zinc-600",
        )}
      />
      {label}
    </span>
  );
}

function PanelCard({
  title,
  subtitle,
  children,
  eyebrow,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  eyebrow?: string;
}) {
  return (
    <section className="group relative overflow-hidden rounded-2xl border border-violet-500/15 bg-gradient-to-br from-[#0b1024]/90 to-[#0e1536]/90 p-5 shadow-[0_0_0_1px_rgba(139,92,246,0.05),0_8px_32px_rgba(0,0,0,0.3)] transition hover:border-violet-500/25 sm:p-6">
      <div className="pointer-events-none absolute inset-0 -z-10 opacity-0 transition-opacity duration-500 group-hover:opacity-100">
        <div className="absolute -right-10 -top-10 size-40 rounded-full bg-violet-500/10 blur-3xl" />
      </div>
      {eyebrow ? (
        <div className="mb-2 font-mono text-[10px] tracking-[0.3em] text-violet-300/70 uppercase">
          {eyebrow}
        </div>
      ) : null}
      <div className="mb-4">
        <h2 className="text-base font-semibold tracking-tight text-zinc-50 sm:text-lg">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm text-zinc-400">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

function AddressDisplay({
  label,
  value,
}: {
  label: string;
  value: `0x${string}` | undefined;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-violet-500/10 py-2.5 last:border-0">
      <span className="text-xs text-zinc-500">{label}</span>
      <code className="truncate font-mono text-xs text-zinc-200">
        {value ?? "—"}
      </code>
    </div>
  );
}

type ActionPanelProps = {
  roles: SuperAdminRoleSnapshot;
  target: `0x${string}`;
  targetRoles: SuperAdminRoleSnapshot;
  onMutated: () => void;
  copy: Copy;
};

type SuperAdminRoleSnapshot = ReturnType<typeof useSuperAdminRoles>;

function ActionPanel({ roles, target, targetRoles, onMutated, copy }: ActionPanelProps) {
  const { writeContractAsync } = useWriteContract();
  const adminFlow = useWriteWithStatus();
  const operatorFlow = useWriteWithStatus();

  const makeHandler = (
    flow: ReturnType<typeof useWriteWithStatus>,
    fn: "setAdmin" | "setOperator",
    enabled: boolean,
  ) => {
    return async () => {
      try {
        await flow.executeWrite(
          {
            actionLabel: `${fn}(${shorten(target)}, ${enabled})`,
            txType: "super-admin",
            onConfirmed: onMutated,
          },
          () =>
            writeContractAsync({
              address: roles.address,
              abi: dualPoolSuperAdminAbi,
              functionName: fn,
              args: [target, enabled],
            }),
        );
      } catch {
        /* flow 内部已经捕获 */
      }
    };
  };

  const targetIsMe = target.toLowerCase() === roles.account?.toLowerCase();
  const adminBusy = isTxBusy(adminFlow.state);
  const operatorBusy = isTxBusy(operatorFlow.state);

  return (
    <div className="space-y-4">
      <RoleActionRow
        label={copy.adminRole}
        currentlyHeld={targetRoles.isAdmin}
        flowState={adminFlow.state}
        disabled={operatorBusy}
        onGrant={makeHandler(adminFlow, "setAdmin", true)}
        onRevoke={makeHandler(adminFlow, "setAdmin", false)}
        copy={copy}
      />
      <RoleActionRow
        label={copy.operatorRole}
        currentlyHeld={targetRoles.isOperator}
        flowState={operatorFlow.state}
        disabled={adminBusy}
        onGrant={makeHandler(operatorFlow, "setOperator", true)}
        onRevoke={makeHandler(operatorFlow, "setOperator", false)}
        copy={copy}
      />
      {targetIsMe ? (
        <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3 text-xs text-cyan-200">
          ⚠ You are operating on your own wallet.
        </div>
      ) : null}
    </div>
  );
}

function actionLabel(state: TxState, enabled: boolean, copy: Copy): string {
  if (state === "awaiting_signature") return "Confirm in wallet…";
  if (state === "pending" || state === "submitting") return enabled ? "Granting…" : "Revoking…";
  if (state === "confirmed") return enabled ? "Granted ✓" : "Revoked ✓";
  if (state === "failed") return "Failed";
  return enabled ? copy.grant : copy.revoke;
}

function RoleActionRow({
  label,
  currentlyHeld,
  flowState,
  disabled,
  onGrant,
  onRevoke,
  copy,
}: {
  label: string;
  currentlyHeld: boolean;
  flowState: TxState;
  disabled: boolean;
  onGrant: () => void;
  onRevoke: () => void;
  copy: Copy;
}) {
  const busy = isTxBusy(flowState);
  const failed = flowState === "failed";
  const confirmed = flowState === "confirmed";

  return (
    <div
      className={clsx(
        "rounded-xl border bg-zinc-950/40 p-4 transition",
        failed
          ? "border-rose-500/30"
          : confirmed
            ? "border-emerald-500/30"
            : "border-violet-500/10",
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-zinc-200">{label}</span>
            <span
              className={clsx(
                "rounded-full px-2 py-0.5 text-[10px] font-medium",
                currentlyHeld
                  ? "bg-emerald-500/15 text-emerald-300"
                  : "bg-zinc-700/30 text-zinc-500",
              )}
            >
              {currentlyHeld ? copy.yes : copy.no}
            </span>
          </div>
          <div className="mt-0.5 font-mono text-[11px] text-zinc-500">
            {failed ? "Transaction failed — retry" : confirmed ? "Confirmed on chain" : ""}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={disabled || busy}
            onClick={onGrant}
            className={clsx(
              "inline-flex min-h-[36px] items-center justify-center rounded-lg px-4 py-1.5 text-xs font-medium transition",
              "bg-gradient-to-r from-emerald-500/90 to-teal-500/90 text-white hover:from-emerald-400 hover:to-teal-400",
              "disabled:cursor-not-allowed disabled:opacity-40",
            )}
          >
            {busy || confirmed || failed ? actionLabel(flowState, true, copy) : copy.grant}
          </button>
          <button
            type="button"
            disabled={disabled || busy}
            onClick={onRevoke}
            className={clsx(
              "inline-flex min-h-[36px] items-center justify-center rounded-lg px-4 py-1.5 text-xs font-medium transition",
              "border border-rose-500/30 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20",
              "disabled:cursor-not-allowed disabled:opacity-40",
            )}
          >
            {busy || confirmed || failed ? actionLabel(flowState, false, copy) : copy.revoke}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * SuperAdmin 角色管理后台
 *
 * 全新视觉设计：深空蓝 + 紫青高亮，与控制台 amber 风格形成视觉区隔。
 */
export function ConsoleSuperAdminPage() {
  const locale = useLocaleStore((s) => s.locale);
  const copy = COPY[locale];
  const { address: walletAddress, isConnected } = useAccount();

  const me = useSuperAdminRoles();
  const [targetInput, setTargetInput] = useState("");
  const [resolvedTarget, setResolvedTarget] = useState<`0x${string}` | undefined>(undefined);
  const [targetError, setTargetError] = useState<string | null>(null);

  const targetRoles = useSuperAdminRoles({ target: resolvedTarget });

  useEffect(() => {
    setTargetError(null);
  }, [targetInput]);

  const handleLookup = useCallback(() => {
    const v = targetInput.trim();
    if (!v) {
      setResolvedTarget(undefined);
      setTargetError(null);
      return;
    }
    if (!isAddress(v)) {
      setTargetError(copy.invalidAddress);
      return;
    }
    setTargetError(null);
    setResolvedTarget(v as `0x${string}`);
  }, [targetInput, copy.invalidAddress]);

  const handleUseMyAddress = useCallback(() => {
    if (walletAddress) {
      setTargetInput(walletAddress);
      setResolvedTarget(walletAddress);
      setTargetError(null);
    }
  }, [walletAddress]);

  const targetIsConfigured = me.configured;

  const refreshAll = useCallback(async () => {
    await Promise.all([me.refetch(), resolvedTarget ? targetRoles.refetch() : Promise.resolve()]);
  }, [me, resolvedTarget, targetRoles]);

  const canManage = isConnected && me.isDefaultAdmin;

  const targetBadgeData = useMemo(() => {
    if (!resolvedTarget) return null;
    return {
      isDefaultAdmin: targetRoles.isDefaultAdmin,
      isAdmin: targetRoles.isAdmin,
      isOperator: targetRoles.isOperator,
    };
  }, [resolvedTarget, targetRoles.isDefaultAdmin, targetRoles.isAdmin, targetRoles.isOperator]);

  return (
    <div className="sa-page relative min-h-[calc(100vh-6rem)]">
      {/* 背景光晕 */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[28rem] opacity-70"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(139, 92, 246, 0.18), transparent 70%), radial-gradient(ellipse 60% 40% at 80% 0%, rgba(34, 211, 238, 0.08), transparent 60%)",
        }}
      />

      {/* Hero */}
      <div className="mb-6 sm:mb-8">
        <div className="mb-2 font-mono text-[11px] tracking-[0.35em] text-violet-300/80 uppercase">
          {copy.eyebrow}
        </div>
        <h1 className="bg-gradient-to-r from-white via-violet-100 to-cyan-100 bg-clip-text text-2xl font-semibold tracking-tight text-transparent sm:text-3xl">
          {copy.title}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-zinc-400 sm:text-base">{copy.subtitle}</p>
      </div>

      {/* 顶部网格：合约信息 + 我的角色 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <PanelCard
          eyebrow="Contract"
          title={copy.contract}
          subtitle={targetIsConfigured ? undefined : copy.notConfiguredHint}
        >
          {targetIsConfigured ? (
            <div className="space-y-0.5">
              <AddressDisplay label="SuperAdmin" value={me.address} />
              <AddressDisplay label={copy.owner} value={me.owner} />
            </div>
          ) : (
            <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-4 text-sm text-rose-300">
              {copy.notConfigured}
            </div>
          )}
        </PanelCard>

        <PanelCard eyebrow="Wallet" title={copy.yourRole} subtitle={copy.yourRoleHint}>
          {!isConnected ? (
            <div className="flex flex-col items-start gap-3">
              <p className="text-sm text-zinc-400">{copy.connectWalletHint}</p>
              <BrandedWalletButton variant="console" />
            </div>
          ) : !targetIsConfigured ? (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-300">
              {copy.notConfigured}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <RoleBadge label="SuperAdmin" active={me.isDefaultAdmin} tone="super" />
              <RoleBadge label="Admin" active={me.isAdmin} tone="admin" />
              <RoleBadge label="Operator" active={me.isOperator} tone="operator" />
              <button
                type="button"
                onClick={refreshAll}
                className="ml-auto inline-flex items-center gap-1 rounded-md border border-violet-500/20 px-2 py-1 text-[11px] text-violet-200 transition hover:bg-violet-500/10"
              >
                ↻ {copy.refresh}
              </button>
            </div>
          )}
        </PanelCard>
      </div>

      {/* 目标地址查询 + 角色管理 */}
      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <PanelCard eyebrow="Inspect" title={copy.targetLookup} subtitle={copy.lookupHint}>
            <div className="flex flex-col gap-2">
              <input
                type="text"
                value={targetInput}
                onChange={(e) => setTargetInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleLookup();
                }}
                placeholder={copy.targetLookupPlaceholder}
                spellCheck={false}
                className="w-full rounded-lg border border-violet-500/20 bg-zinc-950/60 px-3 py-2 font-mono text-sm text-zinc-100 placeholder-zinc-600 outline-none transition focus:border-violet-400/60 focus:ring-2 focus:ring-violet-500/20"
              />
              {targetError ? (
                <p className="text-xs text-rose-400">{targetError}</p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleLookup}
                  className="inline-flex min-h-[36px] items-center rounded-lg bg-gradient-to-r from-violet-500 to-indigo-500 px-4 py-1.5 text-xs font-medium text-white transition hover:from-violet-400 hover:to-indigo-400 disabled:opacity-40"
                >
                  {copy.lookup}
                </button>
                <button
                  type="button"
                  onClick={handleUseMyAddress}
                  disabled={!walletAddress}
                  className="inline-flex min-h-[36px] items-center rounded-lg border border-violet-500/20 bg-violet-500/5 px-4 py-1.5 text-xs font-medium text-violet-200 transition hover:bg-violet-500/10 disabled:opacity-40"
                >
                  Use My Address
                </button>
              </div>

              {targetBadgeData ? (
                <div className="mt-3 rounded-lg border border-violet-500/10 bg-zinc-950/40 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-mono text-xs text-zinc-400">
                      {shorten(resolvedTarget)}
                    </span>
                    {resolvedTarget?.toLowerCase() === walletAddress?.toLowerCase() ? (
                      <span className="rounded-full bg-cyan-500/15 px-2 py-0.5 text-[10px] text-cyan-200">
                        {copy.you}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <RoleBadge label="SuperAdmin" active={targetBadgeData.isDefaultAdmin} tone="super" />
                    <RoleBadge label="Admin" active={targetBadgeData.isAdmin} tone="admin" />
                    <RoleBadge label="Operator" active={targetBadgeData.isOperator} tone="operator" />
                  </div>
                </div>
              ) : null}
            </div>
          </PanelCard>
        </div>

        <div className="lg:col-span-3">
          <PanelCard eyebrow="Actions" title={copy.roleManage} subtitle={copy.roleManageHint}>
            {!isConnected ? (
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
                <p className="text-sm text-amber-300">{copy.connectWallet}</p>
                <p className="mt-1 text-xs text-zinc-400">{copy.connectWalletHint}</p>
              </div>
            ) : !targetIsConfigured ? (
              <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-4 text-sm text-rose-300">
                {copy.notConfigured}
              </div>
            ) : !me.isDefaultAdmin ? (
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
                <p className="text-sm font-medium text-amber-300">{copy.noDefaultAdmin}</p>
                <p className="mt-1 text-xs text-zinc-400">{copy.noDefaultAdminHint}</p>
              </div>
            ) : !resolvedTarget ? (
              <div className="rounded-lg border border-violet-500/10 bg-violet-500/5 p-4 text-sm text-zinc-400">
                Query a target address first to manage its roles.
              </div>
            ) : (
              <ActionPanel
                roles={me}
                target={resolvedTarget}
                targetRoles={targetRoles}
                onMutated={refreshAll}
                copy={copy}
              />
            )}
          </PanelCard>
        </div>
      </div>

      {/* 提示：合约信息 */}
      <div className="mt-6 rounded-xl border border-violet-500/10 bg-zinc-950/30 p-4 text-xs text-zinc-500">
        <p className="font-mono tracking-wide text-violet-300/60 uppercase">
          Security Notice
        </p>
        <p className="mt-2 leading-relaxed">
          <code className="rounded bg-zinc-900 px-1.5 py-0.5 font-mono text-zinc-300">DEFAULT_ADMIN_ROLE</code>{" "}
          is held by the deployer. It is the only role that can grant or revoke other roles. Store the
          super-admin key offline after initial setup.
        </p>
      </div>
    </div>
  );
}
