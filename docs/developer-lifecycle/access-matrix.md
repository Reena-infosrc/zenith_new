# Developer Access Matrix

Quick reference for every system a developer might need, what "access"
means concretely in this repo, and who owns granting/revoking it. Use this
table directly when running [01-joiner-onboarding.md](01-joiner-onboarding.md),
[02-mover-role-change.md](02-mover-role-change.md), or
[03-leaver-offboarding.md](03-leaver-offboarding.md).

| System | What access looks like | Default for new developer | Owner (grant/revoke) | Notes |
|---|---|---|---|---|
| **GitHub — repo** (`infosrv-zenith-hr-pulse`) | `read` / `write` / `maintain` / `admin` role | `write` | Repo owner / org admin | `maintain`+ only for people who review/merge to `staging`/`main` |
| **GitHub — branch protection** (once configured) | Listed as required reviewer / allowed to bypass | Not a bypasser | Repo owner | See production-readiness assessment DevOps §13, item #4 |
| **Azure Entra ID — app login** | Entra account provisioned, can obtain MSAL token for this app's App Registration | Yes (required to use the app at all) | IT / HR (employee Joiner process) | This is what actually lets someone log into the running app — see `backend/app/security.py` |
| **Azure Entra ID — App Registration admin** | Can edit the MSAL app registration, redirect URIs, API permissions, Conditional Access tied to it | No | Azure/Entra admin | Only for whoever owns auth infra |
| **AWS — read-only console/IAM (staging)** | Can view DynamoDB tables, S3 objects, CloudWatch logs for `*-staging` resources | No (grant on request) | AWS account admin | Prefer this over full access for debugging |
| **AWS — read-only console/IAM (prod)** | Same, for `*-prod` resources | No | AWS account admin | Requires explicit sign-off; log the grant |
| **AWS — deploy-capable IAM** | Credentials matching what CI uses to run `serverless deploy` / push to ECR | No — CI should hold this, not a person | AWS account admin | If a human genuinely needs this, issue a **separate named identity**, never share the CI's own `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` |
| **AWS — one-off script execution** (`sync_azure_ad_to_db.py`, `migrate_to_aws.py`, `backend/app/scripts/*`) | Time-boxed credentials with write access to specific tables | No | AWS account admin + eng lead sign-off | These write directly to prod data — treat every use as high-risk regardless of who's running it |
| **GitHub Actions secrets** (`.github/workflows/deploy.yml`) | Knowledge of `SECURITY_SECRET_KEY`, `ACM_CERTIFICATE_ARN`, AWS keys, etc. | No | Repo admin (GitHub secrets UI) | Never exported to a person; CI-only by design |
| **App admin** (`zenith-hr-admin-{stage}` DynamoDB table) | HR-data admin inside the *running app* — bulk employee edits, reporting-line changes, admin management | No | An existing app admin, via `POST /api/employees/admins` | Unrelated to any of the above — see `backend/app/services/employee_authorization.py`. Do not conflate "senior developer" with "app admin" |
| **App leadership access** (`zenith-hr-leadership-access` table) | Org-wide read of unredacted employee data | No | An existing app admin | Same caution as app admin — this is an HR data privilege, not a dev privilege |
| **Local dev secrets** (`SECURITY_SECRET_KEY`, etc. in a local `.env`) | Self-generated, dev-only value (see joiner doc §2) | Yes, self-generated | Developer generates their own | Never share a real staging/prod secret for local dev use |
| **Slack / Teams project channels** | Membership in project communication channels | Yes | Whoever manages the workspace | Out of this repo's scope to enforce, but part of the checklist |
| **`docs/` (this repo's documentation)** | Read access — comes with repo access | Yes | — | No separate grant needed |

## How to use this table

- **Joiner:** work top to bottom, grant only what §0 of the joiner doc
  decided they need this week.
- **Mover:** re-derive the whole row set for their new role; don't just add
  the new row and leave the old ones.
- **Leaver:** every "Yes" or granted row above must be revoked. Verify with
  the checklist in the leaver doc, not just memory.
