#!/usr/bin/env node
/**
 * 将部署地址写入 frontend/src/contracts/addresses.ts 的 sepoliaDeploymentMeta 默认值。
 * 供未配置 NEXT_PUBLIC_* 的本地 dev / 演示与 broadcast 保持一致。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ADDRESSES_TS = path.join(ROOT, "frontend/src/contracts/addresses.ts");

function parseEnvFile(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

function pick(env, key, fallback = "") {
  const v = env[key];
  return v && v !== "0x0000000000000000000000000000000000000000" ? v : fallback;
}

const envPath = process.argv[2] ?? path.join(ROOT, "frontend/.env.local");
const env = parseEnvFile(envPath);

const requiredAddressKeys = [
  "tokenA",
  "tokenB",
  "staking",
  "dualPoolUserModule",
  "dualPoolAdminModule",
  "dualPoolStakingAdmin",
  "timelockController",
  "timelockSuperController",
  "operatorRoleHolder",
];

const meta = {
  chainId: Number(env.NEXT_PUBLIC_CHAIN_ID || "11155111"),
  tokenA: pick(env, "NEXT_PUBLIC_TOKEN_A_ADDRESS"),
  tokenB: pick(env, "NEXT_PUBLIC_TOKEN_B_ADDRESS"),
  staking: pick(env, "NEXT_PUBLIC_DUAL_STAKING_ADDRESS"),
  dualPoolUserModule: pick(env, "NEXT_PUBLIC_DUAL_POOL_USER_MODULE_ADDRESS"),
  dualPoolAdminModule: pick(env, "NEXT_PUBLIC_DUAL_POOL_ADMIN_MODULE_ADDRESS"),
  dualPoolStakingAdmin: pick(env, "NEXT_PUBLIC_STAKING_ADMIN_FACADE_ADDRESS"),
  timelockController: pick(env, "NEXT_PUBLIC_TIMELOCK_CONTROLLER_ADDRESS"),
  timelockSuperController: pick(env, "NEXT_PUBLIC_TIMELOCK_SUPER_CONTROLLER_ADDRESS"),
  operatorRoleHolder: pick(env, "NEXT_PUBLIC_OPERATOR_ROLE_HOLDER_ADDRESS"),
  tokenAFaucet: pick(env, "NEXT_PUBLIC_TOKEN_A_FAUCET_ADDRESS"),
  stakingDeployBlock: Number(env.NEXT_PUBLIC_STAKING_DEPLOY_BLOCK || "0"),
};

for (const k of requiredAddressKeys) {
  const v = meta[k];
  if (!v || !/^0x[a-fA-F0-9]{40}$/.test(v)) {
    console.error(`patch-frontend-addresses-ts: missing or invalid ${k} in ${envPath}`);
    process.exit(1);
  }
}

let src = fs.readFileSync(ADDRESSES_TS, "utf8");

const replacements = [
  ["chainId: \\d+ as const", `chainId: ${meta.chainId} as const`],
  ["tokenA: \"0x[a-fA-F0-9]{40}\" as const", `tokenA: "${meta.tokenA}" as const`],
  ["tokenB: \"0x[a-fA-F0-9]{40}\" as const", `tokenB: "${meta.tokenB}" as const`],
  ["staking: \"0x[a-fA-F0-9]{40}\" as const", `staking: "${meta.staking}" as const`],
  ["dualPoolUserModule: \"0x[a-fA-F0-9]{40}\" as const", `dualPoolUserModule: "${meta.dualPoolUserModule}" as const`],
  ["dualPoolAdminModule: \"0x[a-fA-F0-9]{40}\" as const", `dualPoolAdminModule: "${meta.dualPoolAdminModule}" as const`],
  ["dualPoolStakingAdmin: \"0x[a-fA-F0-9]{40}\" as const", `dualPoolStakingAdmin: "${meta.dualPoolStakingAdmin}" as const`],
  ["timelockController: \"0x[a-fA-F0-9]{40}\" as const", `timelockController: "${meta.timelockController}" as const`],
  ["timelockSuperController: \"0x[a-fA-F0-9]{40}\" as const", `timelockSuperController: "${meta.timelockSuperController}" as const`],
  ["operatorRoleHolder: \"0x[a-fA-F0-9]{40}\" as const", `operatorRoleHolder: "${meta.operatorRoleHolder}" as const`],
  ["stakingDeployBlock: [\\d_]+ as const", `stakingDeployBlock: ${meta.stakingDeployBlock.toLocaleString("en-US").replace(/,/g, "_")} as const`],
];

if (meta.tokenAFaucet && /^0x[a-fA-F0-9]{40}$/.test(meta.tokenAFaucet)) {
  replacements.push([
    "tokenAFaucet: \"0x[a-fA-F0-9]{40}\" as const",
    `tokenAFaucet: "${meta.tokenAFaucet}" as const`,
  ]);
}

for (const [pattern, replacement] of replacements) {
  const re = new RegExp(pattern);
  if (!re.test(src)) {
    console.error(`patch-frontend-addresses-ts: pattern not found: ${pattern}`);
    process.exit(1);
  }
  src = src.replace(re, replacement);
}

fs.writeFileSync(ADDRESSES_TS, src);
console.log(`✓ Patched ${ADDRESSES_TS} (sepoliaDeploymentMeta)`);
