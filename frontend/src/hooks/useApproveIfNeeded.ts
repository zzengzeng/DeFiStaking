"use client";

import { useCallback, useMemo } from "react";
import type { Address } from "viem";
import { useAccount, useReadContract } from "wagmi";

import { erc20Abi } from "@/contracts/abis/erc20";

type Args = {
  token: Address | undefined;
  spender: Address | undefined;
};

/**
 * 读取 ERC20 allowance，判断是否需要 approve。
 * Approve 链上状态推进由 {@link useTransactionFlow.executeApprove} 统一管理；
 * 本 hook 在交易确认后应通过 `refetchAllowance()` 与 `invalidate` 刷新读数。
 */
export function useApproveIfNeeded({ token, spender }: Args) {
  const { address: owner } = useAccount();

  const enabled = Boolean(token && spender && owner && token !== "0x0000000000000000000000000000000000000000");

  const { data: allowanceWei = 0n, refetch, isFetching } = useReadContract({
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: owner && spender ? [owner, spender] : undefined,
    query: { enabled, staleTime: 10_000 },
  });

  const needsApproval = useCallback(
    (amountWei: bigint) => {
      if (!enabled || amountWei <= 0n) return false;
      return allowanceWei < amountWei;
    },
    [allowanceWei, enabled],
  );

  const snapshot = useMemo(() => ({ allowanceWei, needsApproval, isFetching }), [allowanceWei, needsApproval, isFetching]);

  return { ...snapshot, refetchAllowance: refetch };
}
