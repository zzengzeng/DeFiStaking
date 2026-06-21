#!/usr/bin/env bash
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
    fail "missing required frontend env: $key"
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
    fail "missing required frontend env: $key"
  fi
}

printf 'Running frontend production env checks...\n'

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
require_nonempty_env NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID

if [[ -n "${NEXT_PUBLIC_TOKEN_A_ADDRESS:-}" && -n "${NEXT_PUBLIC_TOKEN_B_ADDRESS:-}" ]]; then
  if [[ "$(lower "$NEXT_PUBLIC_TOKEN_A_ADDRESS")" == "$(lower "$NEXT_PUBLIC_TOKEN_B_ADDRESS")" ]]; then
    fail "NEXT_PUBLIC_TOKEN_A_ADDRESS and NEXT_PUBLIC_TOKEN_B_ADDRESS must differ"
  fi
fi

if [[ -n "${NEXT_PUBLIC_DUAL_STAKING_ADDRESS:-}" && -n "${NEXT_PUBLIC_STAKING_ADMIN_FACADE_ADDRESS:-}" ]]; then
  if [[ "$(lower "$NEXT_PUBLIC_DUAL_STAKING_ADDRESS")" == "$(lower "$NEXT_PUBLIC_STAKING_ADMIN_FACADE_ADDRESS")" ]]; then
    fail "core and admin facade frontend addresses must differ"
  fi
fi

if [[ -n "${NEXT_PUBLIC_TIMELOCK_CONTROLLER_ADDRESS:-}" && -n "${NEXT_PUBLIC_TIMELOCK_SUPER_CONTROLLER_ADDRESS:-}" ]]; then
  if [[ "$(lower "$NEXT_PUBLIC_TIMELOCK_CONTROLLER_ADDRESS")" == "$(lower "$NEXT_PUBLIC_TIMELOCK_SUPER_CONTROLLER_ADDRESS")" ]]; then
    fail "48h and 72h timelock frontend addresses must differ"
  fi
fi

if [[ "${NEXT_PUBLIC_CHAIN_ID:-}" != "11155111" && "${NEXT_PUBLIC_CHAIN_ID:-}" != "1" ]]; then
  fail "NEXT_PUBLIC_CHAIN_ID must be 11155111 or 1"
fi

if [[ "$failures" -gt 0 ]]; then
  printf 'Frontend production env checks failed with %s blocker(s).\n' "$failures" >&2
  exit 1
fi

printf 'Frontend production env checks passed.\n'
