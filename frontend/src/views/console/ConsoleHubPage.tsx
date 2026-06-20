"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useAccount, useChainId } from "wagmi";

import { BrandMark } from "@/components/BrandMark";
import { ConsoleStatusBadge, type ConsoleBadgeTone } from "@/components/console/ConsoleStatusBadge";
import { contractAddresses, governanceAddresses, sepoliaAuxAddresses } from "@/contracts/addresses";
import { useProtocolRoles } from "@/hooks/useProtocolRoles";
import { useStaking } from "@/hooks/useStaking";
import { useTimelockGovernanceRoles } from "@/hooks/useTimelockGovernanceRoles";
import { POOL_COPY } from "@/lib/appMode";
import { CONSOLE_COPY } from "@/lib/consoleCopy";
import { getAddressExplorerUrl } from "@/lib/explorerLink";
import { formatToken } from "@/lib/format";
import { buildWalletRoleSummaryLine } from "@/lib/walletRoleSummary";

type Tone = ConsoleBadgeTone;

function StatusPill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return <ConsoleStatusBadge tone={tone}>{children}</ConsoleStatusBadge>;
}

function OperationDomainCard({
  href,
  title,
  desc,
  badge,
  tone = "muted",
  locked = false,
}: {
  href?: string;
  title: string;
  desc: string;
  badge?: string;
  tone?: Tone;
  locked?: boolean;
}) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-2">
        <h2 className={locked ? "font-mono text-base font-semibold text-zinc-500" : "font-mono text-base font-semibold text-zinc-100 group-hover:text-amber-100"}>{title}</h2>
        {badge ? <StatusPill tone={tone}>{badge}</StatusPill> : null}
      </div>
      <p className="mt-2 text-sm leading-relaxed text-zinc-500">{desc}</p>
    </>
  );

  if (!href || locked) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 opacity-80">
        {content}
      </div>
    );
  }

  return (
    <Link
      href={href}
      className="group block rounded-xl border border-zinc-800 bg-zinc-900/70 p-4 transition hover:border-amber-700/50 hover:bg-zinc-900"
    >
      {content}
    </Link>
  );
}

function PermissionRow({
  label,
  desc,
  active,
  loading,
}: {
  label: string;
  desc: string;
  active: boolean;
  loading: boolean;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-zinc-800/70 px-4 py-3 last:border-b-0">
      <div className="min-w-0">
        <div className="font-mono text-sm font-semibold text-zinc-100">{label}</div>
        <div className="mt-0.5 text-xs leading-relaxed text-zinc-500">{desc}</div>
      </div>
      <ConsoleStatusBadge tone={loading ? "muted" : active ? "good" : "muted"}>
        {loading ? CONSOLE_COPY.access.checking : active ? CONSOLE_COPY.access.granted : CONSOLE_COPY.access.none}
      </ConsoleStatusBadge>
    </div>
  );
}

function HealthTile({ label, value, sub, tone = "muted" }: { label: string; value: string; sub: string; tone?: Tone }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-zinc-500">{label}</div>
        <span className={tone === "good" ? "size-2 rounded-full bg-amber-300" : tone === "warn" ? "size-2 rounded-full bg-amber-400" : "size-2 rounded-full bg-zinc-600"} />
      </div>
      <div className="mt-2 font-mono text-xl font-semibold text-zinc-100">{value}</div>
      <div className="mt-1 text-xs text-zinc-500">{sub}</div>
    </div>
  );
}

/** 合约控制台首页：运维入口、合约地址、角色状态 */
export function ConsoleHubPage() {
  const chainId = useChainId();
  const { address } = useAccount();
  const staking = useStaking();
  const roles = useProtocolRoles();
  const tl = useTimelockGovernanceRoles();
  const tlSuper = useTimelockGovernanceRoles(governanceAddresses.timelockSuper);

  const tvlA = staking.poolA?.totalStaked ?? 0n;
  const tvlB = staking.poolB?.totalStaked ?? 0n;

  const canGovernance = Boolean(
    address &&
      (roles.isAdmin || roles.isOperator || tl.canAccessTimelockGovernance || tlSuper.canAccessTimelockGovernance),
  );
  const rolesLoading = roles.isLoading || tl.isLoading || tlSuper.isLoading;
  const walletRoleSummary = useMemo(
    () =>
      buildWalletRoleSummaryLine(
        address,
        {
          isAdmin: roles.isAdmin,
          isOperator: roles.isOperator,
          canPropose: tl.canPropose,
          canExecute: tl.canExecute,
          canCancel: tl.canCancel,
          canProposeSuper: tlSuper.canPropose,
          canExecuteSuper: tlSuper.canExecute,
          canCancelSuper: tlSuper.canCancel,
        },
        Boolean(address && rolesLoading),
      ),
    [address, roles.isAdmin, roles.isOperator, rolesLoading, tl, tlSuper],
  );
  const accessLabel = canGovernance
    ? CONSOLE_COPY.access.operator
    : address
      ? CONSOLE_COPY.access.readOnly
      : CONSOLE_COPY.access.disconnected;
  const protocolTone: Tone = staking.status === "NORMAL" ? "good" : "warn";
  const badDebtTone: Tone = staking.globalBadDebt > 0n ? "warn" : "good";
  const canUseUserDebug = Boolean(address);
  const canUse48hTimelock = tl.canAccessTimelockGovernance;
  const canUse72hTimelock = tlSuper.canAccessTimelockGovernance;
  const hasAnyPrivilegedRole = roles.isOperator || roles.isAdmin || canUse48hTimelock || canUse72hTimelock;

  const operationDomains = [
    {
      id: "readonly",
      href: "/console",
      title: "只读监控",
      desc: "查看协议健康、TVL、坏账、部署地址和当前钱包角色。",
      badge: "公开",
      tone: "good" as Tone,
      available: true,
    },
    {
      id: "pool-a-user",
      href: POOL_COPY.flexible.consoleHref,
      title: "Pool A 用户交易调试",
      desc: "stakeA / withdrawA / claimA / emergencyWithdrawA；适合复现用户路径和核对原始字段。",
      badge: canUseUserDebug ? "可用" : "需连接",
      tone: canUseUserDebug ? "good" as Tone : "muted" as Tone,
      available: canUseUserDebug,
    },
    {
      id: "pool-b-user",
      href: POOL_COPY.locked.consoleHref,
      title: "Pool B 用户交易调试",
      desc: "stakeB / withdrawB / claimB / compoundB；核对 unlockTime、WADP 时间戳和费用预览。",
      badge: canUseUserDebug ? "可用" : "需连接",
      tone: canUseUserDebug ? "good" as Tone : "muted" as Tone,
      available: canUseUserDebug,
    },
    {
      id: "operator",
      href: roles.isOperator ? "/console/governance" : undefined,
      title: "Operator 热路径",
      desc: "pause、enableEmergencyMode、notifyRewardAmountA/B 等 0h 运营动作。",
      badge: roles.isOperator ? "OPERATOR" : "需 OPERATOR",
      tone: roles.isOperator ? "warn" as Tone : "muted" as Tone,
      available: roles.isOperator,
    },
    {
      id: "admin-role",
      href: roles.isAdmin ? "/console/governance" : undefined,
      title: "Core Admin Role",
      desc: "核心 AccessControl 管理标识；用于识别高权限钱包，实际参数/模块操作仍建议走 Timelock。",
      badge: roles.isAdmin ? "ADMIN" : "需 ADMIN",
      tone: roles.isAdmin ? "warn" as Tone : "muted" as Tone,
      available: roles.isAdmin,
    },
    {
      id: "timelock-48h",
      href: canUse48hTimelock ? "/console/governance" : undefined,
      title: "48h Timelock 治理",
      desc: "参数更新、预算调整、坏账修复、recoverToken 等 schedule / execute / cancel。",
      badge: canUse48hTimelock ? "48h" : "需 Timelock",
      tone: canUse48hTimelock ? "warn" as Tone : "muted" as Tone,
      available: canUse48hTimelock,
    },
    {
      id: "timelock-72h",
      href: canUse72hTimelock ? "/console/governance" : undefined,
      title: "72h Super Timelock",
      desc: "模块地址、超级角色等高风险变更；只对超级治理角色开放。",
      badge: canUse72hTimelock ? "72h" : "需 Super",
      tone: canUse72hTimelock ? "warn" as Tone : "muted" as Tone,
      available: canUse72hTimelock,
    },
  ];
  const availableOperations = operationDomains.filter((x) => x.available);
  const lockedOperations = operationDomains.filter((x) => !x.available);

  return (
    <div className="min-w-0 space-y-5">
      <section className="overflow-hidden rounded-xl border border-amber-300/15 bg-[radial-gradient(ellipse_at_top_left,rgba(251,191,36,0.16),transparent_42%),linear-gradient(135deg,rgba(24,24,27,0.94),rgba(9,9,11,0.98))]">
        <div className="grid gap-px bg-amber-200/10 lg:grid-cols-[1.45fr_0.95fr]">
          <div className="min-w-0 bg-zinc-950/70 p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <BrandMark variant="console" />
              <div className="min-w-0">
                <div className="text-xs font-medium uppercase tracking-wide text-amber-200/80">{CONSOLE_COPY.hub.eyebrow}</div>
                <h1 className="mt-2 font-mono text-2xl font-semibold text-zinc-100 sm:text-3xl">{CONSOLE_COPY.hub.title}</h1>
              </div>
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-400">
              {CONSOLE_COPY.hub.intro}{" "}
              <Link href="/" className="text-amber-300/90 underline">
                {CONSOLE_COPY.hub.productLink}
              </Link>
              。
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <StatusPill tone={protocolTone}>
                {CONSOLE_COPY.hub.status} {staking.status}
              </StatusPill>
              <StatusPill tone={badDebtTone}>
                {CONSOLE_COPY.hub.badDebt}{" "}
                {staking.globalBadDebt > 0n ? CONSOLE_COPY.hub.badDebtPresent : CONSOLE_COPY.hub.badDebtClear}
              </StatusPill>
              <StatusPill tone={address ? "good" : "muted"}>{accessLabel}</StatusPill>
            </div>
          </div>
          <div className="bg-zinc-950/72 p-4 sm:p-5">
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">{CONSOLE_COPY.hub.activeWallet}</div>
            <div className="mt-2 break-all font-mono text-sm text-zinc-100">{address ?? CONSOLE_COPY.common.notConnected}</div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2">
                <div className="text-xs text-zinc-500">{CONSOLE_COPY.hub.chainId}</div>
                <div className="mt-1 font-mono text-zinc-100">{chainId}</div>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2">
                <div className="text-xs text-zinc-500">{CONSOLE_COPY.hub.access}</div>
                <div className="mt-1 font-mono text-zinc-100">{accessLabel}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <p className="break-all rounded-lg border border-zinc-800 bg-zinc-950/90 px-4 py-3 font-mono text-xs leading-relaxed text-zinc-300">
        {walletRoleSummary}
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <HealthTile
          label={CONSOLE_COPY.hub.protocolStatus}
          value={staking.status}
          sub={CONSOLE_COPY.hub.protocolStatusSub}
          tone={protocolTone}
        />
        <HealthTile
          label={CONSOLE_COPY.hub.globalBadDebt}
          value={formatToken(staking.globalBadDebt ?? 0n)}
          sub={CONSOLE_COPY.hub.globalBadDebtSub}
          tone={badDebtTone}
        />
        <HealthTile label={CONSOLE_COPY.hub.poolATvl} value={formatToken(tvlA)} sub={CONSOLE_COPY.hub.poolATvlSub} />
        <HealthTile label={CONSOLE_COPY.hub.poolBTvl} value={formatToken(tvlB)} sub={CONSOLE_COPY.hub.poolBTvlSub} />
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/70">
        <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-4 py-3">
          <div className="min-w-0">
            <h2 className="font-mono text-sm font-semibold text-zinc-100">{CONSOLE_COPY.hub.permissionMatrix}</h2>
            <p className="mt-0.5 text-xs text-zinc-500">{CONSOLE_COPY.hub.permissionMatrixSub}</p>
          </div>
          <ConsoleStatusBadge tone={canGovernance ? "good" : "muted"}>
            {!address
              ? CONSOLE_COPY.access.disconnected
              : rolesLoading
                ? CONSOLE_COPY.access.checking
                : canGovernance
                  ? CONSOLE_COPY.access.actionable
                  : CONSOLE_COPY.access.readOnly}
          </ConsoleStatusBadge>
        </div>
        <PermissionRow
          label={CONSOLE_COPY.hubRoles.operator}
          desc={CONSOLE_COPY.hub.operatorRoleDesc}
          active={roles.isOperator}
          loading={Boolean(address && rolesLoading)}
        />
        <PermissionRow
          label={CONSOLE_COPY.hubRoles.proposer}
          desc={CONSOLE_COPY.hub.proposerDesc}
          active={tl.canPropose}
          loading={Boolean(address && rolesLoading)}
        />
        <PermissionRow
          label={CONSOLE_COPY.hubRoles.executor}
          desc={CONSOLE_COPY.hub.executorDesc}
          active={tl.canExecute}
          loading={Boolean(address && rolesLoading)}
        />
        <PermissionRow
          label={CONSOLE_COPY.hubRoles.canceller}
          desc={CONSOLE_COPY.hub.cancellerDesc}
          active={tl.canCancel}
          loading={Boolean(address && rolesLoading)}
        />
      </div>

      <section className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/70">
        <div className="flex flex-col gap-2 border-b border-zinc-800 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="font-mono text-sm font-semibold text-zinc-100">Role-based operations</h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              根据当前钱包角色展示可执行域；高风险操作必须经过对应权限或 Timelock。
            </p>
          </div>
          <StatusPill tone={hasAnyPrivilegedRole ? "warn" : canUseUserDebug ? "good" : "muted"}>
            {hasAnyPrivilegedRole ? "privileged" : canUseUserDebug ? "connected" : "connect wallet"}
          </StatusPill>
        </div>
        <div className="space-y-4 p-4">
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-200/80">当前可用</div>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              {availableOperations.map((op) => (
                <OperationDomainCard
                  key={op.id}
                  href={op.href}
                  title={op.title}
                  desc={op.desc}
                  badge={op.badge}
                  tone={op.tone}
                />
              ))}
            </div>
          </div>

          {lockedOperations.length > 0 ? (
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">需要额外角色</div>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                {lockedOperations.map((op) => (
                  <OperationDomainCard
                    key={op.id}
                    title={op.title}
                    desc={op.desc}
                    badge={op.badge}
                    tone={op.tone}
                    locked
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950/80">
        <div className="border-b border-zinc-800 px-4 py-3">
          <h2 className="font-mono text-sm font-semibold text-zinc-300">{CONSOLE_COPY.hub.contractRegistry}</h2>
          <p className="mt-0.5 text-xs text-zinc-500">{CONSOLE_COPY.hub.contractRegistrySub}</p>
        </div>
        <dl className="divide-y divide-zinc-800/70 font-mono text-[11px]">
          {[
            ["DualPoolStaking", contractAddresses.staking],
            ["DualPoolStakingAdmin", governanceAddresses.adminFacade],
            ["DualPoolAdminModule", sepoliaAuxAddresses.dualPoolAdminModule],
            ["Timelock (48h)", governanceAddresses.timelock],
            ["TimelockSuper (72h)", governanceAddresses.timelockSuper],
          ].map(([label, addr]) => (
            <div key={label} className="grid gap-1 px-4 py-3 sm:grid-cols-[220px_1fr] sm:items-center">
              <dt className="text-zinc-500">{label}</dt>
              <dd>
                <a
                  href={getAddressExplorerUrl(chainId, addr as `0x${string}`)}
                  target="_blank"
                  rel="noreferrer"
                  className="break-all text-sky-400 hover:underline"
                >
                  {addr}
                </a>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
