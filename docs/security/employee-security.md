# Employee and Contributor Security

This repository cannot store private HR records, but production readiness requires evidence that sensitive contributors are trusted and trained.

## Required Private Records

The organization must maintain private records for all people with production access:

- Verified legal identity where permitted by law.
- Background check or equivalent trust review where permitted by law.
- Signed confidentiality and acceptable-use agreements.
- Security training completion.
- Hardware-key enrollment.
- Access approval and offboarding history.

## Training Requirements

Before production access is granted, contributors must complete training on:

- Hardware wallet and FIDO2 key usage.
- Phishing and transaction simulation review.
- Timelock scheduling and cancellation.
- Incident response procedures.
- Handling vulnerability reports.
- Frontend transaction payload review.

## Separation of Duties

No single human should be able to:

- Replace a module and execute the change alone.
- Change Timelock roles and execute the change alone.
- Deploy frontend transaction changes without review.
- Receive, triage, and close a critical vulnerability report alone.
- Rotate keys without independent verification.

## Evidence Without Exposing Private Data

For audits, publish only:

- Count of trained production signers.
- Confirmation that identity/trust checks are complete.
- Confirmation that hardware keys are enrolled.
- Date of last access review.

Do not commit personal documents, IDs, background reports, recovery codes, private keys, seed phrases, or personal security answers.

