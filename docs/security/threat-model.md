# Threat Model and Attack Playbook

This document records the best-known ways to attack the system so reviewers can test the intended defenses.

## Assets to Protect

- TokenA principal in Pool A
- TokenB principal in Pool B
- TokenB reward budgets and pending rewards
- `ADMIN_ROLE`, `DEFAULT_ADMIN_ROLE`, `OPERATOR_ROLE`, and Timelock authorities
- Frontend transaction payload integrity
- Accounting invariants and user-facing risk disclosures

## Main Attack Paths

| Attack path | Goal | Required defense |
| --- | --- | --- |
| Stake after long idle period | Let new stake share an old reward window | Catch up to `min(now, periodFinish)` before stake and reanchor only after old window is accounted |
| Notify after stale active schedule | Double count leftover plus stranded `availableRewards` | Carry only budget not already represented by temporal leftover |
| Rebalance active source budget | Move scheduled rewards while `rewardRate` continues | Reserve remaining emission budget and block moves above movable amount |
| Shutdown finalize with remaining stake | Sweep unsettled pending owed to remaining stakers | Preserve orphan pending when deadlock bypass is used with stake still present |
| FOT TokenB outbound mismatch | Make users think gross equals wallet net | Account by gross, enforce max fee, emit/label gross vs net |
| ERC777/callback token | Reenter around token transfers | NonReentrant, CEI, token allowlist, ERC1820 probes, no ERC777/rebasing/blacklist tokens |
| Bad debt repair through facade | Pull funds from wrong payer | Core receives explicit payer; governance must fund/approve that payer |
| Module pointer takeover | Replace delegatecall target with malicious logic | Super timelock, code-length checks, bytecode hash recording, multisig hardware keys |
| Frontend payload abuse | Trick users into signing unsafe calls | ABI encoding review, governance queue visibility, warning text for partial/FOT/shutdown states |
| Timelock role capture | Schedule malicious governance operation | Multisig signers, cancellers, monitoring of Timelock events |

## Abuse Against Users

The frontend and docs must avoid misleading users about:

- FOT gross vs net received.
- `forceClaimAll` partial payout order.
- Emergency mode forfeiture semantics.
- Shutdown/deadlock-bypass finalization.
- Timelock delay and queued operations.
- Indicative USD values when no oracle backs contracts.

## Required Tests

Every commit must run:

- `forge fmt --check`
- `forge build --sizes`
- `forge test -vvv`
- Slither static analysis, with any accepted findings documented.

High-risk changes should add or update tests for:

- TokenB invariant preservation.
- MAX_DELTA_TIME catch-up behavior.
- `availableRewards`, `totalPending`, `bookedUserRewards`, and `badDebt` transitions.
- Governance role and timelock restrictions.
- FOT inbound and outbound behavior.

