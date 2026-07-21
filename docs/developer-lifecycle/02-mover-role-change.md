# Mover — Role & Access Change

Covers a developer's scope changing while they stay on the project:
promotion to maintainer, moving between frontend/backend focus, taking on
infra/deploy responsibility, or picking up admin-level app access.

Unlike the employee JML Mover process (`sync_azure_ad_to_db.py` — manager/
department/location changes sourced from Entra), developer access changes
are **not automated**. Every change below is a manual, explicit grant.

## Principle: recalculate, don't accumulate

When a developer's role changes, re-derive their *whole* access set from
[access-matrix.md](access-matrix.md) for the new role — don't just add the
new permission on top of the old one. Access that made sense for their old
scope but not the new one should be removed in the same change.

## Common moves

### Contributor → Maintainer / Reviewer
- GitHub: `write` → `maintain`, add to `CODEOWNERS` for the paths they now
  own (once `CODEOWNERS` exists — see production-readiness assessment).
- No AWS/Azure change implied by itself.

### Frontend-focused → also touching backend/infra
- Grant `backend/` local dev access (already in the repo; this is really
  about ensuring they've done the backend section of
  [01-joiner-onboarding.md](01-joiner-onboarding.md) §2–3 if skipped
  originally).
- If they'll run deploys or debug ECS/CloudWatch: grant scoped AWS
  console/IAM access per [access-matrix.md](access-matrix.md), staging first.

### Developer → also an app admin user (HR data admin, not repo admin)
This is a **different system entirely** — it's a row in the
`zenith-hr-admin-{stage}` DynamoDB table (`backend/app/routers/admin.py`),
resolved at request time by `backend/app/security.py:get_current_active_user`.
It has nothing to do with GitHub/AWS/Azure roles above.

- Only grant this if the person genuinely needs HR-admin capability inside
  the running app (bulk employee edits, reporting-line changes, etc. — see
  `backend/app/services/employee_authorization.py`).
- Add via the existing admin-management endpoints (`POST /api/employees/admins`),
  by an existing admin — not by editing DynamoDB directly outside the app
  unless doing initial bootstrap (see `backend/seed_admin_data.py`,
  `backend/add_specific_admin.py`).
- **Do not** conflate "trusted senior developer" with "should be an app
  admin." Code access and HR-data access are separate privilege domains.

### Taking over deploy/release responsibility
- AWS: access to the `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` used by
  `.github/workflows/deploy.yml` should stay CI-only (see
  [01-joiner-onboarding.md](01-joiner-onboarding.md) §3) — this role is
  about being able to *read* deploy logs/CloudWatch and *trigger* deploys
  via git push/PR merge, not about holding the CI's own credentials.
- GitHub: ability to merge to `staging`/`main` (branch protection, once
  configured — see production-readiness assessment, DevOps §13, item #4).

## Checklist for any Mover event

- [ ] Identify old role and new role explicitly (write it down — in the
      access request, ticket, or PR description).
- [ ] Re-derive access from [access-matrix.md](access-matrix.md) for the new
      role.
- [ ] Grant what's newly needed.
- [ ] **Revoke what's no longer needed** — this step is the one that gets
      skipped in practice. Don't skip it.
- [ ] If the move includes app-admin access (above), grant/revoke through
      the app itself, not direct DB edits.
- [ ] Note the change somewhere durable (access review log — see production
      readiness assessment, Governance §16, "Access review / quarterly
      audit").
