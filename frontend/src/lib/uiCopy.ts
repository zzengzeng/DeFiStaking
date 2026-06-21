"use client";

import { useMemo } from "react";

import { useI18n } from "@/lib/i18n";

/** 全站共享 UI 文案 hook（Timelock、赎回预览、运维交易标签等） */
export function useUiCopy() {
  const { t } = useI18n();

  return useMemo(
    () => ({
      timelock: {
        notQueued: t("timelock.notQueued"),
        queued: t("timelock.queued"),
        ready: t("timelock.ready"),
        executed: t("timelock.executed"),
        cancelled: t("timelock.cancelled"),
        remaining: t("timelock.remaining"),
        executeAt: t("timelock.executeAt"),
        remainingHms: t("timelock.remainingHms"),
        executedAt: t("timelock.executedAt"),
        cancelledAt: t("timelock.cancelledAt"),
        idleHint: t("timelock.idleHint"),
        schedule: t("timelock.schedule"),
        execute: t("timelock.execute"),
        cancel: t("timelock.cancel"),
        executeTitle: (title: string) => t("timelock.executeTitle", { title }),
        executeWarning: t("timelock.executeWarning"),
        executeConfirm: t("timelock.executeConfirm"),
        scheduleAction: (title: string) => t("timelock.scheduleAction", { title }),
        executeAction: (title: string) => t("timelock.executeAction", { title }),
        cancelAction: (title: string) => t("timelock.cancelAction", { title }),
        queueTitle: t("timelock.queueTitle"),
        queueDesc: t("timelock.queueDesc"),
        queueEmpty: t("timelock.queueEmpty"),
        queueEmptyHint: t("timelock.queueEmptyHint"),
        recentTitle: t("timelock.recentTitle"),
        recentDesc: t("timelock.recentDesc"),
        colFunction: t("timelock.colFunction"),
        colParams: t("timelock.colParams"),
        colDomain: t("timelock.colDomain"),
        colExecuteAt: t("timelock.colExecuteAt"),
        colRemaining: t("timelock.colRemaining"),
        colStatus: t("timelock.colStatus"),
        colSettledAt: t("timelock.colSettledAt"),
        unknown: t("timelock.unknown"),
        roleSchedule: t("timelock.roleSchedule"),
        roleExecute: t("timelock.roleExecute"),
        roleCancel: t("timelock.roleCancel"),
        domainHighPrivilege: t("timelock.domainHighPrivilege"),
        domainProtocolState: t("timelock.domainProtocolState"),
        domainFundsAccounting: t("timelock.domainFundsAccounting"),
        domainParamChange: t("timelock.domainParamChange"),
        params: t("timelock.params"),
        completedAt: t("timelock.completedAt"),
        blockPrefix: t("timelock.blockPrefix"),
        pendingBadge: (count: number) => t("timelock.pendingBadge", { count }),
        historyBadge: (count: number) => t("timelock.historyBadge", { count }),
        copyOpId: t("timelock.copyOpId"),
        copyParamsHash: t("timelock.copyParamsHash"),
      },
      withdrawPreview: {
        contractGross: t("withdrawPreview.contractGross"),
        walletReceive: t("withdrawPreview.walletReceive"),
        youReceive: t("withdrawPreview.youReceive"),
        fee: t("withdrawPreview.fee"),
        penalty: t("withdrawPreview.penalty"),
        fotHint: (pct: string) => t("withdrawPreview.fotHint", { pct }),
      },
      operator: {
        approveNotify: (pool: "A" | "B") =>
          t(pool === "A" ? "operatorTx.approveNotifyA" : "operatorTx.approveNotifyB"),
        notify: (pool: "A" | "B") => t(pool === "A" ? "operatorTx.notifyA" : "operatorTx.notifyB"),
        enableEmergency: t("operatorTx.enableEmergency"),
      },
    }),
    [t],
  );
}
