import type { Address, Hash } from "viem";

/** 区块浏览器交易链接（纯函数，供 store / lib 使用） */
export function getTxExplorerUrl(chainId: number, hash: Hash): string {
  if (chainId === 11_155_111) return `https://sepolia.etherscan.io/tx/${hash}`;
  return `https://etherscan.io/tx/${hash}`;
}

/** 合约 / 账户地址在浏览器中的页面链接 */
export function getAddressExplorerUrl(chainId: number, address: Address): string {
  if (chainId === 11_155_111) return `https://sepolia.etherscan.io/address/${address}`;
  return `https://etherscan.io/address/${address}`;
}
