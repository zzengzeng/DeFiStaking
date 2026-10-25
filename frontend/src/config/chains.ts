import { defineChain } from "viem";
import { mainnet, sepolia } from "wagmi/chains";

/**
 * Anvil 本地开发链（chainId 31337）。
 * 仅在 `NEXT_PUBLIC_CHAIN_ID=31337` 时启用，避免误连测试网 / 主网。
 */
export const anvil = defineChain({
  id: 31337,
  name: "Anvil Local",
  nativeCurrency: { decimals: 18, name: "Ether", symbol: "ETH" },
  rpcUrls: {
    default: { http: ["http://127.0.0.1:8545"] },
  },
  testnet: true,
});

const parsedChainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? sepolia.id);

/** 应用目标链（主网部署时设置 NEXT_PUBLIC_CHAIN_ID=1） */
export const isMainnetTarget = parsedChainId === mainnet.id;
/** Anvil 本地开发环境 */
export const isAnvilTarget = parsedChainId === anvil.id;

export const supportedChains = isMainnetTarget
  ? ([mainnet] as const)
  : isAnvilTarget
    ? ([anvil] as const)
    : ([sepolia] as const);

export const appChain = supportedChains[0];

export const appChainLabel = isMainnetTarget ? "Ethereum" : isAnvilTarget ? "Anvil" : "Sepolia";
