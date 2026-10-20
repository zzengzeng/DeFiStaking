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

## 源码与架构

目录结构、双模式路由、**i18n 文案规范**、交易流与 hooks 说明见 **[src/README.md](./src/README.md)**。

专题文档：

- **[src/hooks/README.md](./src/hooks/README.md)** — 各 hook 职责、依赖关系、新增约定
- **[src/views/console/README.md](./src/views/console/README.md)** — 控制台四页结构与权限

### 国际化速查

```tsx
import { useI18n } from "@/lib/i18n";
import { useConsoleCopy } from "@/lib/consoleCopy";

const { t, locale, setLocale } = useI18n();
t("home.heroTitle");
t("withdraw.exceedsToastDesc", { amount: "1.0", token: "TokenA" });

// 控制台专用（已绑定 console.* 键）
const copy = useConsoleCopy();
copy.nav.hub;
```

语言切换组件：`LocaleSwitcher`（产品顶栏与控制台顶栏均已挂载）。
