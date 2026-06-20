import { mainnet, sepolia } from "wagmi/chains";

const parsedChainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? sepolia.id);

/** 应用目标链（主网部署时设置 NEXT_PUBLIC_CHAIN_ID=1） */
export const isMainnetTarget = parsedChainId === mainnet.id;

export const supportedChains = isMainnetTarget ? ([mainnet] as const) : ([sepolia] as const);

export const appChain = supportedChains[0];

export const appChainLabel = isMainnetTarget ? "Ethereum" : "Sepolia";
