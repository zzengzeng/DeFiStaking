#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const buildIdPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".next", "BUILD_ID");

if (!fs.existsSync(buildIdPath)) {
  console.error(`
未找到生产构建（.next/BUILD_ID 不存在）。

  生产预览:  pnpm build && pnpm start
  本地开发:  pnpm dev  （不要用 start）

若刚执行过 dev:clean 或删除了 .next，需要先 build。
`);
  process.exit(1);
}
