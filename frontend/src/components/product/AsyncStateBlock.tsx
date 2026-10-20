"use client";

import { ProductSkeletonRows, ProductStateCard } from "@/components/product/ProductStateCard";
import { useI18n } from "@/lib/i18n";

type Props = {
  loading?: boolean;
  error?: boolean;
  empty?: boolean;
  loadingRows?: number;
  errorTitle?: string;
  errorDescription?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  children: React.ReactNode;
};

/** 页面片段统一状态容器：加载、错误、空态语义保持一致。 */
export function AsyncStateBlock({
  loading,
  error,
  empty,
  loadingRows = 3,
  errorTitle,
  errorDescription,
  emptyTitle,
  emptyDescription,
  children,
}: Props) {
  const { t } = useI18n();

  if (loading) return <ProductSkeletonRows rows={loadingRows} />;
  if (error) {
    return (
      <ProductStateCard
        compact
        tone="error"
        title={errorTitle ?? t("async.errorTitle")}
        description={errorDescription ?? t("async.errorDescription")}
      />
    );
  }
  if (empty) {
    return (
      <ProductStateCard
        compact
        title={emptyTitle ?? t("async.emptyTitle")}
        description={emptyDescription ?? t("async.emptyDescription")}
      />
    );
  }
  return <>{children}</>;
}
