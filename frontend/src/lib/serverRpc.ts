import { createPublicClient, http, type PublicClient } from "viem";
import { mainnet, sepolia } from "viem/chains";

export function getChain(chainId: number) {
  return chainId === mainnet.id ? mainnet : sepolia;
}

/** Sepolia 默认 RPC：drpc 支持较大区块范围的归档 getLogs（publicnode 需个人 token）。 */
const SEPOLIA_INDEXER_RPC_FALLBACKS = ["https://sepolia.drpc.org", "https://1rpc.io/sepolia"] as const;

const MAINNET_INDEXER_RPC_FALLBACKS = ["https://eth.drpc.org", "https://1rpc.io/eth"] as const;

export function getIndexerRpcUrls(chainId: number): string[] {
  const env =
    chainId === mainnet.id ? process.env.NEXT_PUBLIC_RPC_URL_MAINNET : process.env.NEXT_PUBLIC_RPC_URL_SEPOLIA;
  const fallbacks = chainId === mainnet.id ? MAINNET_INDEXER_RPC_FALLBACKS : SEPOLIA_INDEXER_RPC_FALLBACKS;
  return [...new Set([...(env ? [env] : []), ...fallbacks])];
}

export function createIndexerClient(chainId: number, rpcUrl: string): PublicClient {
  return createPublicClient({ chain: getChain(chainId), transport: http(rpcUrl) });
}

/** 依次尝试多个 RPC，避免单一公共节点归档限制导致索引失败。 */
export async function withIndexerRpc<T>(chainId: number, fn: (client: PublicClient) => Promise<T>): Promise<T> {
  const urls = getIndexerRpcUrls(chainId);
  let lastError: unknown;

  for (const url of urls) {
    try {
      const client = createIndexerClient(chainId, url);
      return await fn(client);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("All RPC endpoints failed");
}
