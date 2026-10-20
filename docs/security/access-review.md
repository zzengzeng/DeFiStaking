# Access Review and Offboarding

Access review is required monthly and before every production deployment.

## Systems in Scope

- GitHub repository, branch protection, CODEOWNERS, Actions secrets
- Multisigs and Timelock roles
- Frontend hosting and DNS
- RPC providers and block explorer API keys
- Monitoring, alerting, and incident communication channels
- Security disclosure inbox
- Deployment machines and hardware wallets

## Monthly Review Checklist

| Check | Evidence | Status |
| --- | --- | --- |
| All production signers are current team members or approved external custodians | Signer list and approval ticket | `TBD` |
| GitHub admins and maintainers are still required | GitHub access export | `TBD` |
| CODEOWNERS maps to real active users/teams | CODEOWNERS review | `TBD` |
| Branch protection requires review and passing CI | Repository rules screenshot/export | `TBD` |
| Actions secrets are minimal and rotated where needed | Secret inventory | `TBD` |
| Hosting/DNS accounts require hardware-key SSO | Provider access report | `TBD` |
| RPC and monitoring keys are least privilege | Provider access report | `TBD` |
| Offboarded users have no remaining access | Offboarding tickets | `TBD` |

## Offboarding Procedure

Complete within 24 hours for routine departure and immediately for hostile or suspicious departure.

1. Remove GitHub organization and repository access.
2. Remove multisig signer or schedule replacement through the relevant governance path.
3. Revoke hosting, DNS, RPC, monitoring, and disclosure inbox access.
4. Rotate shared or possibly exposed credentials.
5. Verify no personal tokens remain in CI/CD or deployment environments.
6. Update `docs/security/security-owners.md` and the production address register.
7. Record completion evidence in the access review log.

