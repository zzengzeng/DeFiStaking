#!/usr/bin/env bash
# 校验治理/运维地址已配置且彼此隔离（Sepolia 彩排 / deploy-separated-roles 用）。
# 完整主网闸门仍用 script/check-production-readiness.sh（PRODUCTION=true）。
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

failures=0

fail() {
  printf 'ERROR: %s\n' "$1" >&2
  failures=$((failures + 1))
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
  if [[ "$value" == "0x0000000000000000000000000000000000000000" ]]; then
    fail "$key must not be zero address"
  fi
}

require_distinct() {
  local a_key="$1"
  local b_key="$2"
  local a="${!a_key:-}"
  local b="${!b_key:-}"
  if [[ -n "$a" && -n "$b" && "$(lower "$a")" == "$(lower "$b")" ]]; then
    fail "$a_key and $b_key must be different addresses"
  fi
}

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

printf 'Validating governance role separation...\n'

require_address_env DEPLOYER_ADDRESS
require_address_env OPERATOR
require_address_env GOVERNANCE_PROPOSER
require_address_env GOVERNANCE_EXECUTOR
require_address_env SUPER_PROPOSER
require_address_env SUPER_EXECUTOR

for key in OPERATOR GOVERNANCE_PROPOSER GOVERNANCE_EXECUTOR SUPER_PROPOSER SUPER_EXECUTOR; do
  require_distinct DEPLOYER_ADDRESS "$key"
done

require_distinct GOVERNANCE_PROPOSER GOVERNANCE_EXECUTOR
require_distinct SUPER_PROPOSER SUPER_EXECUTOR

for key in GOVERNANCE_PROPOSER GOVERNANCE_EXECUTOR SUPER_PROPOSER SUPER_EXECUTOR; do
  require_distinct OPERATOR "$key"
done

if [[ $failures -gt 0 ]]; then
  printf '\nGovernance separation check failed (%s issue(s)).\n' "$failures" >&2
  printf 'Run: make init-governance-wallets   # 生成分离钱包并写入 .env\n' >&2
  exit 1
fi

printf 'OK: all governance roles are configured and distinct.\n'
