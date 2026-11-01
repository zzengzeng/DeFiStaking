"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { isAddress } from "viem";
import { useAccount, useWriteContract } from "wagmi";
import clsx from "clsx";

import { BrandedWalletButton } from "@/components/ConnectWalletButton";
import { AuthControls, useSignedInAdmin } from "@/components/auth/AuthControls";
import { dualPoolSuperAdminAbi } from "@/contracts/abis/dualPoolSuperAdmin";
import { useSuperAdminRoles } from "@/hooks/useSuperAdminRoles";
import { useSuperAdminRolesList } from "@/hooks/useSuperAdminRolesList";
import { useWriteWithStatus } from "@/hooks/useWriteWithStatus";
import { useLocaleStore } from "@/store/useLocaleStore";
import { getAddressExplorerUrl } from "@/lib/explorerLink";
import { useChainId } from "wagmi";
import type { TxState } from "@/lib/txFlowTypes";
import { isTxBusy } from "@/lib/txFlowTypes";
import type { RoleHolderEntry, SuperAdminRoleKey } from "@/types/superAdminRoles";

/* ─────────────────────────── i18n ─────────────────────────── */

type Copy = {
  eyebrow: string;
  title: string;
  subtitle: string;
  contract: string;
  owner: string;
  yourRole: string;
  yourRoleHint: string;
  roleManage: string;
  roleManageHint: string;
  grant: string;
  revoke: string;
  adminRole: string;
  operatorRole: string;
  defaultAdminRole: string;
  connectWallet: string;
  connectWalletHint: string;
  noDefaultAdmin: string;
  noDefaultAdminHint: string;
  notConfigured: string;
  notConfiguredHint: string;
  unknown: string;
  yes: string;
  no: string;
  you: string;
  invalidAddress: string;
  refresh: string;
  // 新增
  holdersTitle: string;
  holdersSubtitle: string;
  searchPlaceholder: string;
  filterAll: string;
  filterSuper: string;
  filterAdmin: string;
  filterOperator: string;
  grantNew: string;
  emptyTitle: string;
  emptyHint: string;
  emptyHintNoConfig: string;
  loading: string;
  address: string;
  roles: string;
  lastChanged: string;
  actions: string;
  modalGrantTitle: string;
  modalManageTitle: string;
  modalSubtitle: string;
  modalAddressLabel: string;
  modalAddressPlaceholder: string;
  modalRolesLabel: string;
  modalConfirm: string;
  modalCancel: string;
  modalClose: string;
  noMatching: string;
  chainHead: string;
  fromBlock: string;
  holderCount: string;
  totalHolders: string;
};

const COPY: Record<"zh" | "en", Copy> = {
  zh: {
    eyebrow: "SUPER ADMIN",
    title: "角色管理后台",
    subtitle: "授予或撤销 ADMIN_ROLE 与 OPERATOR_ROLE，掌控合约治理层级",
    contract: "合约地址",
    owner: "Ownable 所有者",
    yourRole: "当前钱包角色",
    yourRoleHint: "当前连接钱包在 SuperAdmin 合约中持有的角色",
    roleManage: "角色管理",
    roleManageHint: "仅 DEFAULT_ADMIN_ROLE 持有者可授予 / 撤销其他角色",
    grant: "授予",
    revoke: "撤销",
    adminRole: "ADMIN_ROLE · 普通管理员",
    operatorRole: "OPERATOR_ROLE · 运营",
    defaultAdminRole: "DEFAULT_ADMIN_ROLE · 超级管理员",
    connectWallet: "连接钱包",
    connectWalletHint: "连接钱包后查看你的角色并执行管理操作",
    noDefaultAdmin: "当前钱包没有超级管理员权限",
    noDefaultAdminHint: "只有 DEFAULT_ADMIN_ROLE 持有者可以授予或撤销角色",
    notConfigured: "SuperAdmin 合约未配置",
    notConfiguredHint: "请在 .env.local 中设置 NEXT_PUBLIC_DUAL_POOL_SUPER_ADMIN_ADDRESS 后刷新",
    unknown: "未知",
    yes: "是",
    no: "否",
    you: "你",
    invalidAddress: "地址格式不正确",
    refresh: "刷新",
    holdersTitle: "角色持有者",
    holdersSubtitle: "按地址查看当前每个角色的持有者列表（来源：链上 RoleGranted / RoleRevoked 事件）",
    searchPlaceholder: "搜索地址 0x...",
    filterAll: "全部",
    filterSuper: "超级管理员",
    filterAdmin: "普通管理员",
    filterOperator: "运营",
    grantNew: "授予新地址",
    emptyTitle: "暂无角色持有者",
    emptyHint: "尚未发生过 RoleGranted 事件",
    emptyHintNoConfig: "请在 .env.local 中配置 SuperAdmin 合约地址",
    loading: "加载中…",
    address: "地址",
    roles: "角色",
    lastChanged: "最后变更",
    actions: "操作",
    modalGrantTitle: "授予新地址",
    modalManageTitle: "管理地址角色",
    modalSubtitle: "勾选要授予的角色，未勾选的角色将被撤销",
    modalAddressLabel: "地址",
    modalAddressPlaceholder: "0x... 或 .eth",
    modalRolesLabel: "要授予的角色",
    modalConfirm: "确认",
    modalCancel: "取消",
    modalClose: "关闭",
    noMatching: "没有匹配的持有者",
    chainHead: "链上最新块",
    fromBlock: "索引起始块",
    holderCount: "持有者",
    totalHolders: "共 {n} 位持有者",
  },
  en: {
    eyebrow: "SUPER ADMIN",
    title: "Role Management Console",
    subtitle: "Grant or revoke ADMIN_ROLE and OPERATOR_ROLE to govern the contract hierarchy",
    contract: "Contract",
    owner: "Ownable Owner",
    yourRole: "Your Wallet Roles",
    yourRoleHint: "Roles held by the currently connected wallet in the SuperAdmin contract",
    roleManage: "Role Management",
    roleManageHint: "Only DEFAULT_ADMIN_ROLE holders can grant or revoke other roles",
    grant: "Grant",
    revoke: "Revoke",
    adminRole: "ADMIN_ROLE · Administrator",
    operatorRole: "OPERATOR_ROLE · Operator",
    defaultAdminRole: "DEFAULT_ADMIN_ROLE · Super Admin",
    connectWallet: "Connect Wallet",
    connectWalletHint: "Connect a wallet to view your roles and perform admin operations",
    noDefaultAdmin: "Wallet lacks super admin privileges",
    noDefaultAdminHint: "Only DEFAULT_ADMIN_ROLE holders can grant or revoke roles",
    notConfigured: "SuperAdmin contract not configured",
    notConfiguredHint: "Set NEXT_PUBLIC_DUAL_POOL_SUPER_ADMIN_ADDRESS in .env.local and refresh",
    unknown: "Unknown",
    yes: "Yes",
    no: "No",
    you: "You",
    invalidAddress: "Invalid address",
    refresh: "Refresh",
    holdersTitle: "Role Holders",
    holdersSubtitle: "View current holders of each role (sourced from on-chain RoleGranted / RoleRevoked events)",
    searchPlaceholder: "Search address 0x...",
    filterAll: "All",
    filterSuper: "Super Admin",
    filterAdmin: "Admin",
    filterOperator: "Operator",
    grantNew: "Grant to Address",
    emptyTitle: "No role holders yet",
    emptyHint: "No RoleGranted events have been recorded",
    emptyHintNoConfig: "Configure the SuperAdmin contract address in .env.local",
    loading: "Loading…",
    address: "Address",
    roles: "Roles",
    lastChanged: "Last changed",
    actions: "Actions",
    modalGrantTitle: "Grant to Address",
    modalManageTitle: "Manage Address Roles",
    modalSubtitle: "Check roles to grant; unchecked roles will be revoked",
    modalAddressLabel: "Address",
    modalAddressPlaceholder: "0x... or .eth",
    modalRolesLabel: "Roles to grant",
    modalConfirm: "Confirm",
    modalCancel: "Cancel",
    modalClose: "Close",
    noMatching: "No matching holders",
    chainHead: "Chain head",
    fromBlock: "From block",
    holderCount: "holders",
    totalHolders: "{n} holders",
  },
};

/* ─────────────────────────── utils ─────────────────────────── */

const ALL_ROLES: SuperAdminRoleKey[] = ["superAdmin", "admin", "operator"];

function shorten(addr: `0x${string}` | undefined): string {
  if (!addr) return "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function formatLastChanged(ts: string | undefined, locale: string): string {
  const n = Number(ts ?? 0);
  if (!Number.isFinite(n) || n <= 0) return "—";
  return new Date(n * 1000).toLocaleString(locale === "zh" ? "zh-CN" : "en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function roleBadgePalette(tone: SuperAdminRoleKey): string {
  return tone === "superAdmin"
    ? "from-violet-500/30 to-fuchsia-500/30 border-violet-400/40 text-violet-100"
    : tone === "operator"
      ? "from-cyan-500/30 to-sky-500/30 border-cyan-400/40 text-cyan-100"
      : "from-indigo-500/30 to-blue-500/30 border-indigo-400/40 text-indigo-100";
}

function roleLabel(role: SuperAdminRoleKey, copy: Copy): string {
  return role === "superAdmin"
    ? copy.defaultAdminRole.split(" · ")[1] ?? role
    : role === "admin"
      ? copy.adminRole.split(" · ")[1] ?? role
      : copy.operatorRole.split(" · ")[1] ?? role;
}

/* ─────────────────────────── small UI ─────────────────────────── */

function RoleBadge({
  role,
  active = true,
  label,
}: {
  role: SuperAdminRoleKey;
  active?: boolean;
  label?: string;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full border bg-gradient-to-r px-2.5 py-0.5 text-[11px] font-medium tracking-wide transition",
        roleBadgePalette(role),
        !active && "opacity-40 grayscale",
      )}
    >
      <span
        className={clsx(
          "inline-block size-1.5 rounded-full",
          active ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" : "bg-zinc-600",
        )}
      />
      {label ?? role}
    </span>
  );
}

function StatCard({
  eyebrow,
  label,
  value,
  accent = "violet",
  hint,
}: {
  eyebrow?: string;
  label: string;
  value: React.ReactNode;
  accent?: "violet" | "cyan" | "indigo" | "amber" | "emerald";
  hint?: string;
}) {
  const accents: Record<string, string> = {
    violet: "from-violet-500/10 to-violet-500/0 border-violet-500/20 text-violet-200",
    cyan: "from-cyan-500/10 to-cyan-500/0 border-cyan-500/20 text-cyan-200",
    indigo: "from-indigo-500/10 to-indigo-500/0 border-indigo-500/20 text-indigo-200",
    amber: "from-amber-500/10 to-amber-500/0 border-amber-500/20 text-amber-200",
    emerald: "from-emerald-500/10 to-emerald-500/0 border-emerald-500/20 text-emerald-200",
  };
  return (
    <div
      className={clsx(
        "relative overflow-hidden rounded-2xl border bg-gradient-to-br p-4 transition hover:border-white/20 sm:p-5",
        accents[accent],
      )}
    >
      {eyebrow ? (
        <div className="mb-1.5 font-mono text-[10px] tracking-[0.3em] text-zinc-400 uppercase">
          {eyebrow}
        </div>
      ) : null}
      <div className="text-xs text-zinc-400">{label}</div>
      <div className="mt-1 truncate font-mono text-sm font-semibold text-zinc-50 sm:text-base">
        {value}
      </div>
      {hint ? <div className="mt-1 text-[11px] text-zinc-500">{hint}</div> : null}
    </div>
  );
}

function SkeletonRow() {
  return (
    <tr className="animate-pulse border-b border-violet-500/10">
      <td className="py-3 pr-4">
        <div className="h-3.5 w-28 rounded bg-violet-500/10" />
      </td>
      <td className="py-3 pr-4">
        <div className="flex gap-1.5">
          <div className="h-5 w-16 rounded-full bg-violet-500/10" />
          <div className="h-5 w-16 rounded-full bg-violet-500/10" />
        </div>
      </td>
      <td className="py-3 pr-4">
        <div className="h-3.5 w-24 rounded bg-violet-500/10" />
      </td>
      <td className="py-3">
        <div className="h-6 w-16 rounded bg-violet-500/10" />
      </td>
    </tr>
  );
}

/* ─────────────────────────── modal ─────────────────────────── */

type ModalProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  subtitle?: string;
  confirmLabel: string;
  busy: boolean;
  txState: TxState;
  children: React.ReactNode;
};

function Modal({
  open,
  onClose,
  onConfirm,
  title,
  subtitle,
  confirmLabel,
  busy,
  txState,
  children,
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-md transition-opacity"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl border border-violet-500/30 bg-gradient-to-b from-[#0b1024] to-[#0e1536] shadow-[0_20px_60px_rgba(0,0,0,0.6)]">
        <div className="border-b border-violet-500/20 px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="mb-1 font-mono text-[10px] tracking-[0.3em] text-violet-300/70 uppercase">
                Super Admin
              </div>
              <h3 className="text-base font-semibold text-zinc-50">{title}</h3>
              {subtitle ? <p className="mt-1 text-xs text-zinc-400">{subtitle}</p> : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-md border border-violet-500/20 p-1.5 text-zinc-400 transition hover:bg-violet-500/10 hover:text-zinc-100"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M1 1 L11 11 M1 11 L11 1" />
              </svg>
            </button>
          </div>
        </div>
        <div className="px-6 py-5">{children}</div>
        <div className="flex items-center justify-between gap-3 border-t border-violet-500/15 bg-zinc-950/40 px-6 py-3">
          <div className="min-w-0 text-xs text-zinc-500">
            {busy ? "…" : txState === "confirmed" ? (
              <span className="text-emerald-300">Confirmed ✓</span>
            ) : txState === "failed" ? (
              <span className="text-rose-300">Transaction failed</span>
            ) : null}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-lg border border-violet-500/20 bg-transparent px-4 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-violet-500/10 disabled:opacity-50"
            >
              {txState === "confirmed" ? confirmLabel : "Cancel"}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={busy || txState === "confirmed"}
              className={clsx(
                "rounded-lg px-4 py-1.5 text-xs font-medium text-white transition",
                "bg-gradient-to-r from-violet-500 to-indigo-500 hover:from-violet-400 hover:to-indigo-400",
                "disabled:cursor-not-allowed disabled:opacity-50",
              )}
            >
              {busy ? "Confirming…" : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── holders table ─────────────────────────── */

type HolderRowProps = {
  holder: RoleHolderEntry;
  isMe: boolean;
  canManage: boolean;
  chainId: number;
  locale: string;
  onManage: (entry: RoleHolderEntry) => void;
  copy: Copy;
};

function HolderRow({ holder, isMe, canManage, chainId, locale, onManage, copy }: HolderRowProps) {
  const explorerUrl = getAddressExplorerUrl(chainId, holder.address);

  return (
    <tr className="group border-b border-violet-500/10 transition last:border-0 hover:bg-violet-500/5">
      <td className="py-3 pr-4 align-top">
        <div className="flex items-center gap-2">
          <code className="font-mono text-xs text-zinc-100 sm:text-sm">{shorten(holder.address)}</code>
          {isMe ? (
            <span className="rounded-full bg-cyan-500/15 px-1.5 py-0.5 text-[10px] font-medium text-cyan-200">
              {copy.you}
            </span>
          ) : null}
          {explorerUrl ? (
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-500 opacity-0 transition group-hover:opacity-100 hover:text-violet-300"
              title={holder.address}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2">
                <path d="M3 1h6v6M9 1L3 7" />
              </svg>
            </a>
          ) : null}
        </div>
        <div className="mt-0.5 truncate font-mono text-[10px] text-zinc-500">{holder.address}</div>
      </td>
      <td className="py-3 pr-4 align-top">
        <div className="flex flex-wrap gap-1">
          {holder.roles.map((r) => (
            <RoleBadge key={r} role={r} label={roleLabel(r, copy)} />
          ))}
        </div>
      </td>
      <td className="py-3 pr-4 align-top">
        <div className="font-mono text-xs text-zinc-400">
          {formatLastChanged(holder.lastChangedAt, locale)}
        </div>
        <div className="mt-0.5 font-mono text-[10px] text-zinc-600">#{holder.lastChangedBlock}</div>
      </td>
      <td className="py-3 align-top text-right">
        {canManage ? (
          <button
            type="button"
            onClick={() => onManage(holder)}
            className="inline-flex items-center gap-1 rounded-md border border-violet-500/20 bg-violet-500/5 px-2.5 py-1 text-[11px] font-medium text-violet-200 transition hover:bg-violet-500/15"
          >
            {copy.roleManage}
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.2">
              <path d="M2 1l4 3-4 3z" />
            </svg>
          </button>
        ) : (
          <span className="font-mono text-[10px] text-zinc-600">—</span>
        )}
      </td>
    </tr>
  );
}

/* ─────────────────────────── main ─────────────────────────── */

export function ConsoleSuperAdminPage() {
  const locale = useLocaleStore((s) => s.locale);
  const copy = COPY[locale];
  const { address: walletAddress, isConnected } = useAccount();
  const chainId = useChainId();

  const me = useSuperAdminRoles();
  const rolesQuery = useSuperAdminRolesList();

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<SuperAdminRoleKey | "all">("all");

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"grant" | "manage">("grant");
  const [modalAddress, setModalAddress] = useState<`0x${string}` | "">("");
  const [modalAddressInput, setModalAddressInput] = useState("");
  const [modalAddressError, setModalAddressError] = useState<string | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<Record<SuperAdminRoleKey, boolean>>({
    superAdmin: false,
    admin: true,
    operator: true,
  });

  const { writeContractAsync } = useWriteContract();
  const adminFlow = useWriteWithStatus();
  const operatorFlow = useWriteWithStatus();

  // 登录态：session 绑定的地址必须有 DEFAULT_ADMIN_ROLE 才能执行管理操作。
  const auth = useSignedInAdmin();
  const isSignedIn = auth.isSignedIn;
  const canManage = auth.canManage;

  // 数据刷新后重置模态框状态
  useEffect(() => {
    if (adminFlow.state === "confirmed" || operatorFlow.state === "confirmed") {
      void rolesQuery.refetch();
      void me.refetch();
    }
  }, [adminFlow.state, operatorFlow.state, me, rolesQuery]);

  const filteredHolders = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (rolesQuery.data?.holders ?? []).filter((h) => {
      if (filter !== "all" && !h.roles.includes(filter)) return false;
      if (!q) return true;
      return h.address.toLowerCase().includes(q);
    });
  }, [rolesQuery.data?.holders, search, filter]);

  const counts = rolesQuery.data?.counts ?? { superAdmin: 0, admin: 0, operator: 0 };
  const isLoading = rolesQuery.isLoading;
  const snapshot = rolesQuery.data;

  const openGrantModal = useCallback(() => {
    setModalMode("grant");
    setModalAddress("");
    setModalAddressInput("");
    setModalAddressError(null);
    setSelectedRoles({ superAdmin: false, admin: true, operator: true });
    setModalOpen(true);
  }, []);

  const openManageModal = useCallback(
    (entry: RoleHolderEntry) => {
      if (!canManage) return;
      setModalMode("manage");
      setModalAddress(entry.address);
      setModalAddressInput(entry.address);
      setModalAddressError(null);
      setSelectedRoles({
        superAdmin: entry.roles.includes("superAdmin"),
        admin: entry.roles.includes("admin"),
        operator: entry.roles.includes("operator"),
      });
      setModalOpen(true);
    },
    [canManage],
  );

  const closeModal = useCallback(() => {
    if (adminFlow.state !== "idle" || operatorFlow.state !== "idle") return;
    setModalOpen(false);
  }, [adminFlow.state, operatorFlow.state]);

  const resolveModalAddress = useCallback((): `0x${string}` | null => {
    const v = modalAddressInput.trim();
    if (!isAddress(v)) {
      setModalAddressError(copy.invalidAddress);
      return null;
    }
    setModalAddressError(null);
    setModalAddress(v as `0x${string}`);
    return v as `0x${string}`;
  }, [modalAddressInput, copy.invalidAddress]);

  const applyRoleUpdates = useCallback(async () => {
    const target = modalMode === "manage" ? modalAddress : resolveModalAddress();
    if (!target) return;

    const existing = rolesQuery.data?.holders.find(
      (h) => h.address.toLowerCase() === (modalMode === "manage" ? modalAddress.toLowerCase() : (target as `0x${string}`).toLowerCase()),
    );
    const existingRoles = existing?.roles ?? [];

    for (const r of ["admin", "operator"] as const) {
      const want = selectedRoles[r];
      const has = existingRoles.includes(r);
      if (want === has) continue;
      const fn = r === "admin" ? "setAdmin" : "setOperator";
      const flow = r === "admin" ? adminFlow : operatorFlow;
      try {
        await flow.executeWrite(
          {
            actionLabel: `${fn}(${shorten(target)}, ${want})`,
            txType: "super-admin",
          },
          () =>
            writeContractAsync({
              address: me.address,
              abi: dualPoolSuperAdminAbi,
              functionName: fn,
              args: [target as `0x${string}`, want],
            }),
        );
      } catch {
        /* 已被 flow 捕获 */
      }
    }
  }, [
    modalMode, modalAddress, selectedRoles,
    rolesQuery.data?.holders, adminFlow, operatorFlow, writeContractAsync, me.address,
    resolveModalAddress,
  ]);

  const modalBusy = isTxBusy(adminFlow.state) || isTxBusy(operatorFlow.state);
  const modalTx: TxState =
    adminFlow.state !== "idle" ? adminFlow.state : operatorFlow.state;

  return (
    <div className="sa-page relative min-h-[calc(100vh-6rem)]">
      {/* 背景光晕 */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[28rem] opacity-70"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(139, 92, 246, 0.18), transparent 70%), radial-gradient(ellipse 60% 40% at 80% 0%, rgba(34, 211, 238, 0.08), transparent 60%)",
        }}
      />

      {/* Hero */}
      <div className="mb-6 sm:mb-8">
        <div className="mb-2 font-mono text-[11px] tracking-[0.35em] text-violet-300/80 uppercase">
          {copy.eyebrow}
        </div>
        <h1 className="bg-gradient-to-r from-white via-violet-100 to-cyan-100 bg-clip-text text-2xl font-semibold tracking-tight text-transparent sm:text-3xl">
          {copy.title}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-zinc-400 sm:text-base">{copy.subtitle}</p>
      </div>

      {/* KPI 条 */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard
          accent="violet"
          label={copy.contract}
          value={shorten(me.address)}
          hint={me.address}
          eyebrow="Contract"
        />
        <StatCard
          accent="amber"
          label={copy.owner}
          value={shorten(me.owner)}
          hint={me.owner}
          eyebrow="Ownable"
        />
        <StatCard
          accent="violet"
          label={copy.filterSuper}
          value={isLoading ? "…" : counts.superAdmin}
          hint={copy.holderCount}
          eyebrow="DEFAULT_ADMIN"
        />
        <StatCard
          accent="indigo"
          label={copy.filterAdmin}
          value={isLoading ? "…" : counts.admin}
          hint={copy.holderCount}
          eyebrow="ADMIN"
        />
        <StatCard
          accent="cyan"
          label={copy.filterOperator}
          value={isLoading ? "…" : counts.operator}
          hint={copy.holderCount}
          eyebrow="OPERATOR"
        />
      </div>

      {/* 我的角色 + 合约状态 */}
      <div className="mb-4 grid gap-3 lg:grid-cols-2">
        <section className="group relative overflow-hidden rounded-2xl border border-violet-500/15 bg-gradient-to-br from-[#0b1024]/90 to-[#0e1536]/90 p-5 shadow-[0_8px_32px_rgba(0,0,0,0.3)]">
          <div className="mb-1.5 font-mono text-[10px] tracking-[0.3em] text-violet-300/70 uppercase">Auth & Wallet</div>
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-zinc-50 sm:text-base">{copy.yourRole}</h2>
              <p className="mt-1 text-xs text-zinc-500">{copy.yourRoleHint}</p>
            </div>
            <AuthControls locale={locale === "zh" ? "zh" : "en"} compact />
          </div>
          {!isConnected ? (
            <div className="flex flex-col items-start gap-3">
              <p className="text-xs text-zinc-400">{copy.connectWalletHint}</p>
              <BrandedWalletButton variant="console" />
            </div>
          ) : !me.configured ? (
            <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-3 text-xs text-rose-300">
              {copy.notConfigured}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {ALL_ROLES.map((r) => {
                  const active =
                    r === "superAdmin" ? me.isDefaultAdmin : r === "admin" ? me.isAdmin : me.isOperator;
                  return <RoleBadge key={r} role={r} active={active} label={roleLabel(r, copy)} />;
                })}
                <button
                  type="button"
                  onClick={() => void me.refetch()}
                  className="ml-auto inline-flex items-center gap-1 rounded-md border border-violet-500/20 px-2 py-1 text-[11px] text-violet-200 transition hover:bg-violet-500/10"
                >
                  ↻ {copy.refresh}
                </button>
              </div>
              {isConnected && !isSignedIn ? (
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-200">
                  钱包已连接，但尚未登录。登录以启用角色管理操作。
                </div>
              ) : isSignedIn && !canManage ? (
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-200">
                  已登录地址没有 DEFAULT_ADMIN_ROLE，无法执行角色管理。
                </div>
              ) : null}
            </div>
          )}
        </section>

        <section className="group relative overflow-hidden rounded-2xl border border-violet-500/15 bg-gradient-to-br from-[#0b1024]/90 to-[#0e1536]/90 p-5 shadow-[0_8px_32px_rgba(0,0,0,0.3)]">
          <div className="mb-1.5 font-mono text-[10px] tracking-[0.3em] text-violet-300/70 uppercase">Indexer</div>
          <div className="mb-3">
            <h2 className="text-sm font-semibold text-zinc-50 sm:text-base">Indexer Status</h2>
            <p className="mt-1 text-xs text-zinc-500">链上事件索引状态</p>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-400">{copy.chainHead}</span>
              <code className="font-mono text-xs text-zinc-200">
                {snapshot?.headBlockNumber ? Number(snapshot.headBlockNumber).toLocaleString() : "—"}
              </code>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-400">{copy.fromBlock}</span>
              <code className="font-mono text-xs text-zinc-200">
                {snapshot?.fromBlock ? Number(snapshot.fromBlock).toLocaleString() : "—"}
              </code>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-400">{copy.holderCount}</span>
              <code className="font-mono text-xs text-zinc-200">
                {isLoading ? "…" : (snapshot?.holders.length ?? 0)}
              </code>
            </div>
          </div>
        </section>
      </div>

      {/* 主表格 */}
      <section className="overflow-hidden rounded-2xl border border-violet-500/15 bg-gradient-to-br from-[#0b1024]/90 to-[#0e1536]/90 shadow-[0_8px_32px_rgba(0,0,0,0.3)]">
        {/* 表头工具栏 */}
        <div className="flex flex-col gap-3 border-b border-violet-500/15 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:p-5">
          <div>
            <div className="mb-1 font-mono text-[10px] tracking-[0.3em] text-violet-300/70 uppercase">Holders</div>
            <h2 className="text-base font-semibold text-zinc-50">{copy.holdersTitle}</h2>
            <p className="mt-1 text-xs text-zinc-500">{copy.holdersSubtitle}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex min-w-0 items-center gap-2 rounded-lg border border-violet-500/20 bg-zinc-950/60 px-2.5 py-1.5 transition focus-within:border-violet-400/60 focus-within:ring-2 focus-within:ring-violet-500/20 sm:min-w-[18rem]">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" className="shrink-0 text-zinc-500">
                <circle cx="5" cy="5" r="3.5" />
                <path d="M7.5 7.5L10.5 10.5" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={copy.searchPlaceholder}
                spellCheck={false}
                className="w-full min-w-0 bg-transparent font-mono text-xs text-zinc-100 placeholder-zinc-600 outline-none"
              />
            </div>
            {canManage ? (
              <button
                type="button"
                onClick={openGrantModal}
                className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-violet-500 to-indigo-500 px-3 py-1.5 text-xs font-medium text-white shadow-[0_0_0_1px_rgba(139,92,246,0.3)] transition hover:from-violet-400 hover:to-indigo-400"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M5 1v8M1 5h8" />
                </svg>
                {copy.grantNew}
              </button>
            ) : null}
          </div>
        </div>

        {/* 筛选条 */}
        <div className="flex flex-wrap items-center gap-1.5 border-b border-violet-500/10 bg-zinc-950/30 px-4 py-2.5">
          {(["all", "superAdmin", "admin", "operator"] as const).map((f) => {
            const label = f === "all" ? copy.filterAll : roleLabel(f as SuperAdminRoleKey, copy);
            const count = f === "all" ? (snapshot?.holders.length ?? 0) : counts[f];
            const active = filter === f;
            return (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={clsx(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition",
                  active
                    ? "border-violet-400/50 bg-violet-500/15 text-violet-100"
                    : "border-violet-500/15 text-zinc-500 hover:border-violet-500/30 hover:text-zinc-300",
                )}
              >
                {label}
                <span
                  className={clsx(
                    "rounded-full px-1.5 text-[10px]",
                    active ? "bg-violet-400/20 text-violet-100" : "bg-zinc-700/30 text-zinc-500",
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
          <div className="ml-auto font-mono text-[10px] text-zinc-500">
            {copy.totalHolders.replace("{n}", String(filteredHolders.length))}
          </div>
        </div>

        {/* 表体 */}
        {!me.configured ? (
          <div className="p-8 text-center text-sm text-rose-300">
            <div className="mb-1 font-mono text-[10px] tracking-[0.3em] text-rose-400/70 uppercase">Not configured</div>
            {copy.notConfiguredHint}
          </div>
        ) : isLoading ? (
          <table className="w-full">
            <tbody>
              {Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)}
            </tbody>
          </table>
        ) : snapshot?.error ? (
          <div className="p-8 text-center text-sm text-rose-300">
            <div className="mb-1 font-mono text-[10px] tracking-[0.3em] text-rose-400/70 uppercase">Error</div>
            {snapshot.error}
          </div>
        ) : filteredHolders.length === 0 ? (
          <div className="p-8 text-center">
            <div className="mb-1 font-mono text-[10px] tracking-[0.3em] text-violet-300/70 uppercase">
              {(snapshot?.holders.length ?? 0) === 0 ? "Empty" : "No match"}
            </div>
            <div className="text-sm text-zinc-300">
              {(snapshot?.holders.length ?? 0) === 0 ? copy.emptyTitle : copy.noMatching}
            </div>
            <div className="mt-1 text-xs text-zinc-500">
              {(snapshot?.holders.length ?? 0) === 0 ? copy.emptyHint : ""}
            </div>
          </div>
        ) : (
          <div className="max-h-[36rem] overflow-auto">
            <table className="w-full">
              <thead className="sticky top-0 z-[1] bg-zinc-950/90 backdrop-blur">
                <tr className="border-b border-violet-500/20 text-left font-mono text-[10px] tracking-[0.2em] text-zinc-500 uppercase">
                  <th className="px-4 py-2 font-normal sm:px-5">{copy.address}</th>
                  <th className="px-4 py-2 font-normal sm:px-5">{copy.roles}</th>
                  <th className="px-4 py-2 font-normal sm:px-5">{copy.lastChanged}</th>
                  <th className="px-4 py-2 text-right font-normal sm:px-5">{copy.actions}</th>
                </tr>
              </thead>
              <tbody>
                {filteredHolders.map((h) => (
                  <HolderRow
                    key={h.address}
                    holder={h}
                    isMe={
                      Boolean(walletAddress && h.address.toLowerCase() === walletAddress.toLowerCase()) ||
                      Boolean(auth.session?.address && h.address.toLowerCase() === auth.session.address.toLowerCase())
                    }
                    canManage={canManage}
                    chainId={chainId}
                    locale={locale}
                    onManage={openManageModal}
                    copy={copy}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 安全提示 */}
      <div className="mt-6 rounded-xl border border-violet-500/10 bg-zinc-950/30 p-4 text-xs text-zinc-500">
        <p className="font-mono tracking-wide text-violet-300/60 uppercase">Security Notice</p>
        <p className="mt-2 leading-relaxed">
          <code className="rounded bg-zinc-900 px-1.5 py-0.5 font-mono text-zinc-300">DEFAULT_ADMIN_ROLE</code>{" "}
          is held by the deployer. It is the only role that can grant or revoke other roles. Store the
          super-admin key offline after initial setup.
        </p>
      </div>

      {/* 模态框 */}
      <Modal
        open={modalOpen}
        onClose={closeModal}
        onConfirm={applyRoleUpdates}
        title={modalMode === "grant" ? copy.modalGrantTitle : copy.modalManageTitle}
        subtitle={copy.modalSubtitle}
        confirmLabel={copy.modalConfirm}
        busy={modalBusy}
        txState={modalTx}
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-[11px] font-medium text-zinc-400">
              {copy.modalAddressLabel}
            </label>
            <input
              type="text"
              value={modalAddressInput}
              onChange={(e) => {
                setModalAddressInput(e.target.value);
                setModalAddressError(null);
              }}
              disabled={modalMode === "manage" || modalBusy}
              placeholder={copy.modalAddressPlaceholder}
              spellCheck={false}
              className="w-full rounded-lg border border-violet-500/20 bg-zinc-950/60 px-3 py-2 font-mono text-xs text-zinc-100 placeholder-zinc-600 outline-none transition focus:border-violet-400/60 focus:ring-2 focus:ring-violet-500/20 disabled:opacity-60"
            />
            {modalAddressError ? (
              <p className="mt-1 text-[11px] text-rose-400">{modalAddressError}</p>
            ) : null}
          </div>

          <div>
            <label className="mb-2 block text-[11px] font-medium text-zinc-400">
              {copy.modalRolesLabel}
            </label>
            <div className="space-y-2">
              {(["admin", "operator"] as const).map((r) => (
                <label
                  key={r}
                  className={clsx(
                    "flex cursor-pointer items-center justify-between gap-3 rounded-xl border bg-zinc-950/40 p-3 transition",
                    selectedRoles[r]
                      ? "border-violet-400/40 bg-violet-500/5"
                      : "border-violet-500/10 hover:border-violet-500/20",
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={selectedRoles[r]}
                      onChange={(e) =>
                        setSelectedRoles((s) => ({ ...s, [r]: e.target.checked }))
                      }
                      disabled={modalBusy}
                      className="size-3.5 accent-violet-500"
                    />
                    <RoleBadge role={r} label={roleLabel(r, copy)} />
                  </div>
                  <span className="font-mono text-[10px] text-zinc-500">
                    {r === "admin" ? "setAdmin" : "setOperator"}
                  </span>
                </label>
              ))}
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/15 bg-amber-500/5 p-2.5 text-[11px] text-amber-200/90">
                <span>ⓘ</span>
                <span>
                  DEFAULT_ADMIN_ROLE 只能在此页面上通过 <code className="font-mono text-amber-100">transferSuperAdmin</code> 转移，不能通过此模态框授予。
                </span>
              </div>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
