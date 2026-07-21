# Joiner — Developer Onboarding

Checklist for bringing a new developer (employee or contractor) onto Zenith
HR Pulse. Owner column = who should actually perform that step; fill in real
names/roles for your team before relying on this.

## 0. Before day one

| Step | Owner | Notes |
|---|---|---|
| Confirm employment/contract is active in Entra ID (this *is* the employee JML Joiner step — see `docs/ENTERPRISE-GOVERNANCE-AND-JML.md`) | HR / IT | The app's own employee record is provisioned automatically once this exists — `backend/sync_azure_ad_to_db.py` |
| Decide the developer's default role: `admin` (HR admin table access) or standard contributor | Eng lead | Most developers should **not** be added to the `zenith-hr-admin-*` DynamoDB table — that grants HR data admin rights in the running app, unrelated to code access |
| Pick GitHub team/role (read, write, or maintain) | Repo owner | See [access-matrix.md](access-matrix.md) |

## 1. GitHub access

- Add to the `infosrv-zenith-hr-pulse` repo (org: `infoservices-dev`) with
  the role decided above.
- Confirm `CODEOWNERS` (once added — see production-readiness assessment,
  DevOps §13) reflects who reviews their PRs.
- Point them at `README.md` → **Git Hooks** section: they must run
  ```bash
  pip install pre-commit
  npm install
  pre-commit install --hook-type pre-commit --hook-type commit-msg
  ```
  before their first commit. Without this, gitleaks and commitlint don't run
  locally — CI is not yet configured to gate on them either (see
  `docs/PRODUCTION-READINESS-ASSESSMENT.md`, DevOps §13, item #5), so this
  step is currently the *only* enforcement.

## 2. Local environment setup

Follow `README.md` §"Installation & Setup" for the full sequence. Summary:

**Backend** (`backend/`)
- Python 3.11 (matches `backend/Dockerfile` and the tracked `.pyc` cache
  files' interpreter version).
- `pip install -r backend/requirements.txt`.
- Copy `backend/.env.staging` as a starting point for local `.env` — **never
  commit real values**; `.gitignore` now blanket-ignores `.env*` except
  `.env.example` (create one if it doesn't exist yet).
- Needs: `AZURE_MSAL_TENANT_ID`, `AZURE_MSAL_CLIENT_ID` (ask IT/security —
  same values used by staging), a `SECURITY_SECRET_KEY` (generate locally,
  32+ random bytes — `python -c "import secrets; print(secrets.token_hex(32))"`).
  Local/dev does **not** need this to be strong; `backend/app/security_config.py`
  only hard-fails on weak secrets in `production/staging/uat/preprod/preview`.

**Frontend** (repo root)
- Node 20 (matches `.github/workflows/deploy.yml`).
- `npm install --legacy-peer-deps` (matches CI's install flag).
- `VITE_API_BASE`, `VITE_MSAL_CLIENT_ID`, `VITE_MSAL_TENANT_ID` env vars —
  same Entra app registration as backend.

**Run it:**
```bash
# backend
cd backend && uvicorn app.main:app --reload --port 5000
# frontend
npm run dev
```

## 3. AWS access

Most day-to-day development does **not** require AWS console access — the
app talks to DynamoDB/S3/Bedrock via IAM roles at runtime (ECS task role,
see `backend/serverless.yml` → `ZenithAppTaskRole`), not developer
credentials.

Grant AWS access only if the role requires it:

| Need | Grant | Scope |
|---|---|---|
| Debug staging/prod data directly | Read-only IAM user/role, DynamoDB console access to `zenith-hr-*-staging` tables only | Staging first; prod only with explicit sign-off |
| Run deploys manually / debug CI | IAM user matching `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` used in `.github/workflows/deploy.yml` secrets | Prefer: don't — let CI do it |
| Run one-off scripts (`backend/sync_azure_ad_to_db.py`, `backend/migrate_to_aws.py`, etc.) | Scoped credentials, time-boxed | These write directly to prod tables — treat as high-risk regardless of role |

**Do not** hand out the CI's own `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`
GitHub secrets to a human. Issue a separate, named IAM identity so actions
are attributable.

## 4. Azure access

- **Entra ID account**: already required for the developer to log into the
  app itself (MSAL). This is provisioned by IT as part of the employee
  Joiner flow, not a separate developer grant.
- **Azure Portal / App Registration access**: only needed if the developer
  will manage the MSAL app registration, JWKS/tenant config, or Conditional
  Access policy. Default: no. Grant via the Entra admin, scoped to that one
  App Registration, not the tenant.

## 5. Secrets & config

- Developer should **never** receive `SECURITY_SECRET_KEY`, `ACM_CERTIFICATE_ARN`,
  or any value listed as a GitHub Actions secret in `.github/workflows/deploy.yml`
  for staging/prod. Local dev uses its own locally-generated secret (§2).
- If the team adopts Secrets Manager/SSM (recommended — see production
  readiness assessment, Security §11, item #1), grant read access to the
  specific parameter path for their environment only.

## 6. Knowledge transfer

Work through [kt-technical-guide.md](kt-technical-guide.md) with whoever is
running KT. Suggested session order:
1. Architecture overview (frontend/backend/AWS split).
2. Auth flow (Entra → JWKS → app JWT) — this trips up most new developers.
3. Data model (DynamoDB tables, field encryption allowlist).
4. One walkthrough of a real feature end-to-end (e.g. the employee directory:
   `src/pages/Directory.tsx` → `src/hooks/use-employees.ts` →
   `backend/app/routers/employees.py` → `backend/app/services/*`).
5. CI/CD walkthrough (`.github/workflows/deploy.yml`, `backend/serverless.yml`).

## 7. First-week checklist

- [ ] Can run frontend + backend locally and log in via Entra.
- [ ] Has read `README.md`, this folder, and `docs/SECURITY-ASSESSMENT.md`.
- [ ] Git hooks installed and verified (`git commit` triggers gitleaks +
      commitlint locally).
- [ ] Knows where to find: employee/JML doc, security assessment,
      production-readiness assessment, field-encryption design doc.
- [ ] Knows the branch model (`main` = prod, `staging` = staging, feature
      branches off `staging`) and that pushes to `main`/`staging` trigger a
      real deploy (`.github/workflows/deploy.yml`).
- [ ] Knows commit convention (`commitlint.config.cjs`) and that notable
      changes go in `CHANGELOG.md`.
