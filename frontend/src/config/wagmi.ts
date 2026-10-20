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
import {
  hasWalletConnect,
  walletConnectProjectIdOrPlaceholder,
} from "@/config/walletConnect";

const sepoliaRpc = process.env.NEXT_PUBLIC_RPC_URL_SEPOLIA ?? "https://sepolia.drpc.org";
const mainnetRpc = process.env.NEXT_PUBLIC_RPC_URL_MAINNET;

const rainbowBase = {
  appName: "DualPool Staking",
  appDescription: "双池质押 · 灵活池与锁仓池",
  projectId: walletConnectProjectIdOrPlaceholder,
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

let wagmiConfigSingleton: ReturnType<typeof buildWagmiConfig> | undefined;

/** 仅在客户端挂载 Web3Provider 时构建，避免 SSR 侧效（WalletConnect / indexedDB） */
export function getWagmiConfig() {
  if (!wagmiConfigSingleton) {
    wagmiConfigSingleton = buildWagmiConfig();
  }
  return wagmiConfigSingleton;
}
