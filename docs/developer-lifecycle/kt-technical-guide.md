# Technical KT Guide

Working notes for the knowledge-transfer session(s) run during
[01-joiner-onboarding.md](01-joiner-onboarding.md) §6. This is a map, not a
tutorial — read the linked files for the real detail.

## 1. What this app is

An HR platform: employee directory, org hierarchy, performance
reviews/goals, feedback, recruitment, leave, compensation, an engagement
module, and an AI assistant. React/TypeScript SPA talking to a FastAPI
backend, both on AWS, identity via Azure Entra ID.

## 2. The stack, concretely

| Layer | Tech | Where |
|---|---|---|
| Frontend | React + TypeScript + Vite + Tailwind + shadcn/ui | `src/` |
| Backend | FastAPI (Python 3.11), Mangum (Lambda-compatible ASGI), gunicorn | `backend/app/` |
| Data | DynamoDB (~20 tables, on-demand billing) | `backend/app/database_dynamodb.py`, table defs in `backend/serverless.yml` |
| Object storage | S3, private, presigned URLs only | `backend/app/services/s3_service.py` |
| Encryption | AWS KMS (envelope encryption for select DB fields) | `backend/app/services/field_crypto.py` |
| AI | AWS Bedrock (Claude) | `backend/app/services/bedrock_service.py` |
| Identity | Azure Entra ID (MSAL), JWKS validation, app-issued JWT | `backend/app/security.py` |
| Hosting | ECS Fargate behind an ALB; frontend on S3 + CloudFront | `backend/serverless.yml` |
| CI/CD | GitHub Actions → ECR → `serverless deploy` → force ECS redeploy → S3/CloudFront | `.github/workflows/deploy.yml` |

## 3. Auth flow (the part that trips people up)

```
Browser → MSAL login popup → Entra ID → Entra access token
   → POST to backend (exchange) → backend validates via JWKS
   → backend issues its OWN short-lived app JWT (HS256, 15 min)
   → browser uses that app JWT as Bearer token on every API call
```

Key point: **two different tokens exist.** The Entra token proves who you
are to Microsoft; the app JWT is what the FastAPI backend actually checks
on every request (`backend/app/security.py:get_current_user`). Don't
confuse "my Entra login works" with "my app JWT is valid" when debugging
401s.

`JWKSValidator` (`security.py:20`) pins the **tenant** (never trusts the
token's own `tid`) and the **audience** (only this app's `client_id`,
never `https://graph.microsoft.com`) — this is deliberate hardening against
cross-tenant/cross-app token replay. If you're debugging an auth failure and
tempted to "just accept the token's own tenant," don't — read the comments
in that file first.

Admin/leadership status is **never** trusted from the token — it's resolved
server-side on every request by querying the `admins` /
`leadership_access` DynamoDB tables (`security.py:224`,
`services/review_authorization.py`).

## 4. Authorization model

Five effective principals, all resolved server-side:
**Admin** → **Leadership** → **Manager (of the record being viewed)** →
**Self** → **Coworker (redacted view)**.

The core logic lives in `backend/app/services/employee_authorization.py`:
- `can_view_employee_full()` — can this viewer see the unredacted record?
- `redact_employee_record()` — strip a sensitive-field allowlist otherwise.
- `require_employee_write_access()` — only self or privileged HR can write;
  **managers are view-only**, deliberately.

Read `docs/ENTERPRISE-GOVERNANCE-AND-JML.md` §3 for the full model and file:line references.

## 5. Data model essentials

- DynamoDB, mostly single-table-per-entity (`employees`, `admins`,
  `reviews`, `goals`, `feedback`, `recruitment`, `clients`, …), each with
  several GSIs for the query patterns the app needs (see table defs in
  `backend/serverless.yml`).
- `employees` table: `reporting_to` field is how the org hierarchy is
  represented — it's an employee ID pointing at their manager's record, not
  a separate hierarchy table.
- **Field-level encryption** (opt-in per environment): a small allowlist of
  sensitive fields get AES-256-GCM + KMS envelope encryption at rest. See
  `docs/field-encryption.md` and `backend/app/services/field_crypto.py`.
  Most fields are plaintext; only the allowlisted ones are transformed.
- **In-memory caching**: the employee list endpoint caches the full scan
  result for 120s (`backend/app/routers/employees.py`) to avoid re-scanning
  DynamoDB on every request; writes invalidate it.

## 6. A real end-to-end walkthrough (do this in the KT session)

Trace the employee directory feature through every layer:

1. `src/pages/Directory.tsx` — the page component, grid/list/hierarchy views.
2. `src/hooks/use-employees.ts` — data fetching hook. Note the progressive
   load (first page fast, then full list), the 30s `AbortController`
   timeout per request, and the global in-module cache (`globalEmployees`)
   shared across every component using this hook.
3. `backend/app/routers/employees.py` — `GET /api/employees`. Follow how it
   decides fast-first-page vs. full-scan, applies the 120s cache, filters
   inactive employees, then redacts per-viewer before returning.
4. `backend/app/services/employee_authorization.py` — the redaction logic
   invoked above.
5. `backend/app/services/s3_service.py` — how `photo_url` becomes a
   presigned image URL for each row.

Doing this one trace clarifies the frontend↔backend contract, the caching
strategy, and the authorization model all at once.

## 7. Running it locally

See [01-joiner-onboarding.md](01-joiner-onboarding.md) §2 for the full
setup. Short version:

```bash
# backend
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 5000

# frontend (repo root, separate terminal)
npm install --legacy-peer-deps
npm run dev
```

Local dev needs `AZURE_MSAL_TENANT_ID`/`AZURE_MSAL_CLIENT_ID` (ask for
these — same values staging uses) and a self-generated `SECURITY_SECRET_KEY`.
`backend/app/security_config.py` only enforces a *strong* secret in
production-like environments (`production/staging/uat/preprod/preview`);
local dev just warns.

## 8. Deployment pipeline

Push to `staging` or `main` → `.github/workflows/deploy.yml`:
1. Builds the backend Docker image, pushes to ECR (scanned on push).
2. Runs `serverless deploy` (only if `backend/serverless.yml` or the stage's
   env file changed) — this is the Infrastructure-as-Code step; see
   `backend/serverless.yml` for the full ECS/ALB/CloudFront/DynamoDB/KMS
   stack definition.
3. Forces an ECS service redeploy so the new image is actually pulled
   (`aws ecs update-service --force-new-deployment`).
4. Builds the frontend (`npm run build`), syncs to S3 in a specific
   order (hashed assets first, `index.html` last, verified in between) to
   avoid a window where `index.html` references assets that don't exist
   yet — read the comments in that workflow step before "simplifying" it.
5. Invalidates CloudFront.

There is **no test/lint gate** in this pipeline yet and **no branch
protection** — a push to `staging` or `main` deploys, full stop. See
`docs/PRODUCTION-READINESS-ASSESSMENT.md` DevOps §13 for what's planned to
close that gap. Until it is: be deliberate about what you push to these
branches.

## 9. Where things live — quick index

| Looking for… | Look here |
|---|---|
| Auth / JWT / JWKS | `backend/app/security.py`, `security_config.py` |
| Authorization / redaction | `backend/app/services/employee_authorization.py`, `review_authorization.py`, `feedback_authorization.py` |
| Field encryption | `backend/app/services/field_crypto.py`, `docs/field-encryption.md` |
| S3 / photo & attachment handling | `backend/app/services/s3_service.py`, `s3_bucket_hardening.py` |
| Employee JML (Entra sync) | `backend/sync_azure_ad_to_db.py`, `backend/fetch_azure_ad_users.py` |
| Infra (all of it) | `backend/serverless.yml` |
| CI/CD | `.github/workflows/deploy.yml` |
| Feature flags | `backend/app/feature_flags.py` |
| Rate limiting | `backend/app/rate_limit.py` |
| Git hooks / secret scanning / commit convention | `.pre-commit-config.yaml`, `.gitleaks.toml`, `commitlint.config.cjs` |
| Governance / security / JML analysis | `docs/ENTERPRISE-GOVERNANCE-AND-JML.md`, `docs/PRODUCTION-READINESS-ASSESSMENT.md`, `docs/SECURITY-ASSESSMENT.md` |
| This folder | `docs/developer-lifecycle/` |

## 10. Things that will surprise you

- **Two separate DB module histories exist**: `backend/app/database.py`,
  `database_new.py`, and `database_dynamodb.py`. The one actually in use is
  `database_dynamodb.py` — check imports before assuming otherwise.
- **`backend/app/main.py` has ~200 lines of commented-out legacy code** at
  the top before the real app definition starts. It's inert; don't let it
  confuse you about what's actually running.
- **`.pyc` files used to be tracked in git** (fixed — see `CHANGELOG.md`).
  If you ever see the working tree go "dirty" right after running Python
  locally with no edits of your own, that class of bug is what it was; it
  shouldn't recur now that `.gitignore` blanket-ignores `__pycache__/`.
- **Employee records `status=inactive` is a *soft* signal, not a hard
  boundary.** `DELETE /api/employees/{id}` is a real, irreversible hard
  delete — see `docs/PRODUCTION-READINESS-ASSESSMENT.md` §5 for why that's
  flagged as a risk.
