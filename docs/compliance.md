# Compliance and User Risk Boundaries

This document is not legal advice. It records engineering assumptions that may need legal, compliance, or business approval before production.

## Data and Privacy

- Contracts store public wallet addresses and financial positions on-chain.
- The frontend should avoid collecting unnecessary personal data.
- Any analytics provider must be documented as an external dependency.
- There is no on-chain deletion capability for historical transactions.

## Financial and Product Claims

- APY and USD values are indicative UI displays unless explicitly backed by a reviewed oracle.
- The contracts do not guarantee profit, fixed yield, or principal protection.
- FOT outbound tax is borne by the recipient; UI must not present gross transfer as guaranteed wallet net.
- `forceClaimAll` may partially pay during shutdown or bad debt conditions.

## Jurisdiction and Access

Before production, the project owner must decide:

- whether any jurisdictions are blocked;
- whether the frontend needs terms acceptance;
- whether TokenA/TokenB distribution has additional restrictions;
- whether sanctions screening or other access controls are required.

## Third Parties

Document and review:

- RPC providers;
- hosting provider;
- monitoring provider;
- block explorer API;
- wallet connection providers;
- analytics providers, if any.

## Compliance Launch Gate

Launch must not proceed until the production owner records:

- approved user-facing risk disclosures;
- public security contact;
- vulnerability disclosure or bug bounty decision;
- token risk review;
- privacy/analytics decision.

