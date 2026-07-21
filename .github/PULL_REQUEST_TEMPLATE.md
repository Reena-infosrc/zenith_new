<!--
PR format aligned to docs/SOP_Zenith.docx §9.2 (Promotion & Approval Flow)
and §16 (Change Management). Fill in every section — a PR merging to
staging or main is a Change Request, whether or not a separate CR ticket
exists elsewhere.
-->

## Summary
<!-- What changed, in 1-3 sentences. -->

## Business justification
<!-- Why this change is needed — bug impact, feature request, security fix, etc. -->

## Type of change
- [ ] `feat` — new capability
- [ ] `fix` — bug fix
- [ ] `perf` — performance improvement
- [ ] `refactor` — no behavior change
- [ ] `docs` — documentation only
- [ ] `chore` / `build` / `ci` — tooling, config, pipeline
- [ ] `security` — security-relevant change (see checklist below)

## Impact assessment
- **Affected area(s):** <!-- frontend / backend / infra (serverless.yml, IAM, KMS) / data model -->
- **Backward-compatible?** yes / no — if no, explain and reference the API
  versioning policy (SOP §7.5)
- **Infra changes?** yes / no — if yes, this PR requires Infrastructure
  Owner sign-off in addition to code review (SOP §16)

## Rollback plan
<!-- How does this get undone if it breaks staging/prod? Reference SOP §9.4
if the default rolling-deploy / re-deploy-previous-image process applies,
or describe a different plan if it doesn't (e.g. data migration). -->

## Testing evidence
- [ ] Ran locally and verified the change
- [ ] `npm run lint` passes (frontend)
- [ ] Backend unit/integration tests pass, if applicable
- [ ] Tested on `staging` before requesting merge to `main`
<!-- Paste screenshots, logs, or a short description of what was verified. -->

## Security checklist (required if "security" is checked above, optional otherwise)
- [ ] No secrets, credentials, or PII added to code, logs, or committed files
- [ ] `pre-commit run --all-files` passes locally (gitleaks + hygiene + commitlint)
- [ ] New/changed endpoints have explicit authorization checks
- [ ] No new wildcard IAM permissions introduced

## Checklist
- [ ] This PR targets `staging` (not directly `main`, unless it's an
      approved hotfix per SOP §16 "Emergency Changes")
- [ ] Commit messages follow Conventional Commits (`commitlint.config.cjs`)
- [ ] `CHANGELOG.md` updated under `[Unreleased]` if this is a notable change
- [ ] Reviewer(s) assigned; Code Owners auto-requested via `.github/CODEOWNERS`
