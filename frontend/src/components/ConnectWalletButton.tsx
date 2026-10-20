"use client";

import { ConnectButton, useConnectModal } from "@rainbow-me/rainbowkit";
import clsx from "clsx";

import { useI18n } from "@/lib/i18n";

type Props = {
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
};

/** 统一唤起 RainbowKit 连接弹窗，避免多处 ConnectButton.Custom 重复挂载监听器 */
export function ConnectWalletButton({ children, className, disabled }: Props) {
  const { openConnectModal } = useConnectModal();

  return (
    <button
      type="button"
      disabled={disabled || !openConnectModal}
      onClick={() => openConnectModal?.()}
      className={className}
    >
      {children}
    </button>
  );
}

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

type BrandedWalletButtonProps = {
  compact?: boolean;
  variant?: "product" | "console";
};

/** 顶栏钱包按钮：保留 RainbowKit 账户/网络逻辑，但视觉跟随 DualPool 品牌。 */
export function BrandedWalletButton({ compact = false, variant = "product" }: BrandedWalletButtonProps) {
  const { t } = useI18n();
  const isConsole = variant === "console";

  return (
    <ConnectButton.Custom>
      {({ account, chain, mounted, openAccountModal, openChainModal, openConnectModal }) => {
        const ready = mounted;
        const connected = ready && account && chain;
        const baseClass = clsx(
          "inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-semibold transition",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
          compact ? "max-w-[8.5rem]" : "max-w-[13rem]",
          isConsole
            ? "border-amber-300/25 bg-amber-300/10 text-amber-100 hover:border-amber-300/45 hover:bg-amber-300/15 focus-visible:outline-amber-300"
            : "border-sky-300/25 bg-sky-400/10 text-sky-100 hover:border-sky-300/45 hover:bg-sky-400/15 focus-visible:outline-sky-300",
        );

        if (!ready) {
          return (
            <button type="button" className={clsx(baseClass, "opacity-60")} disabled>
              <span className="size-2 rounded-full bg-zinc-500" />
              <span className="truncate">{t("wallet.loading")}</span>
            </button>
          );
        }

        if (!connected) {
          return (
            <button type="button" onClick={openConnectModal} className={baseClass}>
              <span className={clsx("size-2 rounded-full", isConsole ? "bg-amber-300" : "bg-[var(--dp-accent)]")} />
              <span className="truncate">{t("wallet.connect")}</span>
            </button>
          );
        }

        if (chain.unsupported) {
          return (
            <button
              type="button"
              onClick={openChainModal}
              className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-red-400/35 bg-red-400/10 px-3 text-sm font-semibold text-red-100 transition hover:bg-red-400/15"
            >
              <span className="size-2 rounded-full bg-red-300" />
              <span className="truncate">{t("wallet.switchNetwork")}</span>
            </button>
          );
        }

        return (
          <button type="button" onClick={openAccountModal} className={baseClass} title={`${account.address} · ${chain.name}`}>
            <span className={clsx("size-2 rounded-full", isConsole ? "bg-emerald-300" : "bg-emerald-300")} />
            <span className="truncate">{compact ? shortAddress(account.address) : account.displayName}</span>
            {!compact ? <span className="hidden rounded-md bg-black/20 px-1.5 py-0.5 text-[10px] text-zinc-400 sm:inline">{chain.name}</span> : null}
          </button>
        );
      }}
    </ConnectButton.Custom>
  );
}
