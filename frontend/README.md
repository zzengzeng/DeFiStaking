# DualPool Frontend

Next.js 14 + wagmi + RainbowKit 产品端与合约控制台。

## 环境

```bash
cp .env.example .env.local
# 按 broadcast/.../run-latest.json 更新合约地址
```

主要变量见 `.env.example`（`NEXT_PUBLIC_DUAL_STAKING_ADDRESS`、Token、Timelock、RPC 等）。

## 开发

**请只使用 pnpm，并只开一个开发服：**

```bash
pnpm install
pnpm dev          # 固定 http://localhost:3000
pnpm dev:clean    # 清 .next 后启动（改依赖或大改路由后）
pnpm dev:stop     # 停止 3000–3005 上残留的 next dev
```

浏览器访问 [http://localhost:3000](http://localhost:3000)。

### 静态资源 404 / 控制台报错 / 页面空白

**根因：** 同时运行了多个 `next dev`。Next 会在 3000 被占用时自动改用 3001、3002…，但浏览器仍打开 `localhost:3000`，HTML 里的 `/_next/static/...` 会指向错误或已过期的构建，导致 404。

**处理：**

```bash
pnpm dev:stop
pnpm dev:clean   # 若仍异常再执行
```

**预防：** 不要用 `yarn dev` 与 `pnpm dev` 混开；不要重复点 IDE 终端里的 dev。`pnpm dev` 在端口被占用时会**直接失败并提示**，不再静默换端口。

### EMFILE（too many open files）

macOS 上若出现 Watchpack EMFILE：

```bash
WATCHPACK_POLLING=true pnpm dev
# 或提高限制: ulimit -n 10240
```

## 构建

```bash
pnpm build
pnpm start
```

## 同步合约地址

```bash
pnpm sync:addresses
```
