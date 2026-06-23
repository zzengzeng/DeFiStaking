const ZERO = "0x0000000000000000000000000000000000000000" as const;

/**
 * Sepolia 当前仓库一次完整部署的链上地址（与 `broadcast/.../run-latest.json` 一致）。
 * 未设置 `NEXT_PUBLIC_*` 时作为默认值，便于本地/演示直连；生产环境请显式配置环境变量。
 */
export const sepoliaDeploymentMeta = {
  chainId: 11155111 as const,
  tokenA: "0xba2f8128e5f0a47f820010eedd3f96e0b6e0e67b" as const,
  tokenB: "0x2a082fec5f9b75c27f85617d90a7d3ace62743c4" as const,
  /** DualPoolStaking（含 pendingRewardA/B 视图） */
  staking: "0x1b96a75e34fde5cf7db1c3172500ac5854b3b502" as const,
  dualPoolUserModule: "0xc15ce16967e095e486a9be0ae8c12f0d6ad14796" as const,
  dualPoolAdminModule: "0xf93049db13fc75f060c279803823c69e7bc40820" as const,
  dualPoolStakingAdmin: "0x2eec687cabe8b72e22fce5923583ab83ae91056a" as const,
  /** 参数类治理 Timelock（48h） */
  timelockController: "0x2d0c5c08fd98b019f1e67067d9823ccbb7a93c33" as const,
  /** 超级路径 Timelock（72h） */
  timelockSuperController: "0xab19c84bbb4b5b34fd8cba7d09bb2d21fdce9325" as const,
  timelockMinDelaySeconds: 172800 as const,
  timelockSuperMinDelaySeconds: 259200 as const,
  operatorRoleHolder: "0xb65214b2F45892399b2E4724d34996552534F94f" as const,
  tokenAFaucet: "0xd8834d4e101581f356f2d19ee65131b144cfd601" as const,
  stakingDeployBlock: 11_123_121 as const,
} as const;

/** 防止 .env 中误加引号/空格导致打包进客户端的地址字面量语法错误。 */
function parseAddressEnv(raw: string | undefined, label: string): `0x${string}` {
  if (!raw) return ZERO;
  let s = raw.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(s)) {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.warn(`[addresses] Invalid ${label}, using zero address:`, raw);
    }
    return ZERO;
  }
  return s as `0x${string}`;
}

function envOrSepoliaDefault(
  raw: string | undefined,
  label: string,
  sepoliaDefault: `0x${string}`,
): `0x${string}` {
  const parsed = parseAddressEnv(raw, label);
  return parsed !== ZERO ? parsed : sepoliaDefault;
}

/** 与 UI / hooks 交互的核心合约（env 优先，缺省则用 Sepolia 部署表）。 */
export const contractAddresses = {
  staking: envOrSepoliaDefault(
    process.env.NEXT_PUBLIC_DUAL_STAKING_ADDRESS,
    "NEXT_PUBLIC_DUAL_STAKING_ADDRESS",
    sepoliaDeploymentMeta.staking,
  ),
  tokenA: envOrSepoliaDefault(process.env.NEXT_PUBLIC_TOKEN_A_ADDRESS, "NEXT_PUBLIC_TOKEN_A_ADDRESS", sepoliaDeploymentMeta.tokenA),
  tokenB: envOrSepoliaDefault(process.env.NEXT_PUBLIC_TOKEN_B_ADDRESS, "NEXT_PUBLIC_TOKEN_B_ADDRESS", sepoliaDeploymentMeta.tokenB),
  /** 配置后首页空投走 Faucet.claim；未配置且代币为旧版开放 mint 时回退 token.mint */
  tokenAFaucet: envOrSepoliaDefault(
    process.env.NEXT_PUBLIC_TOKEN_A_FAUCET_ADDRESS,
    "NEXT_PUBLIC_TOKEN_A_FAUCET_ADDRESS",
    sepoliaDeploymentMeta.tokenAFaucet,
  ),
};

/** 模块与治理相关地址（当前仅用于只读展示或后续扩展；写操作仍经 `contractAddresses.staking`）。 */
export const sepoliaAuxAddresses = {
  dualPoolUserModule: envOrSepoliaDefault(
    process.env.NEXT_PUBLIC_DUAL_POOL_USER_MODULE_ADDRESS,
    "NEXT_PUBLIC_DUAL_POOL_USER_MODULE_ADDRESS",
    sepoliaDeploymentMeta.dualPoolUserModule,
  ),
  dualPoolAdminModule: envOrSepoliaDefault(
    process.env.NEXT_PUBLIC_DUAL_POOL_ADMIN_MODULE_ADDRESS,
    "NEXT_PUBLIC_DUAL_POOL_ADMIN_MODULE_ADDRESS",
    sepoliaDeploymentMeta.dualPoolAdminModule,
  ),
  dualPoolStakingAdmin: envOrSepoliaDefault(
    process.env.NEXT_PUBLIC_STAKING_ADMIN_FACADE_ADDRESS,
    "NEXT_PUBLIC_STAKING_ADMIN_FACADE_ADDRESS",
    sepoliaDeploymentMeta.dualPoolStakingAdmin,
  ),
  timelockController: envOrSepoliaDefault(
    process.env.NEXT_PUBLIC_TIMELOCK_CONTROLLER_ADDRESS,
    "NEXT_PUBLIC_TIMELOCK_CONTROLLER_ADDRESS",
    sepoliaDeploymentMeta.timelockController,
  ),
  operatorRoleHolder: envOrSepoliaDefault(
    process.env.NEXT_PUBLIC_OPERATOR_ROLE_HOLDER_ADDRESS,
    "NEXT_PUBLIC_OPERATOR_ROLE_HOLDER_ADDRESS",
    sepoliaDeploymentMeta.operatorRoleHolder,
  ),
} as const;

/** Timelock 原生治理：`TimelockController` → `DualPoolStakingAdmin` → `DualPoolStaking`。 */
export const governanceAddresses = {
  /** 参数 / 金库 / 协议状态（48h） */
  timelock: envOrSepoliaDefault(
    process.env.NEXT_PUBLIC_TIMELOCK_CONTROLLER_ADDRESS,
    "NEXT_PUBLIC_TIMELOCK_CONTROLLER_ADDRESS",
    sepoliaDeploymentMeta.timelockController,
  ),
  /** 模块与角色超级路径（72h） */
  timelockSuper: envOrSepoliaDefault(
    process.env.NEXT_PUBLIC_TIMELOCK_SUPER_CONTROLLER_ADDRESS,
    "NEXT_PUBLIC_TIMELOCK_SUPER_CONTROLLER_ADDRESS",
    sepoliaDeploymentMeta.timelockSuperController,
  ),
  adminFacade: envOrSepoliaDefault(
    process.env.NEXT_PUBLIC_STAKING_ADMIN_FACADE_ADDRESS,
    "NEXT_PUBLIC_STAKING_ADMIN_FACADE_ADDRESS",
    sepoliaDeploymentMeta.dualPoolStakingAdmin,
  ),
} as const;
