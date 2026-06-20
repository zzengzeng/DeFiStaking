#!/usr/bin/env bash
# 生成 6 个互不相同的钱包并写入 .env（角色分离，适合 Sepolia 彩排）。
# 私钥写入 .env.governance-keys（已 gitignore，切勿提交）。
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ENV_FILE="${ENV_FILE:-.env}"
KEYS_FILE="${KEYS_FILE:-.env.governance-keys}"

if ! command -v cast >/dev/null 2>&1; then
  echo "ERROR: 需要 Foundry cast。请先安装 foundry。" >&2
  exit 1
fi

if [[ -f "$ENV_FILE" ]]; then
  echo "WARN: $ENV_FILE 已存在，将备份为 ${ENV_FILE}.bak.$(date +%Y%m%d%H%M%S)" >&2
  cp "$ENV_FILE" "${ENV_FILE}.bak.$(date +%Y%m%d%H%M%S)"
fi

gen_wallet() {
  local label="$1"
  local out
  out="$(cast wallet new 2>&1)"
  local address
  local private_key
  address="$(printf '%s\n' "$out" | awk '/^Address:/ { print $2 }')"
  private_key="$(printf '%s\n' "$out" | awk '/^Private key:/ { print $3 }')"
  if [[ -z "$address" || -z "$private_key" ]]; then
    echo "ERROR: cast wallet new failed for $label" >&2
    printf '%s\n' "$out" >&2
    exit 1
  fi
  printf '%s\n' "$label|$address|$private_key"
}

echo "Generating 6 distinct wallets (deployer + 5 governance roles)..."

W_DEPLOYER="$(gen_wallet deployer)"
W_OPERATOR="$(gen_wallet operator)"
W_GOV_P="$(gen_wallet governance-proposer)"
W_GOV_E="$(gen_wallet governance-executor)"
W_SUPER_P="$(gen_wallet super-proposer)"
W_SUPER_E="$(gen_wallet super-executor)"

read -r _ DEPLOYER_ADDRESS DEPLOYER_PK <<< "$(echo "$W_DEPLOYER" | tr '|' ' ')"
read -r _ OPERATOR OPERATOR_PK <<< "$(echo "$W_OPERATOR" | tr '|' ' ')"
read -r _ GOVERNANCE_PROPOSER GOVERNANCE_PROPOSER_PK <<< "$(echo "$W_GOV_P" | tr '|' ' ')"
read -r _ GOVERNANCE_EXECUTOR GOVERNANCE_EXECUTOR_PK <<< "$(echo "$W_GOV_E" | tr '|' ' ')"
read -r _ SUPER_PROPOSER SUPER_PROPOSER_PK <<< "$(echo "$W_SUPER_P" | tr '|' ' ')"
read -r _ SUPER_EXECUTOR SUPER_EXECUTOR_PK <<< "$(echo "$W_SUPER_E" | tr '|' ' ')"

cat >"$KEYS_FILE" <<EOF
# 自动生成于 $(date -u +"%Y-%m-%dT%H:%M:%SZ") — 勿提交 Git
# MetaMask：右上角账户 → 导入账户 → 私钥 → 粘贴下方对应 PRIVATE_KEY（每次导入一个）

# Deployer — $DEPLOYER_ADDRESS
DEPLOYER_PRIVATE_KEY=$DEPLOYER_PK

# Operator — $OPERATOR
OPERATOR_PRIVATE_KEY=$OPERATOR_PK

# Governance proposer (48h) — $GOVERNANCE_PROPOSER
GOVERNANCE_PROPOSER_PRIVATE_KEY=$GOVERNANCE_PROPOSER_PK

# Governance executor (48h) — $GOVERNANCE_EXECUTOR
GOVERNANCE_EXECUTOR_PRIVATE_KEY=$GOVERNANCE_EXECUTOR_PK

# Super proposer (72h) — $SUPER_PROPOSER
SUPER_PROPOSER_PRIVATE_KEY=$SUPER_PROPOSER_PK

# Super executor (72h) — $SUPER_EXECUTOR
SUPER_EXECUTOR_PRIVATE_KEY=$SUPER_EXECUTOR_PK
EOF
chmod 600 "$KEYS_FILE" 2>/dev/null || true

cat >"$ENV_FILE" <<EOF
# DualPool 分角色治理 — Sepolia 彩排（由 script/init-separated-governance-env.sh 生成）
SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
# ETHERSCAN_API_KEY=

# 部署 signer（仅发部署交易；部署后链上不再持有 OPERATOR/Timelock 角色）
DEPLOYER_ADDRESS=$DEPLOYER_ADDRESS
PRIVATE_KEY=$DEPLOYER_PK

# 0h 热路径：pause / emergency / notifyReward*
OPERATOR=$OPERATOR

# 48h 参数治理 Timelock（proposer 排队 ≠ executor 执行）
GOVERNANCE_PROPOSER=$GOVERNANCE_PROPOSER
GOVERNANCE_EXECUTOR=$GOVERNANCE_EXECUTOR

# 72h 超级路径 Timelock
SUPER_PROPOSER=$SUPER_PROPOSER
SUPER_EXECUTOR=$SUPER_EXECUTOR

# 复用已有测试币（deploy-reuse-tokens）
TOKEN_A=0xbd1ea15E7F4774Df55b99d4Bae731dD0B4E602DE
TOKEN_B=0x65E926f4B96D9f29082Fc6B3758132EcCC73bbf1

# 主网闸门时再打开（需 DEPLOYER_ACCOUNT keystore，禁止 PRIVATE_KEY）：
# PRODUCTION=true
EOF
chmod 600 "$ENV_FILE" 2>/dev/null || true

echo ""
echo "✓ Wrote $ENV_FILE (addresses + deployer PRIVATE_KEY)"
echo "✓ Wrote $KEYS_FILE (backup key reference)"
echo ""
echo "Role addresses:"
echo "  DEPLOYER_ADDRESS     $DEPLOYER_ADDRESS"
echo "  OPERATOR             $OPERATOR"
echo "  GOVERNANCE_PROPOSER  $GOVERNANCE_PROPOSER"
echo "  GOVERNANCE_EXECUTOR  $GOVERNANCE_EXECUTOR"
echo "  SUPER_PROPOSER       $SUPER_PROPOSER"
echo "  SUPER_EXECUTOR       $SUPER_EXECUTOR"
echo ""
echo "Next:"
echo "  1. 给 DEPLOYER 充 Sepolia ETH: $DEPLOYER_ADDRESS"
echo '  2. 打开 .env.governance-keys，将 6 条 *_PRIVATE_KEY 分别导入 MetaMask'
echo "  3. make validate-governance-env"
echo "  4. make deploy-separated-roles NETWORK=sepolia"
echo "  5. make sync-frontend-addresses"
