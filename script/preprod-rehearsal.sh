#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

printf 'Running pre-production rehearsal checks...\n'

printf '\n[1/7] Solidity unit/integration tests\n'
env -u ETHERSCAN_API_KEY forge test --offline

printf '\n[2/7] Static analysis\n'
env -u ETHERSCAN_API_KEY make static-analysis

printf '\n[3/7] Production readiness gate\n'
if [[ "${ALLOW_BLOCKED_PRODUCTION_READINESS:-false}" == "true" ]]; then
  if ! make production-readiness; then
    printf 'WARN: production readiness failures were allowed for rehearsal only.\n'
  fi
else
  make production-readiness
fi

printf '\n[4/7] Frontend production env gate\n'
if [[ "${ALLOW_BLOCKED_FRONTEND_ENV:-false}" == "true" ]]; then
  if ! bash script/check-frontend-production-env.sh; then
    printf 'WARN: frontend env failures were allowed for rehearsal only.\n'
  fi
else
  bash script/check-frontend-production-env.sh
fi

printf '\n[5/7] Frontend contract sync\n'
if [[ "${ALLOW_BLOCKED_FRONTEND_ENV:-false}" == "true" ]]; then
  if ! make frontend-contract-sync; then
    printf 'WARN: frontend contract sync failures were allowed for rehearsal only.\n'
  fi
else
  make frontend-contract-sync
fi

printf '\n[6/7] Post-deploy chain verification\n'
if [[ "${ALLOW_BLOCKED_POST_DEPLOY_VERIFY:-false}" == "true" ]]; then
  if ! make post-deploy-verify; then
    printf 'WARN: post-deploy verification failures were allowed for rehearsal only.\n'
  fi
else
  make post-deploy-verify
fi

printf '\n[7/7] Frontend production build\n'
(cd frontend && pnpm run build)

printf '\nPre-production rehearsal checks completed.\n'
