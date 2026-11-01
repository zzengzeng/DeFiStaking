/**
 * 基于内存的 nonce 存储 + 已用 nonce 防重放集合。
 *
 * - 生成 nonce：客户端先请求 nonce（可选），服务端记录
 * - 已用 nonce：成功验证后登记，TTL 内重复使用会被拒绝
 * - 过期清理：每次写入时顺便清理超时条目（lazy sweep）
 *
 * 适用于开发 / demo 环境。生产部署请替换为 Redis 或类似后端。
 */

const NONCE_TTL_MS = 10 * 60 * 1000; // 10 分钟（签发到验证之间的最大时间窗口）
const USED_NONCE_TTL_MS = 60 * 60 * 1000; // 已用 nonce 保留 1 小时用于防重放

/** 已签发但尚未使用的 nonce → 过期时间 */
const issued = new Map<string, number>();
/** 已消耗的 nonce → 过期时间 */
const used = new Map<string, number>();

function sweep() {
  const now = Date.now();
  for (const [k, t] of issued) if (t < now) issued.delete(k);
  for (const [k, t] of used) if (t < now) used.delete(k);
}

/** 生成并登记一个新 nonce（供客户端请求）。 */
export function generateNonce(): string {
  sweep();
  const n = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  issued.set(n, Date.now() + NONCE_TTL_MS);
  return n;
}

/** 验证 nonce 是否有效（已签发且未使用）；验证通过后标记为已用。 */
export function consumeNonce(nonce: string): boolean {
  sweep();
  const exp = issued.get(nonce);
  if (!exp) return false;
  if (exp < Date.now()) {
    issued.delete(nonce);
    return false;
  }
  issued.delete(nonce);
  used.set(nonce, Date.now() + USED_NONCE_TTL_MS);
  return true;
}

/** nonce 是否已被使用过（即使未预先签发，只要在 used 集合里也算）。 */
export function isNonceUsed(nonce: string): boolean {
  sweep();
  return used.has(nonce);
}
