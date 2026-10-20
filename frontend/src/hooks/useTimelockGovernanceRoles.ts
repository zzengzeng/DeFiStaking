"use client";

import { useAccount, useReadContract } from "wagmi";

import { timelockControllerAbi } from "@/contracts/abis/timelockController";
import { governanceAddresses } from "@/contracts/addresses";

const ABI = timelockControllerAbi;

/** TimelockController 上的治理参与角色（与部署脚本授予的 proposer/executor/canceller 对齐）。 */
export function useTimelockGovernanceRoles(timelockAddress: `0x${string}` = governanceAddresses.timelock) {
  const { address } = useAccount();
  const enabled = timelockAddress !== "0x0000000000000000000000000000000000000000";

  const proposerRole = useReadContract({
    address: timelockAddress,
    abi: ABI,
    functionName: "PROPOSER_ROLE",
    query: { enabled, staleTime: 120_000, refetchOnWindowFocus: false },
  });
  const executorRole = useReadContract({
    address: timelockAddress,
    abi: ABI,
    functionName: "EXECUTOR_ROLE",
    query: { enabled, staleTime: 120_000, refetchOnWindowFocus: false },
  });
  const cancellerRole = useReadContract({
    address: timelockAddress,
    abi: ABI,
    functionName: "CANCELLER_ROLE",
    query: { enabled, staleTime: 120_000, refetchOnWindowFocus: false },
  });

  const pr = proposerRole.data;
  const er = executorRole.data;
  const cr = cancellerRole.data;

  const isProposer = useReadContract({
    address: timelockAddress,
    abi: ABI,
    functionName: "hasRole",
    args: pr && address ? [pr, address] : undefined,
    query: { enabled: enabled && Boolean(pr && address), staleTime: 30_000, refetchOnWindowFocus: false },
  });
  const isExecutor = useReadContract({
    address: timelockAddress,
    abi: ABI,
    functionName: "hasRole",
    args: er && address ? [er, address] : undefined,
    query: { enabled: enabled && Boolean(er && address), staleTime: 30_000, refetchOnWindowFocus: false },
  });
  const isCanceller = useReadContract({
    address: timelockAddress,
    abi: ABI,
    functionName: "hasRole",
    args: cr && address ? [cr, address] : undefined,
    query: { enabled: enabled && Boolean(cr && address), staleTime: 30_000, refetchOnWindowFocus: false },
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
