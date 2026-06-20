"use client";

import { GovernancePanel } from "@/components/GovernancePanel";
import { ProductStateCard } from "@/components/product/ProductStateCard";
import { governanceAddresses } from "@/contracts/addresses";
import { CONSOLE_COPY } from "@/lib/consoleCopy";
import { useProtocolRoles } from "@/hooks/useProtocolRoles";
import { useTimelockGovernanceRoles } from "@/hooks/useTimelockGovernanceRoles";

/** 控制台：治理与 Timelock 运维 */
export function ConsoleGovernancePage() {
  const { address, isAdmin, isOperator, isLoading: coreRolesLoading } = useProtocolRoles();
  const { canAccessTimelockGovernance, isLoading: tlRolesLoading } = useTimelockGovernanceRoles();
  const { canAccessTimelockGovernance: canAccessSuperTimelock, isLoading: superRolesLoading } =
    useTimelockGovernanceRoles(governanceAddresses.timelockSuper);

  const loading = coreRolesLoading || tlRolesLoading || superRolesLoading;
  const canEnter = Boolean(address && (isAdmin || isOperator || canAccessTimelockGovernance || canAccessSuperTimelock));
  const header = (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4 sm:p-5">
      <div className="text-xs font-medium uppercase tracking-wide text-amber-200/80">{CONSOLE_COPY.governance.eyebrow}</div>
      <h1 className="mt-2 font-mono text-xl font-semibold text-zinc-100 sm:text-2xl">{CONSOLE_COPY.governance.title}</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-500">{CONSOLE_COPY.governance.desc}</p>
    </section>
  );

  if (!address) {
    return (
      <div className="min-w-0 space-y-4 sm:space-y-5">
        {header}
        <ProductStateCard
          tone="warning"
          title={CONSOLE_COPY.governance.connectWallet}
          description={CONSOLE_COPY.governance.connectWalletDesc}
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-w-0 space-y-4 sm:space-y-5">
        {header}
        <ProductStateCard
          tone="loading"
          title={CONSOLE_COPY.governance.loadingRoles}
          description={CONSOLE_COPY.governance.loadingRolesDesc}
        />
      </div>
    );
  }

  if (!canEnter) {
    return (
      <div className="min-w-0 space-y-4 sm:space-y-5">
        {header}
        <ProductStateCard
          tone="error"
          title={CONSOLE_COPY.governance.noPermission}
          description={CONSOLE_COPY.governance.noPermissionDesc}
        />
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-4 sm:space-y-5">
      {header}
      <GovernancePanel />
    </div>
  );
}
