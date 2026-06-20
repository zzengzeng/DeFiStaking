import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import {
  coinbaseWallet,
  injectedWallet,
  metaMaskWallet,
  rainbowWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { http } from "wagmi";
import { mainnet, sepolia } from "wagmi/chains";

import { isMainnetTarget } from "@/config/chains";

const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim() ?? "";

const sepoliaRpc = process.env.NEXT_PUBLIC_RPC_URL_SEPOLIA ?? "https://sepolia.drpc.org";
const mainnetRpc = process.env.NEXT_PUBLIC_RPC_URL_MAINNET;

/** WalletConnect 项目 ID（https://cloud.walletconnect.com） */
export const hasWalletConnect = walletConnectProjectId.length > 0;

const rainbowBase = {
  appName: "DualPool Staking",
  appDescription: "双池质押 · 灵活池与锁仓池",
  // connectorsForWallets / getDefaultConfig 要求非空；未配置 WC 时仅用浏览器扩展钱包
  projectId: walletConnectProjectId || "00000000000000000000000000000000",
  ssr: true as const,
};

const browserWallets = [
  {
    groupName: "推荐",
    wallets: [metaMaskWallet, rainbowWallet, coinbaseWallet, injectedWallet],
  },
];

const walletsWithConnect = [
  {
    groupName: "推荐",
    wallets: [metaMaskWallet, rainbowWallet, coinbaseWallet],
  },
  {
    groupName: "其他",
    wallets: [walletConnectWallet, injectedWallet],
  },
];

function buildWagmiConfig() {
  const wallets = hasWalletConnect ? walletsWithConnect : browserWallets;

  if (isMainnetTarget) {
    return getDefaultConfig({
      ...rainbowBase,
      chains: [mainnet],
      transports: { [mainnet.id]: http(mainnetRpc) },
      wallets,
    });
  }

  return getDefaultConfig({
    ...rainbowBase,
    chains: [sepolia],
    transports: { [sepolia.id]: http(sepoliaRpc) },
    wallets,
  });
}

export const wagmiConfig = buildWagmiConfig();
