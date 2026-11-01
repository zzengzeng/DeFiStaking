import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";

/** Session 结构 */
export type SessionData = {
  /** 已验证的钱包地址（checksum） */
  address?: `0x${string}`;
  /** 会话签发时间（Unix 秒） */
  iat?: number;
  /** 最后一次活动（Unix 秒） */
  lat?: number;
};

const DEFAULT_PASSWORD = "change_me_in_env_at_least_32_characters_long!!";

/** iron-session 配置。 */
export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET ?? DEFAULT_PASSWORD,
  cookieName: "super-admin-session",
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24, // 1 天
    path: "/",
  },
};

/** 获取当前请求的 session（Next.js App Router 用法：通过 cookies()）。 */
export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions);
}

/** 销毁当前 session。 */
export async function destroySession() {
  const session = await getSession();
  session.destroy();
}
