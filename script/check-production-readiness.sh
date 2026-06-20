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

require_env() {
  local key="$1"
  local value="${!key:-}"
  if [[ -z "$value" ]]; then
    fail "missing required env: $key"
    return
  fi
}

require_address_env() {
  local key="$1"
  require_env "$key"

  local value="${!key:-}"
  if [[ -z "$value" ]]; then
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

require_not_deployer() {
  local key="$1"
  local deployer="${DEPLOYER_ADDRESS:-}"
  local value="${!key:-}"
  if [[ -n "$deployer" && -n "$value" && "$(lower "$value")" == "$(lower "$deployer")" ]]; then
    fail "$key must not equal DEPLOYER_ADDRESS in production"
  fi
}

printf 'Running production readiness checks...\n'

required_docs=(
  README.md
  PRD.md
  SECURITY.md
  CONTRIBUTING.md
  docs/architecture.md
  docs/contract-api.md
  docs/security/README.md
  docs/security/security-model.md
  docs/security/threat-model.md
  docs/security/dependencies.md
  docs/security/incident-response.md
  docs/security/key-management.md
  docs/security/static-analysis-findings.md
  docs/testing/test-strategy.md
  docs/release.md
  docs/upgrade-procedure.md
  docs/operations.md
  docs/monitoring.md
  docs/compliance.md
  docs/adr/0001-delegatecall-modules.md
  docs/adr/0002-tokenb-liability-model.md
  docs/adr/0003-governance-hot-cold-split.md
  docs/adr/0004-fot-gross-accounting.md
)

for doc in "${required_docs[@]}"; do
  if [[ ! -s "$doc" ]]; then
    fail "missing or empty required engineering document: $doc"
  fi
done

require_env PRODUCTION
if [[ "${PRODUCTION:-}" != "true" ]]; then
  fail "PRODUCTION must be exactly true"
fi

require_address_env DEPLOYER_ADDRESS
require_address_env GOVERNANCE_PROPOSER
require_address_env GOVERNANCE_EXECUTOR
require_address_env SUPER_PROPOSER
require_address_env SUPER_EXECUTOR
require_address_env OPERATOR

for key in GOVERNANCE_PROPOSER GOVERNANCE_EXECUTOR SUPER_PROPOSER SUPER_EXECUTOR OPERATOR; do
  require_not_deployer "$key"
done

if [[ -n "${GOVERNANCE_PROPOSER:-}" && -n "${GOVERNANCE_EXECUTOR:-}" && "$(lower "$GOVERNANCE_PROPOSER")" == "$(lower "$GOVERNANCE_EXECUTOR")" ]]; then
  fail "GOVERNANCE_PROPOSER and GOVERNANCE_EXECUTOR should be distinct production controls"
fi
if [[ -n "${SUPER_PROPOSER:-}" && -n "${SUPER_EXECUTOR:-}" && "$(lower "$SUPER_PROPOSER")" == "$(lower "$SUPER_EXECUTOR")" ]]; then
  fail "SUPER_PROPOSER and SUPER_EXECUTOR should be distinct production controls"
fi
if [[ -n "${OPERATOR:-}" ]]; then
  for key in GOVERNANCE_PROPOSER GOVERNANCE_EXECUTOR SUPER_PROPOSER SUPER_EXECUTOR; do
    value="${!key:-}"
    if [[ -n "$value" && "$(lower "$OPERATOR")" == "$(lower "$value")" ]]; then
      fail "OPERATOR must be separate from $key"
    fi
  done
fi

placeholder_pattern='TBD|BLOCKED|security@example\.com|ops@example\.com|@replace-with|No public bounty amount is committed'
placeholder_files=(
  SECURITY.md
  .github/CODEOWNERS
  docs/security
)

if grep -R -n -E "$placeholder_pattern" "${placeholder_files[@]}" >/tmp/defistaking-readiness-placeholders.txt 2>/dev/null; then
  cat /tmp/defistaking-readiness-placeholders.txt >&2
  fail "production placeholders or blocked launch gates remain"
fi

if [[ -f .env ]] && grep -n -E '^[[:space:]]*PRIVATE_KEY[[:space:]]*=' .env >/tmp/defistaking-readiness-private-key.txt 2>/dev/null; then
  sed -E 's/^([0-9]+):.*/.env:\1: PRIVATE_KEY is set/' /tmp/defistaking-readiness-private-key.txt >&2
  fail "production deploy must not rely on plaintext PRIVATE_KEY in .env; use DEPLOYER_ACCOUNT or another reviewed signer flow"
fi

if [[ "$failures" -gt 0 ]]; then
  printf 'Production readiness failed with %s blocker(s).\n' "$failures" >&2
  exit 1
fi

printf 'Production readiness checks passed.\n'
