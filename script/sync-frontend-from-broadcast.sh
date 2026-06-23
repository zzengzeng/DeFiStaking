#!/usr/bin/env bash
# 从 Foundry broadcast 同步合约地址到 frontend/.env.local
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

CHAIN_ID="${CHAIN_ID:-11155111}"
BROADCAST="broadcast/DualPoolStaking.s.sol/${CHAIN_ID}/run-latest.json"
FRONTEND_ENV="frontend/.env.local"

if [[ ! -f "$BROADCAST" ]]; then
  echo "ERROR: 找不到 $BROADCAST — 请先完成部署。" >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: 需要 jq。" >&2
  exit 1
fi

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

extract_addr() {
  local pattern="$1"
  jq -r --arg p "$pattern" '
    .transactions[]
    | select(.contractName != null and (.contractName | test($p)))
    | .contractAddress
  ' "$BROADCAST" | tail -1
}

STAKING="$(extract_addr '^DualPoolStaking$')"
USER_MOD="$(extract_addr 'DualPoolUserModule')"
ADMIN_MOD="$(extract_addr 'DualPoolAdminModule')"
ADMIN_FACADE="$(extract_addr 'DualPoolStakingAdmin')"
# 两个 TimelockController：按 broadcast 出现顺序 48h / 72h（兼容 macOS 默认 bash 3，无 mapfile）
TL_ALL=()
while IFS= read -r _tl_addr; do
  TL_ALL+=("$_tl_addr")
done < <(jq -r '.transactions[] | select(.contractName == "TimelockController") | .contractAddress' "$BROADCAST")
TL_48="${TL_ALL[0]:-}"
TL_72="${TL_ALL[1]:-}"

DEPLOY_BLOCK="$(jq -r '[.receipts[]? | .blockNumber] | first // empty' "$BROADCAST")"
if [[ -n "$DEPLOY_BLOCK" && "$DEPLOY_BLOCK" == 0x* ]]; then
  DEPLOY_BLOCK=$((DEPLOY_BLOCK))
fi

MOCK_TOKENS=()
while IFS= read -r _tok_addr; do
  MOCK_TOKENS+=("$_tok_addr")
done < <(jq -r '.transactions[] | select(.contractName == "MockERC20" and .transactionType == "CREATE") | .contractAddress' "$BROADCAST")
BROADCAST_TOKEN_A="${MOCK_TOKENS[0]:-}"
BROADCAST_TOKEN_B="${MOCK_TOKENS[1]:-}"
TOKEN_A_FAUCET_BROADCAST="$(extract_addr 'TestnetTokenAirdropFaucet')"
TOKEN_A_FAUCET="${TOKEN_A_FAUCET:-${TOKEN_A_FAUCET_BROADCAST:-}}"

TOKEN_A="${TOKEN_A:-${BROADCAST_TOKEN_A:-0xbd1ea15E7F4774Df55b99d4Bae731dD0B4E602DE}}"
TOKEN_B="${TOKEN_B:-${BROADCAST_TOKEN_B:-0x65E926f4B96D9f29082Fc6B3758132EcCC73bbf1}}"
OPERATOR="${OPERATOR:-}"

for v in STAKING USER_MOD ADMIN_MOD ADMIN_FACADE TL_48 TL_72; do
  if [[ -z "${!v}" || "${!v}" == "null" ]]; then
    echo "ERROR: 无法从 broadcast 解析 ${v}" >&2
    exit 1
  fi
done

if [[ -f "$FRONTEND_ENV" ]]; then
  cp "$FRONTEND_ENV" "${FRONTEND_ENV}.bak.$(date +%Y%m%d%H%M%S)"
fi

cat >"$FRONTEND_ENV" <<EOF
# 由 script/sync-frontend-from-broadcast.sh 同步 — $(date -u +"%Y-%m-%dT%H:%M:%SZ")
NEXT_PUBLIC_DUAL_STAKING_ADDRESS=$STAKING
NEXT_PUBLIC_TOKEN_A_ADDRESS=$TOKEN_A
NEXT_PUBLIC_TOKEN_B_ADDRESS=$TOKEN_B
NEXT_PUBLIC_TOKEN_A_FAUCET_ADDRESS=${TOKEN_A_FAUCET:-0x0000000000000000000000000000000000000000}
NEXT_PUBLIC_TIMELOCK_CONTROLLER_ADDRESS=$TL_48
NEXT_PUBLIC_TIMELOCK_SUPER_CONTROLLER_ADDRESS=$TL_72
NEXT_PUBLIC_STAKING_ADMIN_FACADE_ADDRESS=$ADMIN_FACADE
NEXT_PUBLIC_DUAL_POOL_USER_MODULE_ADDRESS=$USER_MOD
NEXT_PUBLIC_DUAL_POOL_ADMIN_MODULE_ADDRESS=$ADMIN_MOD
NEXT_PUBLIC_OPERATOR_ROLE_HOLDER_ADDRESS=${OPERATOR:-0x0000000000000000000000000000000000000000}
NEXT_PUBLIC_RPC_URL_SEPOLIA=${SEPOLIA_RPC_URL:-https://sepolia.drpc.org}
NEXT_PUBLIC_RPC_URL_MAINNET=
NEXT_PUBLIC_STAKING_DEPLOY_BLOCK=${DEPLOY_BLOCK:-0}
NEXT_PUBLIC_CHAIN_ID=$CHAIN_ID
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=
NEXT_PUBLIC_USD_PRICE_TOKEN_A=
NEXT_PUBLIC_USD_PRICE_TOKEN_B=
PORT=3000
EOF

echo "✓ Updated $FRONTEND_ENV"
echo "  Staking:      $STAKING"
echo "  UserModule:   $USER_MOD"
echo "  AdminModule:  $ADMIN_MOD"
echo "  TokenA:       $TOKEN_A"
echo "  TokenB:       $TOKEN_B"
echo "  Timelock 48h: $TL_48"
echo "  Timelock 72h: $TL_72"
echo "  Operator ref: ${OPERATOR:-（未设置 OPERATOR env）}"
if [[ -n "$TOKEN_A_FAUCET" && "$TOKEN_A_FAUCET" != "null" ]]; then
  echo "  TokenA Faucet: $TOKEN_A_FAUCET"
fi

node "$ROOT_DIR/script/patch-frontend-addresses-ts.mjs" "$FRONTEND_ENV"

echo ""
echo "下一步:"
echo "  1. make frontend-contract-sync    # 校验 .env.local 与 broadcast 一致"
echo "  2. make post-deploy-verify        # 链上模块指针 / 角色校验（需 RPC）"
echo "  3. cd frontend && pnpm dev        # 本地验证"
echo "  4. Vercel: 更新环境变量后 Redeploy（非仅 Rebuild）"
