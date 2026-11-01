"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";

/** Session 数据 */
export type AuthSession = {
  address: `0x${string}` | null;
  iat: number | null;
  lat: number | null;
};

const QUERY_KEY = ["auth-session"] as const;

/** 获取当前登录 session（轮询 / 缓存由 React Query 控制）。 */
export function useAuthSession() {
  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async (): Promise<AuthSession> => {
      const res = await fetch("/api/auth/session", { cache: "no-store" });
      if (!res.ok) return { address: null, iat: null, lat: null };
      const data = await res.json();
      return {
        address: (data.address as `0x${string}` | null) ?? null,
        iat: (data.iat as number | null) ?? null,
        lat: (data.lat as number | null) ?? null,
      };
    },
    refetchInterval: 30_000,
    staleTime: 10_000,
  });
  return query;
}

/** 手动触发 session 刷新（登录 / 登出后调用）。 */
export function useAuthSessionInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: QUERY_KEY });
}
