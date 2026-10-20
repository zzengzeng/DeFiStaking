"use client";

import clsx from "clsx";

type LayoutMode = "stack" | "split";

/** 质押页布局：默认上下结构（仓位在上，操作区在下） */
export function ProductStakePageLayout({
  hero,
  sidebar,
  action,
  below,
  layout = "stack",
  sidebarCols = "lg:col-span-7 xl:col-span-8",
  actionCols = "lg:col-span-5 xl:col-span-4",
  centeredAction = false,
  actionMaxWidth = "",
  detailsMaxWidth = "",
}: {
  hero?: React.ReactNode;
  sidebar?: React.ReactNode;
  action: React.ReactNode;
  below?: React.ReactNode;
  /** stack：操作区在上居中；split：左右分栏（控制台等场景） */
  layout?: LayoutMode;
  sidebarCols?: string;
  actionCols?: string;
  /** split 且无 sidebar 时居中操作区 */
  centeredAction?: boolean;
  actionMaxWidth?: string;
  detailsMaxWidth?: string;
}) {
  const hasSidebar = Boolean(sidebar);

  if (layout === "stack") {
    return (
      <div className="min-w-0 space-y-6 sm:space-y-8">
        {hero}

        {hasSidebar ? (
          <div className={clsx("w-full min-w-0 space-y-4", detailsMaxWidth)}>{sidebar}</div>
        ) : null}

        <div className={clsx("w-full min-w-0", actionMaxWidth)}>
          <div className="space-y-4">{action}</div>
        </div>

        {below ? <div className="min-w-0">{below}</div> : null}
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-6 sm:space-y-8">
      {hero}

      {hasSidebar ? (
        <div className="grid items-start gap-6 lg:grid-cols-12 lg:gap-8">
          <div className={clsx("order-2 min-w-0 space-y-4 lg:order-1", sidebarCols)}>{sidebar}</div>
          <div className={clsx("order-1 min-w-0 lg:order-2", actionCols)}>
            <div className="dp-sticky space-y-4">{action}</div>
          </div>
        </div>
      ) : (
        <div className={clsx("min-w-0", centeredAction && "mx-auto w-full", centeredAction && actionMaxWidth)}>
          <div className="dp-sticky space-y-4">{action}</div>
        </div>
      )}

      {below ? <div className="min-w-0">{below}</div> : null}
    </div>
  );
}
