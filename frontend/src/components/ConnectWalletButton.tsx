"use client";

import { useConnectModal } from "@rainbow-me/rainbowkit";

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
