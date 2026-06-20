# ADR 0004: FOT Gross Accounting With Recipient-Borne Outbound Tax

## Status

Accepted.

## Context

TokenB may be fee-on-transfer within a configured cap. If the protocol attempted to make recipients whole after outbound tax, shared pools would subsidize transfer-tax recipients and accounting would become token-policy dependent.

## Decision

Use balance-delta accounting for inbound transfers. For outbound transfers, debit the gross protocol liability and transfer that gross amount. Any outbound FOT tax is borne by the recipient, bounded by `maxTransferFeeBP`, and must be disclosed by the frontend.

## Consequences

Positive:

- Protocol liabilities remain deterministic.
- Shared reward budgets do not subsidize transfer-tax recipients.
- A single max-fee cap protects users from unexpectedly high tax.

Negative:

- Wallet net may be lower than claim/withdraw gross.
- Frontend and docs must be explicit about gross vs net.
- Integrators must not treat emitted or debited gross as guaranteed wallet receipt.

## Rejected Alternatives

- Top up recipients to net target: unfair to other stakers and can break accounting.
- Reject all FOT tokens: simpler, but incompatible with the desired TokenB policy.

