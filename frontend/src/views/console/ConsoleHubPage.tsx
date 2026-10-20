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
import { useConsoleCopy, type ConsoleCopy } from "@/lib/consoleCopy";
import { getAddressExplorerUrl } from "@/lib/explorerLink";
import { formatToken } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
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
  access,
}: {
  label: string;
  desc: string;
  active: boolean;
  loading: boolean;
  access: ConsoleCopy["access"];
}) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-zinc-800/70 px-4 py-3 last:border-b-0">
      <div className="min-w-0">
        <div className="font-mono text-sm font-semibold text-zinc-100">{label}</div>
        <div className="mt-0.5 text-xs leading-relaxed text-zinc-500">{desc}</div>
      </div>
      <ConsoleStatusBadge tone={loading ? "muted" : active ? "good" : "muted"}>
        {loading ? access.checking : active ? access.granted : access.none}
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

/**
 * 合约控制台首页：运维入口、协议健康、权限矩阵、操作域卡片、合约注册表。
 *
 * @see views/console/README.md
 */
export function ConsoleHubPage() {
  const { t } = useI18n();
  const copy = useConsoleCopy();
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
        t,
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
    [address, roles.isAdmin, roles.isOperator, rolesLoading, t, tl, tlSuper],
  );
  const accessLabel = canGovernance
    ? copy.access.operator
    : address
      ? copy.access.readOnly
      : copy.access.disconnected;
  const protocolTone: Tone = staking.status === "NORMAL" ? "good" : "warn";
  const badDebtTone: Tone = staking.globalBadDebt > 0n ? "warn" : "good";
  const canUseUserDebug = Boolean(address);
  const canUse48hTimelock = tl.canAccessTimelockGovernance;
  const canUse72hTimelock = tlSuper.canAccessTimelockGovernance;
  const hasAnyPrivilegedRole = roles.isOperator || roles.isAdmin || canUse48hTimelock || canUse72hTimelock;

  const od = copy.hub.operationDomains;
  const operationDomains = [
    {
      id: "readonly",
      href: "/console",
      title: od.readonly.title,
      desc: od.readonly.desc,
      badge: od.readonly.badge,
      tone: "good" as Tone,
      available: true,
    },
    {
      id: "pool-a-user",
      href: POOL_COPY.flexible.consoleHref,
      title: od.poolAUser.title,
      desc: od.poolAUser.desc,
      badge: canUseUserDebug ? od.poolAUser.badgeAvailable : od.poolAUser.badgeNeedConnect,
      tone: canUseUserDebug ? "good" as Tone : "muted" as Tone,
      available: canUseUserDebug,
    },
    {
      id: "pool-b-user",
      href: POOL_COPY.locked.consoleHref,
      title: od.poolBUser.title,
      desc: od.poolBUser.desc,
      badge: canUseUserDebug ? od.poolBUser.badgeAvailable : od.poolBUser.badgeNeedConnect,
      tone: canUseUserDebug ? "good" as Tone : "muted" as Tone,
      available: canUseUserDebug,
    },
    {
      id: "operator",
      href: roles.isOperator ? "/console/governance" : undefined,
      title: od.operator.title,
      desc: od.operator.desc,
      badge: roles.isOperator ? od.operator.badgeGranted : od.operator.badgeRequired,
      tone: roles.isOperator ? "warn" as Tone : "muted" as Tone,
      available: roles.isOperator,
    },
    {
      id: "admin-role",
      href: roles.isAdmin ? "/console/governance" : undefined,
      title: od.adminRole.title,
      desc: od.adminRole.desc,
      badge: roles.isAdmin ? od.adminRole.badgeGranted : od.adminRole.badgeRequired,
      tone: roles.isAdmin ? "warn" as Tone : "muted" as Tone,
      available: roles.isAdmin,
    },
    {
      id: "timelock-48h",
      href: canUse48hTimelock ? "/console/governance" : undefined,
      title: od.timelock48h.title,
      desc: od.timelock48h.desc,
      badge: canUse48hTimelock ? od.timelock48h.badgeGranted : od.timelock48h.badgeRequired,
      tone: canUse48hTimelock ? "warn" as Tone : "muted" as Tone,
      available: canUse48hTimelock,
    },
    {
      id: "timelock-72h",
      href: canUse72hTimelock ? "/console/governance" : undefined,
      title: od.timelock72h.title,
      desc: od.timelock72h.desc,
      badge: canUse72hTimelock ? od.timelock72h.badgeGranted : od.timelock72h.badgeRequired,
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
                <div className="text-xs font-medium uppercase tracking-wide text-amber-200/80">{copy.hub.eyebrow}</div>
                <h1 className="mt-2 font-mono text-2xl font-semibold text-zinc-100 sm:text-3xl">{copy.hub.title}</h1>
              </div>
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-400">
              {copy.hub.intro}{" "}
              <Link href="/" className="text-amber-300/90 underline">
                {copy.hub.productLink}
              </Link>
              。
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <StatusPill tone={protocolTone}>
                {copy.hub.status} {staking.status}
              </StatusPill>
              <StatusPill tone={badDebtTone}>
                {copy.hub.badDebt}{" "}
                {staking.globalBadDebt > 0n ? copy.hub.badDebtPresent : copy.hub.badDebtClear}
              </StatusPill>
              <StatusPill tone={address ? "good" : "muted"}>{accessLabel}</StatusPill>
            </div>
          </div>
          <div className="bg-zinc-950/72 p-4 sm:p-5">
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">{copy.hub.activeWallet}</div>
            <div className="mt-2 break-all font-mono text-sm text-zinc-100">{address ?? copy.common.notConnected}</div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2">
                <div className="text-xs text-zinc-500">{copy.hub.chainId}</div>
                <div className="mt-1 font-mono text-zinc-100">{chainId}</div>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2">
                <div className="text-xs text-zinc-500">{copy.hub.access}</div>
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
          label={copy.hub.protocolStatus}
          value={staking.status}
          sub={copy.hub.protocolStatusSub}
          tone={protocolTone}
        />
        <HealthTile
          label={copy.hub.globalBadDebt}
          value={formatToken(staking.globalBadDebt ?? 0n)}
          sub={copy.hub.globalBadDebtSub}
          tone={badDebtTone}
        />
        <HealthTile label={copy.hub.poolATvl} value={formatToken(tvlA)} sub={copy.hub.poolATvlSub} />
        <HealthTile label={copy.hub.poolBTvl} value={formatToken(tvlB)} sub={copy.hub.poolBTvlSub} />
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/70">
        <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-4 py-3">
          <div className="min-w-0">
            <h2 className="font-mono text-sm font-semibold text-zinc-100">{copy.hub.permissionMatrix}</h2>
            <p className="mt-0.5 text-xs text-zinc-500">{copy.hub.permissionMatrixSub}</p>
          </div>
          <ConsoleStatusBadge tone={canGovernance ? "good" : "muted"}>
            {!address
              ? copy.access.disconnected
              : rolesLoading
                ? copy.access.checking
                : canGovernance
                  ? copy.access.actionable
                  : copy.access.readOnly}
          </ConsoleStatusBadge>
        </div>
        <PermissionRow
          label={copy.hubRoles.operator}
          desc={copy.hub.operatorRoleDesc}
          active={roles.isOperator}
          loading={Boolean(address && rolesLoading)}
          access={copy.access}
        />
        <PermissionRow
          label={copy.hubRoles.proposer}
          desc={copy.hub.proposerDesc}
          active={tl.canPropose}
          loading={Boolean(address && rolesLoading)}
          access={copy.access}
        />
        <PermissionRow
          label={copy.hubRoles.executor}
          desc={copy.hub.executorDesc}
          active={tl.canExecute}
          loading={Boolean(address && rolesLoading)}
          access={copy.access}
        />
        <PermissionRow
          label={copy.hubRoles.canceller}
          desc={copy.hub.cancellerDesc}
          active={tl.canCancel}
          loading={Boolean(address && rolesLoading)}
          access={copy.access}
        />
      </div>

      <section className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/70">
        <div className="flex flex-col gap-2 border-b border-zinc-800 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="font-mono text-sm font-semibold text-zinc-100">{copy.hub.roleBasedOps.title}</h2>
            <p className="mt-0.5 text-xs text-zinc-500">{copy.hub.roleBasedOps.subtitle}</p>
          </div>
          <StatusPill tone={hasAnyPrivilegedRole ? "warn" : canUseUserDebug ? "good" : "muted"}>
            {hasAnyPrivilegedRole
              ? copy.hub.roleBasedOps.privileged
              : canUseUserDebug
                ? copy.hub.roleBasedOps.connected
                : copy.hub.roleBasedOps.connectWallet}
          </StatusPill>
        </div>
        <div className="space-y-4 p-4">
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-200/80">{copy.hub.roleBasedOps.availableSection}</div>
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
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">{copy.hub.roleBasedOps.lockedSection}</div>
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
          <h2 className="font-mono text-sm font-semibold text-zinc-300">{copy.hub.contractRegistry}</h2>
          <p className="mt-0.5 text-xs text-zinc-500">{copy.hub.contractRegistrySub}</p>
        </div>
        <dl className="divide-y divide-zinc-800/70 font-mono text-[11px]">
          {[
            [copy.hub.contractNames.dualPoolStaking, contractAddresses.staking],
            [copy.hub.contractNames.dualPoolStakingAdmin, governanceAddresses.adminFacade],
            [copy.hub.contractNames.dualPoolAdminModule, sepoliaAuxAddresses.dualPoolAdminModule],
            [copy.hub.contractNames.timelock48h, governanceAddresses.timelock],
            [copy.hub.contractNames.timelockSuper72h, governanceAddresses.timelockSuper],
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
