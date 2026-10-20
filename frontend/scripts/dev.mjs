#!/usr/bin/env node
/**
 * 单实例 Next 开发服：固定端口、占用即失败（禁止静默换端口导致静态资源 404）。
 *
 * 用法:
 *   pnpm dev          # 默认 3000
 *   pnpm dev:clean    # 清 .next 后启动
 *   pnpm dev:stop     # 停止 3000–3005 上的残留进程
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, "..");
const port = Number(process.env.PORT || 3000);
const clean = process.argv.includes("--clean");

function isPortFree(p) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once("error", () => resolve(false));
    server.listen(p, "127.0.0.1", () => {
      server.close(() => resolve(true));
    });
  });
}

async function main() {
  if (!(await isPortFree(port))) {
    console.error(`
\x1b[31m端口 ${port} 已被占用。\x1b[0m

这会导致你打开 http://localhost:${port} 时 \x1b[33m/_next/static/... 404\x1b[0m、页面空白或控制台大量静态资源报错
（常见于同时运行了多个 \`next dev\`，Next 会自动改用 3001、3002… 但浏览器仍访问旧端口）。

请先执行:
  \x1b[36mpnpm dev:stop\x1b[0m

然后只保留一个开发服:
  \x1b[36mpnpm dev\x1b[0m
`);
    process.exit(1);
  }

  if (clean) {
    fs.rmSync(path.join(frontendRoot, ".next"), { recursive: true, force: true });
    console.log("已清理 .next 缓存");
  }

  const env = {
    ...process.env,
    PORT: String(port),
  };

  // macOS 上 watch 句柄不足时可用 WATCHPACK_POLLING=true pnpm dev
  if (process.env.WATCHPACK_POLLING === "true") {
    console.log("WATCHPACK_POLLING=true（文件轮询模式，可缓解 EMFILE）");
  }

  console.log(`\n▶ Next.js dev → http://localhost:${port}\n`);

  const nextBin = path.join(frontendRoot, "node_modules", ".bin", "next");
  const child = spawn(nextBin, ["dev", "-p", String(port)], {
    cwd: frontendRoot,
    stdio: "inherit",
    env,
  });

  child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    process.exit(code ?? 0);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
