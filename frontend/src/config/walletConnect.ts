/** WalletConnect 项目 ID（https://cloud.walletconnect.com） */
const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim() ?? "";

export const hasWalletConnect = walletConnectProjectId.length > 0;

/** connectorsForWallets / getDefaultConfig 要求非空 projectId */
export const walletConnectProjectIdOrPlaceholder =
  walletConnectProjectId || "00000000000000000000000000000000";
