const ZERO = "0x0000000000000000000000000000000000000000" as const;

/**
 * Sepolia 当前仓库一次完整部署的链上地址（与 `broadcast/.../run-latest.json` 一致）。
 * 未设置 `NEXT_PUBLIC_*` 时作为默认值，便于本地/演示直连；生产环境请显式配置环境变量。
 */
export const sepoliaDeploymentMeta = {
  chainId: 11155111 as const,
  tokenA: "0xbd1ea15e7f4774df55b99d4bae731dd0b4e602de" as const,
  tokenB: "0x65e926f4b96d9f29082fc6b3758132eccc73bbf1" as const,
  /** DualPoolStaking（双 Timelock 治理 + forceClaimAll 门禁） */
  staking: "0x161cb3cb4905c2c6fc8b19647e8a5a9761ae32ca" as const,
  dualPoolUserModule: "0x3ae5fafb4f4e383a20fa6bf5ed70d005e152b96f" as const,
  dualPoolAdminModule: "0x1324d32cde37d30152b79f8ef18d2c9a82d7ce9a" as const,
  dualPoolStakingAdmin: "0xa0d9e776e8ebf697a29bb612268c9976c1e980ca" as const,
  /** 参数类治理 Timelock（48h） */
  timelockController: "0x6d95e0c8d0fa989de67a33a175bb451d8aa2aee7" as const,
  /** 超级路径 Timelock（72h） */
  timelockSuperController: "0xfdc3cefe1443eeff54ec4246df8529a96260b3eb" as const,
  timelockMinDelaySeconds: 172800 as const,
  timelockSuperMinDelaySeconds: 259200 as const,
  operatorRoleHolder: "0xb65214b2F45892399b2E4724d34996552534F94f" as const,
  stakingDeployBlock: 11_095_818 as const,
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
