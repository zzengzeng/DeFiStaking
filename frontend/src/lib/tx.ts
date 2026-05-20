import type { Hash, PublicClient } from "viem";
import { toast } from "sonner";

import { extractRevertReason, mapContractError } from "@/lib/errors";

export type ExecuteTxOptions = {
  /** 成功提示标题，如 “Stake Successful” */
  successTitle?: string;
};

/** 统一交易执行器：pending / success / error toast，等待回执。 */
export async function executeTx<T extends Hash>(label: string, action: () => Promise<T>, publicClient?: PublicClient, options?: ExecuteTxOptions) {
  const toastId = toast.loading("Transaction Pending…", { description: label });
  try {
    const hash = await action();
    if (publicClient) {
      await publicClient.waitForTransactionReceipt({ hash });
    }
    toast.dismiss(toastId);
    const title = options?.successTitle ?? `${label} successful`;
    toast.success(title, { description: `${String(hash).slice(0, 10)}…${String(hash).slice(-8)}` });
    return hash;
  } catch (error) {
    toast.dismiss(toastId);
    throw error;
  }
}

/** 统一处理交易异常并输出可读错误 toast（用于未走 executeTx 的路径）。 */
export function handleTxError(error: unknown) {
  const raw = extractRevertReason(error);
  const friendly = mapContractError(error);
  toast.error(friendly, { description: raw !== friendly ? raw.slice(0, 160) : undefined });
  throw error;
}
