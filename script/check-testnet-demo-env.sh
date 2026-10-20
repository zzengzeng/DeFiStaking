#!/usr/bin/env bash
# 测试网公开演示环境检查（比 production-readiness 宽松，不要求审计/治理占位符清理）
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

failures=0
warnings=0

fail() {
  printf 'ERROR: %s\n' "$1" >&2
  failures=$((failures + 1))
}

warn() {
  printf 'WARN:  %s\n' "$1" >&2
  warnings=$((warnings + 1))
}

lower() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]'
}

require_address_env() {
  local key="$1"
  local value="${!key:-}"
  if [[ -z "$value" ]]; then
    fail "missing required env: $key"
    return
  fi
  if ! [[ "$value" =~ ^0x[0-9a-fA-F]{40}$ ]]; then
    fail "$key must be a 20-byte EVM address"
    return
  fi
  if [[ "$(lower "$value")" == "0x0000000000000000000000000000000000000000" ]]; then
    fail "$key must not be zero address"
  fi
}

require_nonempty_env() {
  local key="$1"
  if [[ -z "${!key:-}" ]]; then
    fail "missing required env: $key"
  fi
}

if [[ -f frontend/.env.local ]]; then
  set -a
  # shellcheck disable=SC1091
  source frontend/.env.local
  set +a
  printf 'Loaded frontend/.env.local\n'
else
  warn "frontend/.env.local not found — pass env vars explicitly or run: make sync-frontend-addresses"
fi

printf 'Running testnet public demo checks...\n'

require_address_env NEXT_PUBLIC_DUAL_STAKING_ADDRESS
require_address_env NEXT_PUBLIC_TOKEN_A_ADDRESS
require_address_env NEXT_PUBLIC_TOKEN_B_ADDRESS
require_address_env NEXT_PUBLIC_DUAL_POOL_USER_MODULE_ADDRESS
require_address_env NEXT_PUBLIC_DUAL_POOL_ADMIN_MODULE_ADDRESS
require_address_env NEXT_PUBLIC_STAKING_ADMIN_FACADE_ADDRESS
require_address_env NEXT_PUBLIC_TIMELOCK_CONTROLLER_ADDRESS
require_address_env NEXT_PUBLIC_TIMELOCK_SUPER_CONTROLLER_ADDRESS
require_address_env NEXT_PUBLIC_OPERATOR_ROLE_HOLDER_ADDRESS

require_nonempty_env NEXT_PUBLIC_CHAIN_ID
require_nonempty_env NEXT_PUBLIC_RPC_URL_SEPOLIA
require_nonempty_env NEXT_PUBLIC_STAKING_DEPLOY_BLOCK

if [[ "${NEXT_PUBLIC_CHAIN_ID:-}" != "11155111" ]]; then
  fail "testnet demo expects NEXT_PUBLIC_CHAIN_ID=11155111 (Sepolia)"
fi

if [[ -z "${NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID:-}" ]]; then
  warn "NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is empty — mobile QR wallets disabled"
else
  printf 'OK: WalletConnect project id is set\n'
fi

if [[ -z "${NEXT_PUBLIC_SOCIAL_TWITTER:-}" && -z "${NEXT_PUBLIC_SOCIAL_DISCORD:-}" && -z "${NEXT_PUBLIC_SOCIAL_TELEGRAM:-}" ]]; then
  warn "no NEXT_PUBLIC_SOCIAL_* links — footer community section will show setup hint"
fi

if command -v forge >/dev/null 2>&1 && [[ -f script/check-frontend-contract-sync.sh ]]; then
  if bash script/check-frontend-contract-sync.sh; then
    printf 'OK: frontend contract addresses match broadcast\n'
  else
    fail "frontend contract sync drift — run: make sync-frontend-addresses"
  fi
else
  warn "skipped frontend-contract-sync (forge or script unavailable)"
fi

if command -v cast >/dev/null 2>&1 && [[ -n "${NEXT_PUBLIC_RPC_URL_SEPOLIA:-}" ]]; then
  if cast chain-id --rpc-url "$NEXT_PUBLIC_RPC_URL_SEPOLIA" >/dev/null 2>&1; then
    printf 'OK: Sepolia RPC reachable\n'
  else
    warn "Sepolia RPC unreachable at NEXT_PUBLIC_RPC_URL_SEPOLIA"
  fi
else
  warn "skipped RPC probe (cast unavailable)"
fi

if [[ "$failures" -gt 0 ]]; then
  printf 'Testnet demo checks failed with %s blocker(s), %s warning(s).\n' "$failures" "$warnings" >&2
  exit 1
fi

printf 'Testnet demo checks passed (%s warning(s)). Ready for public Sepolia demo.\n' "$warnings"
