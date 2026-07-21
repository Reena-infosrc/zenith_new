# Changelog

All notable changes to this project are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).
Entries are written from Conventional Commit history — see
`commitlint.config.cjs` for enforced types. Unless noted otherwise, entries
below reflect what has actually landed on `staging`.

## [Unreleased]

### Added
- `.pre-commit-config.yaml` — gitleaks secret scanning + file hygiene hooks
  at `pre-commit`, commitlint at `commit-msg`.
- `commitlint.config.cjs` — Conventional Commits enforcement.
- `.gitleaks.toml` — secret-scan config with a path allowlist.
- This CHANGELOG.
- `docs/developer-lifecycle/` — Developer Joiner–Mover–Leaver (JML) / KT
  documentation: onboarding, role-change, offboarding, an access matrix, and
  a technical KT guide.
- `docs/ENTERPRISE-GOVERNANCE-AND-JML.md` — enterprise safety/governance
  analysis and the employee JML model, cross-referencing
  `docs/developer-lifecycle/`.
- `docs/PRODUCTION-READINESS-ASSESSMENT.md` — full production-readiness
  review across auth, data, CI/CD, monitoring, and governance, with a
  prioritized improvement list.
- `docs/GIT-GOVERNANCE-SOP.md` — verifies `docs/SOP_Zenith.docx` §9.2's
  branch-protection/PR-review claims against actual repo state, and
  documents the gap closure below.
- `.github/CODEOWNERS` — Mayoori Peradka as default code owner; infra paths
  intended for Sakthivel Saravanan, pending his GitHub identity (see
  `docs/GIT-GOVERNANCE-SOP.md` §5).
- `.github/PULL_REQUEST_TEMPLATE.md` — change-request format (business
  justification, impact assessment, rollback plan, testing evidence)
  matching `docs/SOP_Zenith.docx` §16.
- `.github/ISSUE_TEMPLATE/bug_report.md`, `feature_request.md` — severity
  triage matching SOP §14.
- `.github/workflows/lint-and-scan.yml` — PR-time enforcement (cannot be
  skipped by not installing local hooks): commit-message linting over the
  full PR range, secret scanning with the free `gitleaks` CLI, file
  hygiene, ESLint, and a build check. This is what makes SOP §7.3's
  "automated quality gates must pass" claim actually true.

### Fixed
- Employee directory "Loading more employees" spinner could hang forever
  on a slow/hung backend response — added a 30s client-side fetch timeout
  and a guaranteed loading-state clear (a terminal `employeesUpdated` event
  fires after the loading flags are reset, so no subscriber can stay
  latched on).

### Changed
- `.gitignore` hardened:
  - Env files: replaced the per-file allowlist (`.env`, `.env.dev`,
    `.env.staging`, `.env.production`, `.env.local` — notably missing
    `.env.prod`, which is exactly why it kept staying tracked) with a
    blanket `.env*` pattern plus a `!.env.example` exception for a future
    template. This only changes what git tracks *going forward*; existing
    tracked env files and their content are untouched.
  - Compiled Python: replaced a per-directory `__pycache__` allowlist
    (which missed new directories every time one was added, leaving the
    working tree permanently "dirty") with a blanket `__pycache__/` and
    `*.pyc` rule covering the whole repo.

### Removed
- Untracked all 80 previously-committed `.pyc` files across the repo
  (routers, config, scripts, and a legacy module — see below). Files
  remain on disk locally; they're just no longer tracked.
- `backend/database/`, `backend/models/`, `backend/services/` — a
  pre-refactor duplicate of the recruitment module, fully superseded by
  `backend/app/*`, with zero imports anywhere in the app, CI, or Dockerfile.
- Root `requirements.txt` — a stale pre-DynamoDB dependency snapshot
  (`motor`, `pymongo`). The Docker build uses `backend/requirements.txt` in
  the `backend/` build context; this file was never read.
- `seed.js` — a raw MongoDB shell seed script, dead since the migration to
  DynamoDB.
- `org-tree-connector-component.html` — a standalone prototype at the repo
  root, not referenced by `index.html` or anything under `src/`.
- `package.json.bak`, `tsconfig.app.tsbuildinfo`, `tsconfig.node.tsbuildinfo`,
  `bun.lockb` — editor/build leftovers that should never have been
  committed; `package-lock.json` is the lockfile actually used (`npm ci`
  in CI).

### In progress (not yet on `staging`)
Landed on `feature/security-fixes`, pending merge:
- **S3 presign N+1 fix** — the employee list endpoint created a new S3
  client per row (serial); batched into a single client with concurrent
  signing. Benchmarked at 193.7s → 0.86s for 300 rows (~226x).
- Per-row viewer redaction on the employee list running under bounded
  concurrency instead of serially.
- `backend/app/routers/__pycache__/*.pyc` untracked on that branch
  (superseded on `staging` by the repo-wide fix above).

## [1.0.0] - Baseline
Initial tracked release. See `git log` prior to this file for full history.
