# Git Governance SOP — CODEOWNERS, Commit Convention & Branch Protection

## Document Control

| Field | Value |
|---|---|
| Document Title | Zenith HR Pulse — Git Governance SOP |
| Application Name | Zenith HR Pulse |
| Version | 1.0 |
| Prepared By | Mayoori Peradka (Code Owner) |
| Reviewed By | *(pending — Infrastructure Owner: Sakthivel Saravanan)* |
| Approved By | *(pending — Application Owner: Prasanna Balaji)* |
| Last Updated | 21 July 2026 |
| Companion document | `docs/SOP_Zenith.docx` — this SOP implements and closes gaps against §7.2 (Branching Strategy), §7.3 (Code Review), §9.2 (Promotion & Approval Flow), and §16 (Change Management) of that document |

### Revision History

| Version | Date | Description | Author |
|---|---|---|---|
| 1.0 | 21 July 2026 | Initial version — end-to-end analysis of git governance state, implemented CODEOWNERS/PR template/issue templates/CI enforcement, documented branch-protection runbook | Mayoori Peradka |

---

## 1. Purpose

`docs/SOP_Zenith.docx` §9.2 states: *"Direct commits to main are not permitted: main is a protected branch, and every production release flows through a reviewed and approved Pull Request with an auditable trail."*

This document verifies that claim against the actual repository state, closes the gaps found, and defines the concrete, checkable configuration (CODEOWNERS, commit convention, PR/issue templates, CI enforcement, and GitHub branch protection) that makes it true rather than aspirational.

## 2. Scope

Covers: commit message convention, code ownership and required reviewers, pull request structure, CI-enforced quality gates, and GitHub branch protection rules for `main` and `staging`. Does not cover application-level authorization (see `docs/ENTERPRISE-GOVERNANCE-AND-JML.md`) or infrastructure IAM (see `docs/PRODUCTION-READINESS-ASSESSMENT.md` §2).

---

## 3. End-to-End Analysis — What Was Actually True Before This Change

| Control claimed by SOP §7.2/§7.3/§9.2 | Verified repo state (before this change) | Method |
|---|---|---|
| "PR requires at least one peer review approval" | ❌ Not enforced — no branch protection rule found | No `gh` admin access available to confirm via API; empirically, a direct `git push --force-with-lease origin staging` from this session succeeded with zero blocking on an earlier date, which is inconsistent with an active "require PR" rule |
| "Automated quality gates (ESLint and a successful build) must pass" | ❌ Not enforced in CI | `.github/workflows/deploy.yml` only builds and deploys on push to `main`/`staging` — it has no `pull_request` trigger and never runs `npm run lint` or tests as a gate |
| "main is a protected branch" | ❌ Unverified / evidence suggests not configured | Same as above — no protection API access, and observed direct pushes succeeding |
| Commit convention | 🟡 Partial | `commitlint.config.cjs` + `.pre-commit-config.yaml` exist and work **locally**, but nothing stops a commit that skips local hook setup from reaching `staging`/`main` |
| Secret scanning | 🟡 Partial | `.gitleaks.toml` + `.pre-commit-config.yaml` exist and work **locally**, same gap as above |
| Code ownership / required reviewers | ❌ Missing entirely | No `.github/CODEOWNERS` file existed |
| PR structure / change-request fields (SOP §16: description, justification, impact, rollback, staging evidence) | ❌ Missing entirely | No `.github/PULL_REQUEST_TEMPLATE.md` existed |
| Issue intake / severity triage (SOP §14) | ❌ Missing entirely | No `.github/ISSUE_TEMPLATE/` existed |

**Conclusion:** the process SOP §9.2 describes was the *intended* target state, not the *actual* enforced state. This document closes that gap where it can be closed from the repository alone, and hands off the one piece that requires GitHub admin action (branch protection) as an explicit runbook.

---

## 4. What This Change Implements

| Control | File | Enforced where | Status |
|---|---|---|---|
| Code ownership | `.github/CODEOWNERS` | GitHub PR review UI, **once** branch protection's "Require review from Code Owners" is enabled (§6) | ✅ Identities resolved — see §5; enforcement itself still needs §6 applied |
| PR change-request format | `.github/PULL_REQUEST_TEMPLATE.md` | Every new PR, pre-filled | ✅ |
| Issue severity triage | `.github/ISSUE_TEMPLATE/bug_report.md`, `feature_request.md` | Every new issue, pre-filled | ✅ |
| Commit convention (author-time) | `commitlint.config.cjs` + `.pre-commit-config.yaml` | Local `git commit`, if hooks installed | ✅ (pre-existing) |
| Commit convention (PR-time, cannot be skipped) | `.github/workflows/lint-and-scan.yml` → `commitlint` job | Every PR into `staging`/`main`, validates the full commit range | ✅ **new** |
| Secret scanning (author-time) | `.gitleaks.toml` + `.pre-commit-config.yaml` | Local `git commit`, if hooks installed | ✅ (pre-existing) |
| Secret scanning (PR-time, cannot be skipped) | `.github/workflows/lint-and-scan.yml` → `gitleaks` job | Every PR into `staging`/`main`, scans the PR's commit range with the free `gitleaks` CLI (no license/cost — private-repo use of `gitleaks-action` requires a paid license, deliberately avoided) | ✅ **new** |
| File hygiene (trailing whitespace, large files, private keys, merge conflicts) | Same workflow → `pre-commit-hygiene` job | Every PR | ✅ **new** |
| Lint + build gate | Same workflow → `frontend-quality` job | Every PR | ✅ **new** — this is what makes SOP §7.3's claim true |
| Branch protection (require PR, required status checks, Code Owner review, no force-push) | GitHub repo settings | `main`, `staging` | ❌ **Not applied by this change — requires repo admin action, see §6** |

---

## 5. CODEOWNERS Identity — Resolved

`.github/CODEOWNERS` is a single global rule:

- **Mayoori Peradka** (`@mayoori-infosrc`) — code owner and required reviewer
  for every PR, all paths.
- **Sakthivel Saravanan** (`@sakthi-saravanan-dev`) — Infrastructure Owner
  per `docs/SOP_Zenith.docx` Document Control; recorded in the CODEOWNERS
  file header for ownership/record purposes. By decision, no separate
  per-path infra review rule is enforced — infra-path PRs route through the
  same code-owner rule above, not a distinct gate.

---

## 6. Branch Protection Runbook (requires repo admin — not applied by this change)

No GitHub admin token was available in this session to apply these settings directly. Run one of the two options below with an account that has admin rights on `infoservices-dev/infosrv-zenith-hr-pulse`.

### Option A — `gh` CLI

```bash
gh auth login   # once, with an admin account

# main
gh api -X PUT repos/infoservices-dev/infosrv-zenith-hr-pulse/branches/main/protection \
  -H "Accept: application/vnd.github+json" \
  -f required_status_checks[strict]=true \
  -f 'required_status_checks[contexts][]=commitlint' \
  -f 'required_status_checks[contexts][]=gitleaks' \
  -f 'required_status_checks[contexts][]=pre-commit-hygiene' \
  -f 'required_status_checks[contexts][]=frontend-quality' \
  -f enforce_admins=true \
  -f required_pull_request_reviews[required_approving_review_count]=1 \
  -f required_pull_request_reviews[require_code_owner_reviews]=true \
  -f restrictions=null \
  -f allow_force_pushes=false \
  -f allow_deletions=false

# staging — same, typically with enforce_admins=false so hotfixes stay possible
# under the SOP §16 "Emergency Changes" provision
gh api -X PUT repos/infoservices-dev/infosrv-zenith-hr-pulse/branches/staging/protection \
  -H "Accept: application/vnd.github+json" \
  -f required_status_checks[strict]=true \
  -f 'required_status_checks[contexts][]=commitlint' \
  -f 'required_status_checks[contexts][]=gitleaks' \
  -f 'required_status_checks[contexts][]=pre-commit-hygiene' \
  -f 'required_status_checks[contexts][]=frontend-quality' \
  -f enforce_admins=false \
  -f required_pull_request_reviews[required_approving_review_count]=1 \
  -f required_pull_request_reviews[require_code_owner_reviews]=true \
  -f restrictions=null \
  -f allow_force_pushes=false \
  -f allow_deletions=false
```

The four `required_status_checks` context names must exactly match the job
names in `.github/workflows/lint-and-scan.yml` — they only appear as
selectable checks in GitHub **after** that workflow has run at least once
on a PR.

### Option B — GitHub UI

Repo → **Settings → Branches → Add branch protection rule**, for each of
`main` and `staging`:

1. Branch name pattern: `main` (repeat for `staging`).
2. ✅ Require a pull request before merging → Require approvals: **1** →
   ✅ Require review from Code Owners.
3. ✅ Require status checks to pass before merging → Require branches to be
   up to date → select `commitlint`, `gitleaks`, `pre-commit-hygiene`,
   `frontend-quality` (available after the workflow's first run).
4. ✅ Do not allow force pushes.
5. ✅ Do not allow deletions.
6. For `main` only: ✅ Do not allow bypassing the above settings (applies
   rules to admins too — matches SOP §9.2 "direct commits to main are not
   permitted").

---

## 7. Enforcement Matrix

| Layer | What it catches | Can be skipped by developer? |
|---|---|---|
| Local pre-commit hook (`.pre-commit-config.yaml`) | Secrets, bad commit message, file hygiene — before the commit is even made | Yes, if hooks weren't installed (§1 of `docs/developer-lifecycle/01-joiner-onboarding.md`) |
| CI (`.github/workflows/lint-and-scan.yml`) | Same, plus lint + build — on every PR | No — runs regardless of local setup |
| Branch protection (§6, once applied) | Merging without the above passing, or without required review | No, once configured — this is the layer that makes the other two *mandatory* rather than advisory |

Until §6 is applied, layers 1–2 are real but **advisory**: a PR can still
be merged with failing checks or no review. Applying branch protection is
the single highest-leverage remaining step in this document.

---

## 8. Roles & Responsibilities (git governance)

| Role | Responsibility |
|---|---|
| Code Owner (Mayoori Peradka, `@mayoori-infosrc`) | Required reviewer/approver on every PR (once §6 is applied); maintains `.github/CODEOWNERS`, `commitlint.config.cjs`, `.gitleaks.toml` |
| Infrastructure Owner (Sakthivel Saravanan, `@sakthi-saravanan-dev`) | Holds repo admin access and is recorded as Infrastructure Owner per SOP Document Control; not a separate CODEOWNERS review gate by decision — see §5 |
| Application Owner (Prasanna Balaji) | Approves this SOP; final sign-off per SOP §16 change management |
| Any contributor | Installs local hooks (`docs/developer-lifecycle/01-joiner-onboarding.md` §1), writes Conventional Commit messages, fills out the PR template honestly |

---

## 9. Risk Register Addition

Matches the format of `docs/SOP_Zenith.docx` §18.

| Risk | Impact | Likelihood | Mitigation | Owner | Target Date |
|---|---|---|---|---|---|
| Branch protection not applied — PRs can merge without review or passing CI | High | High until §6 is run | Apply the runbook in §6 — both Code Owner and Infrastructure Owner hold admin access, either can execute it | Code Owner / Infrastructure Owner | Immediate |
| `enforce_admins` left `false` on `main` | Medium | Low | Admins can still bypass required review on `main` if left disabled — confirm intended posture, SOP §9.2 implies it should be `true` | Application Owner | Immediate |

---

## 10. Approval

| Name | Role | Signature | Date |
|---|---|---|---|
| Prasanna Balaji | Application Owner |  |  |
| Sakthivel Saravanan | Infrastructure Owner |  |  |
