"use client";

import type { Hash } from "viem";

import { useExplorerLink } from "@/hooks/useExplorerLink";
import { useI18n } from "@/lib/i18n";

type Props = {
  hash?: Hash | null;
  className?: string;
  label?: string;
};

export function TxExplorerLink({ hash, className, label }: Props) {
  const { t } = useI18n();
  const href = useExplorerLink(hash ?? undefined);
  const displayLabel = label ?? t("txCenter.explorer");
  if (!hash || !href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className={className ?? "text-sky-400 underline-offset-2 hover:text-sky-300 hover:underline"}
    >
      {displayLabel}
    </a>
  );
}
