#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

CHAIN_ID="${CHAIN_ID:-11155111}"
BROADCAST="${BROADCAST:-broadcast/DualPoolStaking.s.sol/${CHAIN_ID}/run-latest.json}"
RPC_URL="${RPC_URL:-${SEPOLIA_RPC_URL:-}}"

failures=0

fail() {
  printf 'ERROR: %s\n' "$1" >&2
  failures=$((failures + 1))
}

lower() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]'
}

extract_addr() {
  local pattern="$1"
  jq -r --arg p "$pattern" '
    .transactions[]
    | select(.contractName != null and (.contractName | test($p)))
    | .contractAddress
  ' "$BROADCAST" | tail -1
}

require_tool() {
  command -v "$1" >/dev/null 2>&1 || {
    fail "missing required tool: $1"
    return 1
  }
}

cast_call() {
  cast call --rpc-url "$RPC_URL" "$@"
}

cast_addr() {
  cast_call "$@" | tail -1 | tr -d '[:space:]'
}

cast_bool() {
  local out
  out="$(cast_call "$@")"
  [[ "$out" == *"true"* ]]
}

printf 'Running post-deployment verification...\n'

require_tool jq || true
require_tool cast || true

if [[ ! -f "$BROADCAST" ]]; then
  fail "broadcast file not found: $BROADCAST"
fi
if [[ -z "$RPC_URL" ]]; then
  fail "RPC_URL or SEPOLIA_RPC_URL is required"
fi

if [[ "$failures" -gt 0 ]]; then
  exit 1
fi

CORE="${CORE_ADDRESS:-$(extract_addr '^DualPoolStaking$')}"
USER_MODULE="${USER_MODULE_ADDRESS:-$(extract_addr 'DualPoolUserModule')}"
ADMIN_MODULE="${ADMIN_MODULE_ADDRESS:-$(extract_addr 'DualPoolAdminModule')}"
ADMIN_FACADE="${ADMIN_FACADE_ADDRESS:-$(extract_addr 'DualPoolStakingAdmin')}"
TIMELOCK_48="${TIMELOCK_48_ADDRESS:-$(jq -r '.transactions[] | select(.contractName == "TimelockController") | .contractAddress' "$BROADCAST" | sed -n '1p')}"
TIMELOCK_72="${TIMELOCK_72_ADDRESS:-$(jq -r '.transactions[] | select(.contractName == "TimelockController") | .contractAddress' "$BROADCAST" | sed -n '2p')}"
DEPLOYER="${DEPLOYER_ADDRESS:-}"
OPERATOR="${OPERATOR:-${OPERATOR_ADDRESS:-}}"

for pair in \
  "CORE:$CORE" \
  "USER_MODULE:$USER_MODULE" \
  "ADMIN_MODULE:$ADMIN_MODULE" \
  "ADMIN_FACADE:$ADMIN_FACADE" \
  "TIMELOCK_48:$TIMELOCK_48" \
  "TIMELOCK_72:$TIMELOCK_72"; do
  key="${pair%%:*}"
  value="${pair#*:}"
  if ! [[ "$value" =~ ^0x[0-9a-fA-F]{40}$ ]]; then
    fail "$key is not a valid address: $value"
  fi
done

if [[ "$failures" -gt 0 ]]; then
  exit 1
fi

for pair in "CORE:$CORE" "USER_MODULE:$USER_MODULE" "ADMIN_MODULE:$ADMIN_MODULE" "ADMIN_FACADE:$ADMIN_FACADE" "TIMELOCK_48:$TIMELOCK_48" "TIMELOCK_72:$TIMELOCK_72"; do
  key="${pair%%:*}"
  value="${pair#*:}"
  code="$(cast code --rpc-url "$RPC_URL" "$value")"
  if [[ "$code" == "0x" ]]; then
    fail "$key has no deployed bytecode: $value"
  fi
done

ADMIN_ROLE="$(cast_addr "$CORE" 'ADMIN_ROLE()(bytes32)')"
DEFAULT_ADMIN_ROLE="$(cast_addr "$CORE" 'DEFAULT_ADMIN_ROLE()(bytes32)')"
OPERATOR_ROLE="$(cast_addr "$CORE" 'OPERATOR_ROLE()(bytes32)')"

cast_bool "$CORE" 'hasRole(bytes32,address)(bool)' "$ADMIN_ROLE" "$ADMIN_FACADE" || fail "AdminFacade must hold ADMIN_ROLE"
cast_bool "$CORE" 'hasRole(bytes32,address)(bool)' "$DEFAULT_ADMIN_ROLE" "$ADMIN_FACADE" || fail "AdminFacade must hold DEFAULT_ADMIN_ROLE"

if [[ -n "$DEPLOYER" ]]; then
  if cast_bool "$CORE" 'hasRole(bytes32,address)(bool)' "$ADMIN_ROLE" "$DEPLOYER"; then
    fail "deployer still holds ADMIN_ROLE"
  fi
  if cast_bool "$CORE" 'hasRole(bytes32,address)(bool)' "$DEFAULT_ADMIN_ROLE" "$DEPLOYER"; then
    fail "deployer still holds DEFAULT_ADMIN_ROLE"
  fi
  if cast_bool "$CORE" 'hasRole(bytes32,address)(bool)' "$OPERATOR_ROLE" "$DEPLOYER"; then
    fail "deployer still holds OPERATOR_ROLE"
  fi
fi

if [[ -n "$OPERATOR" ]]; then
  cast_bool "$CORE" 'hasRole(bytes32,address)(bool)' "$OPERATOR_ROLE" "$OPERATOR" || fail "OPERATOR does not hold OPERATOR_ROLE"
fi

actual_user_module="$(cast_addr "$CORE" 'userModule()(address)')"
actual_admin_module="$(cast_addr "$CORE" 'adminModule()(address)')"
actual_owner="$(cast_addr "$CORE" 'owner()(address)')"
delay_48="$(cast_call "$TIMELOCK_48" 'getMinDelay()(uint256)' | tr -d '[:space:]')"
delay_72="$(cast_call "$TIMELOCK_72" 'getMinDelay()(uint256)' | tr -d '[:space:]')"

[[ "$(lower "$actual_user_module")" == "$(lower "$USER_MODULE")" ]] || fail "userModule mismatch: $actual_user_module != $USER_MODULE"
[[ "$(lower "$actual_admin_module")" == "$(lower "$ADMIN_MODULE")" ]] || fail "adminModule mismatch: $actual_admin_module != $ADMIN_MODULE"
[[ "$(lower "$actual_owner")" == "$(lower "$ADMIN_FACADE")" ]] || fail "owner mismatch: $actual_owner != $ADMIN_FACADE"
[[ "$delay_48" == "172800" ]] || fail "48h timelock delay mismatch: $delay_48"
[[ "$delay_72" == "259200" ]] || fail "72h timelock delay mismatch: $delay_72"

if [[ "$failures" -gt 0 ]]; then
  printf 'Post-deployment verification failed with %s blocker(s).\n' "$failures" >&2
  exit 1
fi

printf 'Post-deployment verification passed.\n'
