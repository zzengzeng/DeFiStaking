#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

CHAIN_ID="${CHAIN_ID:-11155111}"
BROADCAST="${BROADCAST:-broadcast/DualPoolStaking.s.sol/${CHAIN_ID}/run-latest.json}"
FRONTEND_ENV="${FRONTEND_ENV:-frontend/.env.local}"

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

env_value() {
  local key="$1"
  grep -E "^${key}=" "$FRONTEND_ENV" | tail -1 | cut -d= -f2- | tr -d '"' | tr -d "'"
}

compare_env() {
  local key="$1"
  local expected="$2"
  local actual
  actual="$(env_value "$key")"
  if [[ -z "$actual" ]]; then
    fail "$key missing from $FRONTEND_ENV"
  elif [[ "$(lower "$actual")" != "$(lower "$expected")" ]]; then
    fail "$key mismatch: $actual != $expected"
  fi
}

require_abi_function() {
  local contract="$1"
  local frontend_file="$2"
  local fn="$3"
  if ! forge inspect "$contract" abi --offline --json | jq -e --arg fn "$fn" '.[] | select(.type == "function" and .name == $fn)' >/dev/null; then
    fail "$contract ABI missing function: $fn"
  fi
  if ! rg -q "name: \"${fn}\"" "$frontend_file"; then
    fail "$frontend_file missing frontend ABI function: $fn"
  fi
}

printf 'Running frontend contract sync checks...\n'

command -v jq >/dev/null 2>&1 || fail "missing required tool: jq"
if [[ ! -f "$BROADCAST" ]]; then
  fail "broadcast file not found: $BROADCAST"
fi
if [[ ! -f "$FRONTEND_ENV" ]]; then
  fail "frontend env file not found: $FRONTEND_ENV"
fi
if [[ "$failures" -gt 0 ]]; then
  exit 1
fi

STAKING="$(extract_addr '^DualPoolStaking$')"
USER_MOD="$(extract_addr 'DualPoolUserModule')"
ADMIN_MOD="$(extract_addr 'DualPoolAdminModule')"
ADMIN_FACADE="$(extract_addr 'DualPoolStakingAdmin')"
TL_48="$(jq -r '.transactions[] | select(.contractName == "TimelockController") | .contractAddress' "$BROADCAST" | sed -n '1p')"
TL_72="$(jq -r '.transactions[] | select(.contractName == "TimelockController") | .contractAddress' "$BROADCAST" | sed -n '2p')"

compare_env NEXT_PUBLIC_DUAL_STAKING_ADDRESS "$STAKING"
compare_env NEXT_PUBLIC_DUAL_POOL_USER_MODULE_ADDRESS "$USER_MOD"
compare_env NEXT_PUBLIC_DUAL_POOL_ADMIN_MODULE_ADDRESS "$ADMIN_MOD"
compare_env NEXT_PUBLIC_STAKING_ADMIN_FACADE_ADDRESS "$ADMIN_FACADE"
compare_env NEXT_PUBLIC_TIMELOCK_CONTROLLER_ADDRESS "$TL_48"
compare_env NEXT_PUBLIC_TIMELOCK_SUPER_CONTROLLER_ADDRESS "$TL_72"

core_abi="frontend/src/contracts/abis/dualPoolStaking.ts"
admin_abi="frontend/src/contracts/abis/dualPoolStakingAdmin.ts"
timelock_abi="frontend/src/contracts/abis/timelockController.ts"

for fn in stakeA stakeB withdrawA withdrawB claimA claimB compoundB emergencyWithdrawA emergencyWithdrawB forceClaimAll notifyRewardAmountA notifyRewardAmountB poolA poolB hasRole userModule adminModule owner DEFAULT_ADMIN_ROLE; do
  require_abi_function src/DualPoolStaking.sol:DualPoolStaking "$core_abi" "$fn"
done

for fn in rebalanceBudgets resolveBadDebt recoverToken activateShutdown forceShutdownFinalize setUserModule setAdminModule setOperator unpause; do
  require_abi_function src/DualPoolStakingAdmin.sol:DualPoolStakingAdmin "$admin_abi" "$fn"
done

for fn in getMinDelay hashOperation getOperationState getTimestamp schedule execute cancel hasRole; do
  require_abi_function TimelockController "$timelock_abi" "$fn"
done

if [[ "$failures" -gt 0 ]]; then
  printf 'Frontend contract sync checks failed with %s blocker(s).\n' "$failures" >&2
  exit 1
fi

printf 'Frontend contract sync checks passed.\n'
