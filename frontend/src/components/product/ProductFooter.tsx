"use client";

import Link from "next/link";
import { useChainId } from "wagmi";

import { contractAddresses } from "@/contracts/addresses";
import { appChain, appChainLabel, isMainnetTarget } from "@/config/chains";
import { getAddressExplorerUrl } from "@/lib/explorerLink";

const DOC_LINKS = [
  { href: "/learn", label: "协议说明" },
  { href: "/console", label: "合约控制台" },
] as const;

function ShortAddress({ address }: { address: `0x${string}` }) {
  return (
    <span className="font-mono text-[11px] text-zinc-400">
      {address.slice(0, 6)}…{address.slice(-4)}
    </span>
  );
}

/** 产品页脚：网络、合约、文档与风险提示 */
export function ProductFooter() {
  const chainId = useChainId();

  const contracts = [
    { label: "质押合约", address: contractAddresses.staking },
    { label: "TokenA", address: contractAddresses.tokenA },
    { label: "TokenB", address: contractAddresses.tokenB },
  ] as const;

  return (
    <footer className="mt-10 border-t border-[var(--dp-border)] pt-8 pb-4">
      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">网络</h2>
          <p className="mt-2 text-sm text-zinc-300">{appChainLabel}</p>
          <p className="mt-1 text-xs text-zinc-500">
            {isMainnetTarget ? "主网部署" : "测试网演示"} · Chain ID {appChain.id}
          </p>
        </div>

        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">合约</h2>
          <ul className="mt-2 space-y-2">
            {contracts.map(({ label, address }) => (
              <li key={label} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-zinc-400">{label}</span>
                <a
                  href={getAddressExplorerUrl(chainId, address)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-dp-accent hover:underline"
                >
                  <ShortAddress address={address} />
                  <span aria-hidden>↗</span>
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">文档</h2>
          <ul className="mt-2 space-y-2 text-sm">
            {DOC_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="text-zinc-400 transition hover:text-zinc-100">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <p className="mt-8 text-center text-[11px] leading-relaxed text-zinc-600">
        智能合约交互存在风险；收益率随池内参数动态变化，不构成收益承诺。请自行评估合约审计与链上状态后再操作。
      </p>
    </footer>
  );
}
