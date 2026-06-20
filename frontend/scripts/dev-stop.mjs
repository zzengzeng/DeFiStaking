#!/usr/bin/env node
/**
 * 停止本机 frontend 开发服（默认清理 3000–3005，避免多个 next dev 残留）。
 */
import { execSync } from "node:child_process";

const basePort = Number(process.env.PORT || 3000);
const span = Number(process.env.DEV_PORT_SPAN || 6);

function killPort(port) {
  try {
    const out = execSync(`lsof -ti tcp:${port}`, { encoding: "utf8" }).trim();
    if (!out) return 0;
    const pids = out.split("\n").filter(Boolean);
    for (const pid of pids) {
      try {
        process.kill(Number(pid), "SIGTERM");
        console.log(`已停止端口 ${port} 上的进程 PID ${pid}`);
      } catch {
        /* already gone */
      }
    }
    return pids.length;
  } catch {
    return 0;
  }
}

let total = 0;
for (let p = basePort; p < basePort + span; p++) {
  total += killPort(p);
}

if (total === 0) {
  console.log(`端口 ${basePort}–${basePort + span - 1} 无运行中的开发服。`);
} else {
  console.log(`共停止 ${total} 个进程。请使用 pnpm dev 重新启动（固定端口 ${basePort}）。`);
}
