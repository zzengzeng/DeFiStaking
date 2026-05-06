"use client";

import { useAccount, useReadContract } from "wagmi";

import { timelockControllerAbi } from "@/contracts/abis/timelockController";
import { governanceAddresses } from "@/contracts/addresses";

const TL = governanceAddresses.timelock;
const ABI = timelockControllerAbi;

/** TimelockController 上的治理参与角色（与部署脚本授予的 proposer/executor/canceller 对齐）。 */
export function useTimelockGovernanceRoles() {
  const { address } = useAccount();

  const proposerRole = useReadContract({
    address: TL,
    abi: ABI,
    functionName: "PROPOSER_ROLE",
    query: { staleTime: 120_000, refetchOnWindowFocus: false },
  });
  const executorRole = useReadContract({
    address: TL,
    abi: ABI,
    functionName: "EXECUTOR_ROLE",
    query: { staleTime: 120_000, refetchOnWindowFocus: false },
  });
  const cancellerRole = useReadContract({
    address: TL,
    abi: ABI,
    functionName: "CANCELLER_ROLE",
    query: { staleTime: 120_000, refetchOnWindowFocus: false },
  });

  const pr = proposerRole.data;
  const er = executorRole.data;
  const cr = cancellerRole.data;

  const isProposer = useReadContract({
    address: TL,
    abi: ABI,
    functionName: "hasRole",
    args: pr && address ? [pr, address] : undefined,
    query: { enabled: Boolean(pr && address), staleTime: 30_000, refetchOnWindowFocus: false },
  });
  const isExecutor = useReadContract({
    address: TL,
    abi: ABI,
    functionName: "hasRole",
    args: er && address ? [er, address] : undefined,
    query: { enabled: Boolean(er && address), staleTime: 30_000, refetchOnWindowFocus: false },
  });
  const isCanceller = useReadContract({
    address: TL,
    abi: ABI,
    functionName: "hasRole",
    args: cr && address ? [cr, address] : undefined,
    query: { enabled: Boolean(cr && address), staleTime: 30_000, refetchOnWindowFocus: false },
  });

  const canPropose = Boolean(address && isProposer.data === true);
  const canExecute = Boolean(address && isExecutor.data === true);
  const canCancel = Boolean(address && isCanceller.data === true);
  const canAccessTimelockGovernance = canPropose || canExecute || canCancel;

  const refetch = async () => {
    await Promise.all([
      proposerRole.refetch(),
      executorRole.refetch(),
      cancellerRole.refetch(),
      isProposer.refetch(),
      isExecutor.refetch(),
      isCanceller.refetch(),
    ]);
  };

  const isLoading =
    proposerRole.isLoading ||
    executorRole.isLoading ||
    cancellerRole.isLoading ||
    (Boolean(address) && (isProposer.isLoading || isExecutor.isLoading || isCanceller.isLoading));

  return {
    address,
    canPropose,
    canExecute,
    canCancel,
    canAccessTimelockGovernance,
    isLoading,
    refetchTimelockRoles: refetch,
  };
}
