# Changelog

All notable changes to this project are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).
Entries are written from Conventional Commit history — see
`commitlint.config.cjs` for enforced types.

## [Unreleased]

### Added
- `.pre-commit-config.yaml` — gitleaks secret scanning + file hygiene hooks
  at `pre-commit`, commitlint at `commit-msg`.
- `commitlint.config.cjs` — Conventional Commits enforcement.
- `.gitleaks.toml` — secret-scan config with a path allowlist.
- This CHANGELOG.

### Fixed
- Employee directory "Loading more employees" spinner could hang forever
  on a slow/hung backend response — added client-side fetch timeout and a
  guaranteed loading-state clear.
- S3 profile-photo presigning built a new client per employee row on the
  employee list endpoint (serial N+1); batched into a single client with
  concurrent signing (~226x faster on a 300-row benchmark).
- Per-row viewer redaction on the employee list now runs under bounded
  concurrency instead of serially.
- `backend/app/routers/__pycache__/*.pyc` were tracked in git, leaving the
  working tree permanently dirty; untracked and added to `.gitignore`.

### Changed
- `BEDROCK_MODEL_ID` upgraded from `anthropic.claude-3-sonnet-20240229-v1:0`
  to `anthropic.claude-haiku-4-5-20251001-v1:0` in staging and prod config.
- Removed unused `MONGO_URI` / `MONGO_DB_NAME` from `.env.prod` (app runs on
  DynamoDB).

## [1.0.0] - Baseline
Initial tracked release. See `git log` prior to this file for full history.
