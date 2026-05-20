const ZERO = "0x0000000000000000000000000000000000000000" as const;

/**
 * Sepolia 当前仓库一次完整部署的链上地址（与 `broadcast/.../run-latest.json` 一致）。
 * 未设置 `NEXT_PUBLIC_*` 时作为默认值，便于本地/演示直连；生产环境请显式配置环境变量。
 */
export const sepoliaDeploymentMeta = {
  chainId: 11155111 as const,
  tokenA: "0x969b2e2A6b489C91960E01c35cB944356Cc7FDe3" as const,
  tokenB: "0x4a69C18d7D332f5118A7a5CB298bcF2C82a9d806" as const,
  staking: "0x486e3D190f1f57Ac480337dE4749dbf518039a9A" as const,
  dualPoolUserModule: "0xAf5f612630a99faecf87aCa0506d3D27B34b62bB" as const,
  dualPoolAdminModule: "0x068ca54f9B801d3eFbd6Ddd8BF58BC36F439e06a" as const,
  dualPoolStakingAdmin: "0x71eE6fC78Ca9d4a40b042b68213BB2EeEcd27905" as const,
  timelockController: "0xd7b0F6c18f3539534fED9E11cfFB6395cF55EF57" as const,
  /** TimelockController.minDelay（秒），当前为 48h */
  timelockMinDelaySeconds: 172800 as const,
  /** OPERATOR_ROLE 热钱包（0h 操作） */
  operatorRoleHolder: "0xF29929Bf612E7074CEbC4365bA3730cC0f25a65E" as const,
  /** DualPoolStaking 合约创建所在区块，用于 timelock 事件索引起始高度 */
  stakingDeployBlock: 10_872_740 as const,
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
  timelock: envOrSepoliaDefault(
    process.env.NEXT_PUBLIC_TIMELOCK_CONTROLLER_ADDRESS,
    "NEXT_PUBLIC_TIMELOCK_CONTROLLER_ADDRESS",
    sepoliaDeploymentMeta.timelockController,
  ),
  adminFacade: envOrSepoliaDefault(
    process.env.NEXT_PUBLIC_STAKING_ADMIN_FACADE_ADDRESS,
    "NEXT_PUBLIC_STAKING_ADMIN_FACADE_ADDRESS",
    sepoliaDeploymentMeta.dualPoolStakingAdmin,
  ),
} as const;
