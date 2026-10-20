"use client";

import Link from "next/link";
import { useChainId } from "wagmi";

import { contractAddresses } from "@/contracts/addresses";
import { appChain, appChainLabel, isMainnetTarget } from "@/config/chains";
import { getAddressExplorerUrl } from "@/lib/explorerLink";
import { useI18n } from "@/lib/i18n";
import { getConfiguredSocialLinks, SITE_LINKS } from "@/lib/siteLinks";
import { showsUsdEstimates } from "@/lib/tokenPrices";

function ShortAddress({ address }: { address: `0x${string}` }) {
  return (
    <span className="font-mono text-[11px] text-zinc-400">
      {address.slice(0, 6)}…{address.slice(-4)}
    </span>
  );
}

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-zinc-400 transition hover:text-zinc-100"
    >
      {children}
      <span aria-hidden className="text-[10px] opacity-60">
        ↗
      </span>
    </a>
  );
}

function SocialIcon({ id }: { id: "twitter" | "discord" | "telegram" }) {
  const common = "size-4 shrink-0";
  if (id === "twitter") {
    return (
      <svg viewBox="0 0 24 24" className={common} fill="currentColor" aria-hidden>
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    );
  }
  if (id === "discord") {
    return (
      <svg viewBox="0 0 24 24" className={common} fill="currentColor" aria-hidden>
        <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className={common} fill="currentColor" aria-hidden>
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  );
}

/** 产品页脚：网络、合约、文档、社区与风险提示 */
export function ProductFooter() {
  const chainId = useChainId();
  const { t } = useI18n();
  const socialLinks = getConfiguredSocialLinks();

  const docLinks = [
    { href: "/learn", label: t("footer.docLearn"), external: false },
    { href: "/console", label: t("footer.docConsole"), external: false },
    { href: SITE_LINKS.prd, label: t("footer.docPrd"), external: true },
    { href: SITE_LINKS.security, label: t("footer.docSecurity"), external: true },
    { href: SITE_LINKS.contributing, label: t("footer.docContributing"), external: true },
    { href: SITE_LINKS.github, label: t("footer.docGithub"), external: true },
  ] as const;

  const contracts = [
    { label: t("footer.staking"), address: contractAddresses.staking },
    { label: "TokenA", address: contractAddresses.tokenA },
    { label: "TokenB", address: contractAddresses.tokenB },
  ] as const;

  return (
    <footer className="mt-10 border-t border-[var(--dp-border)] pt-8 pb-4">
      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{t("footer.network")}</h2>
          <p className="mt-2 text-sm text-zinc-300">{appChainLabel}</p>
          <p className="mt-1 text-xs text-zinc-500">
            {isMainnetTarget ? t("footer.mainnet") : t("footer.testnet")} · {t("footer.chainId")} {appChain.id}
          </p>
          {!showsUsdEstimates ? <p className="mt-2 text-[11px] leading-relaxed text-zinc-600">{t("footer.usdHint")}</p> : null}
        </div>

        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{t("footer.contracts")}</h2>
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

        <div className="sm:col-span-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{t("footer.docs")}</h2>
          <ul className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
            {docLinks.map((link) => (
              <li key={link.href}>
                {link.external ? (
                  <ExternalLink href={link.href}>{link.label}</ExternalLink>
                ) : (
                  <Link href={link.href} className="text-zinc-400 transition hover:text-zinc-100">
                    {link.label}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{t("footer.social")}</h2>
          {socialLinks.length > 0 ? (
            <ul className="mt-2 space-y-2">
              {socialLinks.map((link) => (
                <li key={link.id}>
                  <ExternalLink href={link.href}>
                    <span className="inline-flex items-center gap-2">
                      <SocialIcon id={link.id} />
                      {t(link.labelKey)}
                    </span>
                  </ExternalLink>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[11px] leading-relaxed text-zinc-600">{t("footer.socialEmpty")}</p>
          )}
        </div>
      </div>

      <p className="mt-8 text-center text-[11px] leading-relaxed text-zinc-600">
        {t("footer.disclaimer")}{" "}
        <a
          href={SITE_LINKS.security}
          target="_blank"
          rel="noopener noreferrer"
          className="text-zinc-500 underline decoration-zinc-700 underline-offset-2 hover:text-zinc-300"
        >
          {t("footer.disclaimerLink")}
        </a>
        {t("footer.disclaimerEnd")}
      </p>
    </footer>
  );
}
