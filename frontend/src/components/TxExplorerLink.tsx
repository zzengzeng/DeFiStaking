"use client";

import type { Hash } from "viem";

import { useExplorerLink } from "@/hooks/useExplorerLink";

type Props = {
  hash?: Hash | null;
  className?: string;
  label?: string;
};

export function TxExplorerLink({ hash, className, label = "View on explorer" }: Props) {
  const href = useExplorerLink(hash ?? undefined);
  if (!hash || !href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className={className ?? "text-sky-400 underline-offset-2 hover:text-sky-300 hover:underline"}
    >
      {label}
    </a>
  );
}
