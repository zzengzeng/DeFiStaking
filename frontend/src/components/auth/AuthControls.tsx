"use client";

import { useCallback, useState } from "react";
import { useAccount, useChainId, useWalletClient } from "wagmi";

import { useAuthSession, useAuthSessionInvalidate } from "@/hooks/useAuthSession";
import { useSuperAdminRoles } from "@/hooks/useSuperAdminRoles";
import { SIWE_CONFIG } from "@/lib/auth/siwe";
import clsx from "clsx";

import { BrandedWalletButton } from "../ConnectWalletButton";

type Copy = {
  signIn: string;
  signingIn: string;
  signOut: string;
  signingOut: string;
  signedInAs: string;
  connectWallet: string;
  connectHint: string;
  signInHint: string;
  error: (msg: string) => string;
  noDefaultAdmin: string;
};

const COPY = {
  zh: {
    signIn: "登录",
    signingIn: "签名中…",
    signOut: "退出",
    signingOut: "退出中…",
    signedInAs: "已登录",
    connectWallet: "连接钱包",
    connectHint: "先连接钱包，再用钱包签名登录",
    signInHint: "用你的钱包签名登录",
    error: (msg: string) => `登录失败：${msg}`,
    noDefaultAdmin: "当前钱包没有超级管理员权限",
  },
  en: {
    signIn: "Sign in",
    signingIn: "Signing…",
    signOut: "Sign out",
    signingOut: "Signing out…",
    signedInAs: "Signed in as",
    connectWallet: "Connect wallet",
    connectHint: "Connect your wallet first, then sign in",
    signInHint: "Sign in with your wallet",
    error: (msg: string) => `Sign in failed: ${msg}`,
    noDefaultAdmin: "Wallet lacks super admin privileges",
  },
} as const;

type Locale = keyof typeof COPY;

export type AuthControlsProps = {
  locale?: Locale;
  /** 当未登录时是否显示钱包连接按钮（默认 true） */
  showConnectButton?: boolean;
  /** 紧凑模式：只显示按钮，不显示文字 hint */
  compact?: boolean;
};

function shorten(addr: `0x${string}`): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/**
 * 登录控件：未连接 → 钱包按钮；已连接未登录 → 签名登录；已登录 → 已登录地址 + 登出。
 *
 * 同时暴露 `isSignedIn` / `session` / `signIn` / `signOut`，供父组件根据状态渲染。
 */
export function AuthControls({
  locale = "zh",
  showConnectButton = true,
  compact = false,
}: AuthControlsProps) {
  const copy = COPY[locale];
  const { address: walletAddress, isConnected } = useAccount();
  const chainId = useChainId();
  const { data: walletClient } = useWalletClient();
  const sessionQuery = useAuthSession();
  const invalidate = useAuthSessionInvalidate();

  const [signInStatus, setSignInStatus] = useState<"idle" | "pending" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [signOutStatus, setSignOutStatus] = useState<"idle" | "pending">("idle");

  const session = sessionQuery.data ?? { address: null, iat: null, lat: null };
  const isSignedIn = Boolean(session.address);

  const signIn = useCallback(async () => {
    if (!walletAddress || !isConnected || !walletClient) return;
    setSignInStatus("pending");
    setErrorMsg(null);
    try {
      // 1. 拿 nonce（可选，但让服务端知道该 nonce）
      const nonceRes = await fetch("/api/auth/nonce", { cache: "no-store" });
      const { nonce } = (await nonceRes.json()) as { nonce: string };

      // 2. 构造 SIWE 消息
      if (!chainId) throw new Error("请先在钱包中选择网络");
      const msg = new (await import("siwe")).SiweMessage({
        domain: SIWE_CONFIG.domain,
        address: walletAddress,
        statement: SIWE_CONFIG.statement,
        uri: SIWE_CONFIG.uri,
        version: SIWE_CONFIG.version,
        chainId,
        nonce,
        issuedAt: new Date().toISOString(),
        expirationTime: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      });
      const message = msg.prepareMessage();
      console.debug("[AuthControls] SIWE message:", message);

      // 3. 钱包签名 —— 优先走 walletClient；若 MetaMask SDK 层崩溃，兜底直连 window.ethereum
      let signature: `0x${string}`;
      try {
        signature = await walletClient.signMessage({ message, account: walletAddress });
      } catch (err) {
        const isMetaMaskCrash = /Cannot read properties of null/i.test(String(err));
        if (!isMetaMaskCrash) throw err;
        console.warn("[AuthControls] walletClient.signMessage failed, falling back to window.ethereum");
        const eth = (window as Window & { ethereum?: { request: (args: { method: string; params: unknown[] }) => Promise<string> } }).ethereum;
        if (!eth) throw new Error("找不到注入的以太坊钱包，请安装 MetaMask");
        // 把消息转成 0x 前缀的 hex，personal_sign 要求 hex 格式
        const hex = "0x" + Buffer.from(message, "utf8").toString("hex");
        signature = (await eth.request({
          method: "personal_sign",
          params: [hex, walletAddress],
        })) as `0x${string}`;
      }
      console.debug("[AuthControls] signature:", signature);

      // 4. 提交验证
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, signature }),
      });
      const body = (await res.json()) as { ok: boolean; address?: string; error?: string };
      if (!res.ok || !body.ok) {
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setSignInStatus("idle");
      await invalidate();
    } catch (e) {
      console.error("[AuthControls] signIn failed:", e);
      setSignInStatus("error");
      const errMsg = e instanceof Error ? e.message : String(e);
      // MetaMask 扩展自身崩溃时，给一个可操作的提示
      const hint = /Cannot read properties of null|MetaMask/i.test(errMsg)
        ? "MetaMask 弹框崩溃。请关闭弹框后重试；若仍失败，重启浏览器或更新 MetaMask。"
        : errMsg;
      setErrorMsg(hint);
    }
  }, [walletAddress, isConnected, chainId, walletClient, invalidate]);

  const signOut = useCallback(async () => {
    setSignOutStatus("pending");
    try {
      await fetch("/api/auth/logout", { method: "DELETE" });
      await invalidate();
    } finally {
      setSignOutStatus("idle");
    }
  }, [invalidate]);

  if (!isConnected || !walletAddress) {
    return (
      <div className="flex flex-col items-start gap-2">
        {showConnectButton ? <BrandedWalletButton variant="console" /> : null}
        {!compact ? <p className="text-xs text-zinc-400">{copy.connectHint}</p> : null}
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="flex flex-col items-start gap-2">
        <button
          type="button"
          onClick={signIn}
          disabled={signInStatus === "pending"}
          className={clsx(
            "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white transition",
            "bg-gradient-to-r from-violet-500 to-indigo-500 hover:from-violet-400 hover:to-indigo-400",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          {signInStatus === "pending" ? (
            <>
              <svg width="10" height="10" viewBox="0 0 10 10" className="animate-spin">
                <circle cx="5" cy="5" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeDasharray="16" strokeDashoffset="8" />
              </svg>
              {copy.signingIn}
            </>
          ) : (
            <>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2">
                <path d="M5 1v5M3 4l2 2 2-2M2 9h6" />
              </svg>
              {copy.signIn}
            </>
          )}
        </button>
        {!compact ? <p className="text-xs text-zinc-400">{copy.signInHint}</p> : null}
        {signInStatus === "error" && errorMsg ? (
          <p className="text-[11px] text-rose-400">{copy.error(errorMsg)}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-200">
        <span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
        <span className="text-zinc-400">{copy.signedInAs}</span>
        <code className="font-mono text-emerald-100">{shorten(session.address as `0x${string}`)}</code>
      </div>
      <button
        type="button"
        onClick={signOut}
        disabled={signOutStatus === "pending"}
        className="inline-flex items-center gap-1 rounded-md border border-violet-500/20 bg-violet-500/5 px-2 py-1 text-[11px] text-zinc-400 transition hover:bg-violet-500/10 hover:text-zinc-200 disabled:opacity-50"
      >
        {signOutStatus === "pending" ? copy.signingOut : copy.signOut}
      </button>
    </div>
  );
}

/**
 * 判断当前登录的 session address 是否拥有 DEFAULT_ADMIN_ROLE。
 * 未登录或没有该角色时返回 `false`。
 */
export function useSignedInAdmin() {
  const session = useAuthSession();
  const roles = useSuperAdminRoles({ target: session.data?.address ?? undefined });
  const isSignedIn = Boolean(session.data?.address);
  const canManage = isSignedIn && roles.isDefaultAdmin;
  return { session: session.data, isSignedIn, canManage, roles };
}
