# Zenith HR Pulse — Enterprise Production-Readiness Assessment

> Reviewed as: Senior Enterprise Software Architect / Security Architect / DevSecOps / Principal Engineer.
> Scope: entire application (FastAPI backend, React/TS frontend, Serverless/ECS infra, CI/CD, docs).
> Legend — Status: ✅ Implemented · 🟡 Partial · ❌ Missing. Priority: 🔴 Critical · 🟠 High · 🟡 Medium · ⚪ Low.
> Complexity/Effort: S ≤1d · M 2–5d · L >1wk. Infra? = needs infra change vs app-only.

**Since this assessment was first written:** secret scanning (gitleaks),
commit linting (commitlint), and pre-commit hooks were added
(`.gitleaks.toml`, `.pre-commit-config.yaml`, `commitlint.config.cjs`);
`CHANGELOG.md` was added; ~80 stray `.pyc` files and several dead code
paths were removed from git; `.gitignore` was hardened; and
`docs/developer-lifecycle/` now documents the developer JML process (was
previously fully missing — DevOps/Developer Lifecycle §4 below). Findings
updated in place where this changed the status.

---

## STACK SNAPSHOT

- **Backend:** FastAPI (Python), Mangum, gunicorn on **ECS Fargate** behind **ALB** + **CloudFront**.
- **Data:** DynamoDB (~20 tables, PAY_PER_REQUEST, GSIs), **S3** (private, SSE-AES256, presigned), **KMS** (CMK, rotation on).
- **Identity:** Azure Entra ID (MSAL) + JWKS; app JWT HS256 15-min.
- **AI:** AWS Bedrock (Claude).
- **CI/CD:** GitHub Actions → ECR image → `serverless deploy` → ECS force-new-deploy → S3/CloudFront frontend.
- **IaC:** `backend/serverless.yml` (VPC, endpoints, ECS, ALB, CloudFront, KMS, tables).

---

## 1. AUTHENTICATION

| Feature | Status | Evidence | Risk | Recommendation / Approach | Pri | Cx | Infra? |
|---|---|---|---|---|---|---|---|
| SSO / OAuth / OIDC (Entra) | ✅ | `security.py:20` JWKSValidator; MSAL token exchange `auth.py` | — | Keep | — | — | No |
| JWT validation (sig, iss, aud, exp/nbf) | ✅ | `security.py:86-115` tenant+audience pinning | — | Strong; keep | — | — | No |
| Token expiry (15 min) | ✅ | `security.py:131` | — | Keep | — | — | No |
| **Refresh tokens** | ❌ | none; frontend `getValidToken` re-acquires via MSAL | Silent session drop / re-auth friction | Use MSAL silent token renewal on FE; document that app JWT is short-lived by design | 🟡 | S | No |
| **MFA** | 🟡 | Delegated to Entra; not asserted in app | Assumed, not enforced/verified | Enforce via Entra Conditional Access; optionally assert `amr`/`acr` claims at validation | 🟠 | S | No* |
| **Conditional Access / Device trust** | 🟡 | Entra-side only, undocumented | Unverified posture | Document CA baseline (MFA, compliant device) as upstream control; add to security checklist | 🟠 | S | No* |
| **Session management** (revocation) | ❌ | Stateless JWT, no server-side session/blocklist | Cannot force-logout a compromised token before 15-min exp | Add token denylist (DynamoDB TTL) keyed by `jti`; check in `get_current_user` | 🟠 | M | No |
| Password policy / lockout | 🟡 | bcrypt-12 `security.py:134`; password path is mock/service users only | Low (Entra is primary) | Document that local auth is non-prod; disable in prod-like envs | 🟡 | S | No |
| Account lockout / brute-force | 🟡 | Login rate-limited `30/min` `auth.py:60` | Credential stuffing on local path | Add lockout counter if local auth retained | 🟡 | S | No |

\* Entra config change, not app-infra.

---

## 2. AUTHORIZATION

| Feature | Status | Evidence | Risk | Recommendation | Pri | Cx | Infra? |
|---|---|---|---|---|---|---|---|
| RBAC (admin/leadership/manager/self) | ✅ | `security.py:273,328`; `employee_authorization.py` | — | Keep | — | — | No |
| Object-level (BOLA) | ✅ | `can_view_employee_full` `employee_authorization.py:57`; write access `:100` | — | Strong | — | — | No |
| Privilege-escalation guard | ✅ | `reporting_to` change admin-only `employees.py:982-992`; `is_admin` resolved server-side never from token | — | Keep | — | — | No |
| ABAC | 🟡 | Attribute checks ad-hoc (email/manager/dept) | Policy scattered across routers | Centralize into a policy module; consider OPA-style rules if it grows | 🟡 | M | No |
| Feature-based authz | 🟡 | `feature_flags.py` `can_user_perform_action` exists but sparsely used | Inconsistent gating | Wire flags into route dependencies uniformly | 🟡 | M | No |
| Least privilege (**IAM**) | 🟡 | Granular DynamoDB statements **shadowed** by `ZenithAppTaskPolicy` `dynamodb:*/s3:*/bedrock:*` on `Resource:"*"` (`serverless.yml:340-345`) | Over-privileged task role — blast radius on compromise | Replace wildcard policy with resource-scoped actions (already enumerated above it) | 🟠 | M | **Yes** |
| Permission inheritance | 🟡 | Manager→report implicit via graph | OK | Document model | ⚪ | S | No |

---

## 3. USER LIFECYCLE (JML) — Employee

See companion **`docs/ENTERPRISE-GOVERNANCE-AND-JML.md`** for the full model.

| Feature | Status | Evidence | Risk | Recommendation | Pri | Cx | Infra? |
|---|---|---|---|---|---|---|---|
| Joiner (provisioning, default role) | ✅ | `sync_azure_ad_to_db.py:280,486`; default non-admin `security.py:165` | — | Keep | — | — | No |
| Mover (manager/dept/location) | ✅ | sync `:116,238`; admin-gated reporting edit | — | Keep | — | — | No |
| **Leaver — auto deactivation** | ❌ | Sync never deactivates users absent from Entra export | Orphaned active records / stale access | Add `--deactivate-missing` reconcile pass → `status=inactive` (never hard-delete) | 🔴 | S | No |
| **Leaver — session/access revocation** | 🟡 | Relies on Entra disabling account (JWT then fails) | Up to 15-min window; no app-side kill | Combine with §1 token denylist on offboard | 🟠 | M | No |
| **Scheduled reconciliation** | ❌ | Sync is manual CLI with confirm prompt `:560` | Drift Entra↔DB | Schedule via EventBridge→Lambda daily, `--dry-run` logged | 🟠 | M | **Yes** |
| Archive leaver data / retention | 🟡 | `status=inactive` keeps record; no retention policy | Compliance | Define retention + soft-delete + purge job | 🟡 | M | No |

---

## 4. DEVELOPER LIFECYCLE

| Feature | Status | Evidence | Risk | Recommendation | Pri | Cx | Infra? |
|---|---|---|---|---|---|---|---|
| README / setup | 🟡 | `README.md` present + Git Hooks section added | Onboarding slow | Add arch diagram | 🟡 | S | No |
| Architecture docs | 🟡 | `docs/` has security + field-encryption + governance/JML + this doc | Partial | Add C4/context diagram + ADRs | 🟡 | M | No |
| Env setup guide | 🟡 | `.env.staging`/`.env.prod` exist as real files (not `.env.example`); `.gitignore` now blanket-ignores `.env*` going forward | Secret leak risk in existing tracked files | Move secrets to SSM/Secrets Manager; add `.env.example`; untrack real env files | 🔴 | S | No |
| **GitHub onboarding / repo permissions / CODEOWNERS** | 🟡 | `.github/CODEOWNERS` added — see `docs/GIT-GOVERNANCE-SOP.md` §5 for one pending identity (infra-owner GitHub handle) before it fully takes effect. Branch protection still not applied — §6 of that doc is a runbook, not yet run | Unreviewed merges until branch protection is applied | Run the branch-protection runbook (`docs/GIT-GOVERNANCE-SOP.md` §6) | 🔴 | S | No |
| **Developer JML process documented** | ✅ | `docs/developer-lifecycle/` (Joiner, Mover, Leaver, access matrix, KT guide) | — | Was fully missing; now addressed. Keep it current as tooling changes | — | — | No |
| AWS/Azure access, KT process | ✅ | `docs/developer-lifecycle/01-joiner-onboarding.md` §3–4, `kt-technical-guide.md` | — | Keep current | — | — | No |
| **Developer offboarding** (revoke GH/AWS/Azure/secrets/CI) | ✅ | `docs/developer-lifecycle/03-leaver-offboarding.md` | Process exists but is entirely manual — no automated deprovisioning | Execute checklist same-day on every departure; consider automation later | 🟡 | S | No |

---

## 5. DATA LIFECYCLE

| Feature | Status | Evidence | Risk | Recommendation | Pri | Cx | Infra? |
|---|---|---|---|---|---|---|---|
| Soft delete | 🟡 | Employees use `status=inactive`; but `DELETE` is **hard** `employees.py:1068` | Irreversible loss | Standardize soft-delete + `deleted_at`; restrict hard delete | 🟠 | S | No |
| Archive / restore | ❌ | No restore path | Cannot recover | Add restore endpoint from soft-deleted state | 🟡 | S | No |
| Retention / purge policy | ❌ | none | Compliance (GDPR/PII) | Define retention; scheduled purge job w/ approval | 🟠 | M | **Yes** |
| Version history | ❌ | `put_item` overwrites; only `updated_at` | No change history | Enable DynamoDB PITR (backup) + optional event-sourced history table | 🟠 | M | **Yes** |
| Audit history | 🟡 | Only review cycles emit `audit_event` (`reviews.py:521…`) | Weak forensics | See §7 | 🟠 | M | No |
| **Backups (PITR)** | ❌ | Not enabled in `serverless.yml` tables | Data loss risk | `PointInTimeRecoverySpecification: true` on all tables | 🔴 | S | **Yes** |

---

## 6. APPROVAL WORKFLOWS

| Feature | Status | Evidence | Risk | Recommendation | Pri | Cx | Infra? |
|---|---|---|---|---|---|---|---|
| Draft/Pending/Approved/Rejected states | 🟡 | Present in reviews/goals/client_rm_feedback (`reviewDraft` table; status fields) | Domain-specific only | Keep; document state machines | 🟡 | S | No |
| Cancelled / Expired states | 🟡 | Partial (period_status) | Inconsistent | Normalize lifecycle enum | 🟡 | S | No |
| Approval history | 🟡 | Implicit in draft table, not a formal trail | Auditability | Persist approval events (actor/decision/ts) | 🟡 | M | No |
| Multi-level approval | ❌ | none | Sensitive ops unchecked | Add generic approval engine for bulk/admin/config ops | 🟡 | L | No |

---

## 7. AUDIT & COMPLIANCE

| Feature | Status | Evidence | Risk | Recommendation | Pri | Cx | Infra? |
|---|---|---|---|---|---|---|---|
| Audit — employee updates | ❌ | `update_employee`/`delete` emit no audit record | No who/what trail | Emit structured audit on every mutation | 🔴 | M | No |
| Audit — admin actions / role changes | ❌ | admin CRUD `employees.py:189-320` unlogged | Insider risk blind spot | Same audit sink | 🔴 | M | No |
| Audit — config / feature flags | ❌ | `feature_flags` writes unlogged | Untracked toggles | Audit flag changes | 🟠 | S | No |
| Audit — authn/authz failures | 🟡 | Logged to stdout, not structured/queryable | Weak IR | Structured security events → CloudWatch metric filter | 🟠 | M | No |
| Audit — reviews | ✅ | `audit_event` records `reviews.py:521,637,725,2146` | — | Extend pattern app-wide | — | — | No |
| Audit record schema (who/what/old/new/ts/**IP/device/correlation-id**) | ❌ | No correlation id or IP/device capture | Incomplete forensics | Add request-id middleware; capture actor, before/after, IP (`X-Forwarded-For`), UA | 🟠 | M | No |
| Log retention | 🟡 | ECS log group **7 days** `serverless.yml:361` | Too short for audit/compliance | 90–365d for audit streams; ship to central log store | 🟠 | S | **Yes** |
| **Developer access audit trail** | 🟡 | `docs/developer-lifecycle/` prescribes logging grants/revocations, but no enforced central log yet | Access review has no data source | Build the access-review log referenced in §16 | 🟡 | S | No |

---

## 8. SAFE OPERATIONS

| Feature | Status | Evidence | Risk | Recommendation | Pri | Cx | Infra? |
|---|---|---|---|---|---|---|---|
| Confirmation dialogs | 🟡 | FE dialogs present (dialog components) | OK | Ensure on destructive ops | 🟡 | S | No |
| Dry-run / preview (sync) | ✅ | `sync_azure_ad_to_db.py:--dry-run` | — | Keep; extend to bulk imports | — | — | No |
| Bulk validation / preview (CSV import) | 🟡 | `import-csv` `employees.py:1161` validates but no preview/rollback | Bad bulk import corrupts data | Add preview + per-row validation report + transactional apply | 🟠 | M | No |
| Duplicate detection | ✅ | case-insensitive email dedup (sync `:52`) | — | Keep | — | — | No |
| **Optimistic locking / conflict detection** | ❌ | `put_item` last-writer-wins; no `ConditionExpression` on version | Lost updates on concurrent edits | Add `version` attr + `ConditionExpression` on writes | 🟠 | M | No |
| Undo / rollback / restore | ❌ | none | Mistakes irreversible | Pair with soft-delete + restore (§5) | 🟡 | M | No |

---

## 9. NOTIFICATION SAFETY

| Feature | Status | Evidence | Risk | Recommendation | Pri | Cx | Infra? |
|---|---|---|---|---|---|---|---|
| Notification service | 🟡 | `milestone_notification.py` computes upcoming; delivery path thin | — | — | — | — | No |
| create ≠ send / preview before send | ❌ | No preview/preflight | Accidental mass-send | Split compose vs dispatch; preview step | 🟡 | M | No |
| Recipient validation / dedup | ❌ | not evident | Misdelivery | Validate + dedupe recipients pre-send | 🟡 | S | No |
| Delivery history / retry / status | ❌ | none | No delivery guarantees | Persist delivery log + retry w/ backoff (SES/SNS) | 🟡 | M | **Yes** |

---

## 10. API REVIEW

| Feature | Status | Evidence | Risk | Recommendation | Pri | Cx | Infra? |
|---|---|---|---|---|---|---|---|
| Rate limiting | ✅ | SlowAPI `rate_limit.py`, `120/min` etc | — | Consider WAF rate rules too | — | — | No |
| Validation (Pydantic) | ✅ | models + `sanitize_employee_payload` | — | Keep | — | — | No |
| Error handling (generic 500) | ✅ | `main.py:275-284` | — | Keep | — | — | No |
| OpenAPI / Swagger | 🟡 | FastAPI auto-docs; **not gated** in prod | Schema disclosure | Disable `/docs` `/openapi.json` in prod-like or gate behind admin | 🟡 | S | No |
| **API versioning** | ❌ | Flat `/api/...`, no `/v1` | Breaking changes hit clients | Introduce `/api/v1` prefix; version future changes | 🟠 | M | No |
| **Idempotency** (POST) | ❌ | No `Idempotency-Key` handling | Double-submit dupes | Accept idempotency key → store result keyed by it (DynamoDB TTL) | 🟡 | M | No |
| Timeouts | ✅ | JWKS 10s; ALB idle 120s aligned to gunicorn; FE 30s abort | — | Keep | — | — | Partial |
| Retry (client) | 🟡 | FE degraded paths, no auto-retry/backoff | Transient failures surface | Add bounded retry w/ backoff on idempotent GETs | 🟡 | S | No |
| Response validation | ✅ | `response_model` on routes | — | Keep | — | — | No |

---

## 11. SECURITY REVIEW

| Feature | Status | Evidence | Risk | Recommendation | Pri | Cx | Infra? |
|---|---|---|---|---|---|---|---|
| Encryption at rest (field + S3 + KMS rotation) | ✅ | `field_crypto.py`; `serverless.yml:298-327` | — | Keep | — | — | No |
| TLS / HTTPS redirect | ✅ | ALB 80→443, CloudFront redirect-to-https, TLS1.2_2021 | — | Keep | — | — | No |
| **Secrets management** | 🟡 | `SECURITY_SECRET_KEY` injected as **plaintext env** in task def `serverless.yml:517`; `.env.prod`/`.env.staging` tracked as real files (values are deployment config, not exploit-grade secrets today, but the pattern is risky) | Secret exposure in task def / repo pattern | Move to **Secrets Manager/SSM**; reference by ARN; add `.env.example`, untrack real env files | 🔴 | M | **Yes** |
| Security headers | ✅ | `main.py:287-298` (nosniff, DENY, Referrer, Permissions) | — | Add HSTS + CSP at CloudFront | 🟡 | S | Yes |
| CORS | ✅ | explicit allowlist `main.py:239` | — | Keep | — | — | No |
| **CSRF** | 🟡 | Bearer-token API (no cookies) mitigates; not explicitly documented | Low | Document; ensure no cookie-auth added later | ⚪ | S | No |
| XSS | ✅ | FE `safe-image-url`/nav/download; BE sanitization | — | Add CSP for defense-in-depth | 🟡 | S | Yes |
| SQL injection | ✅ (N/A) | DynamoDB, parameterized conditions | — | — | — | — | No |
| File upload security | ✅ | ext+size checks, private S3, key-not-URL persisted `s3_service.py:83-95` | — | Add content-type sniff / AV scan for docs | 🟡 | M | Yes |
| **Dependency scanning** | ❌ | No Dependabot/`npm audit`/`pip-audit` in CI | Vulnerable deps ship | Add Dependabot + `pip-audit`/`npm audit` gate | 🟠 | S | No |
| **Secret scanning** | ✅ (local only) | `.gitleaks.toml` + `.pre-commit-config.yaml` gate commits locally | Not yet enforced in CI — a dev who skips hook setup ships unscanned | Add `pre-commit run --all-files` (includes gitleaks) as a required CI job | 🟠 | S | No |
| **SAST** | ❌ | none | Code vulns undetected | Add CodeQL / Bandit (py) / ESLint-security | 🟠 | S | No |
| **DAST** | ❌ | none | Runtime vulns | Add OWASP ZAP baseline against staging | 🟡 | M | No |
| **WAF** | ❌ | CloudFront/ALB have no WAF | L7 attacks, bots | Attach AWS WAF (managed rules + rate) | 🟠 | S | **Yes** |
| Image scanning | ✅ | ECR `scanOnPush=true` `deploy.yml:100` | — | Add fail-on-critical gate | 🟡 | S | Yes |
| Threat modeling | ❌ | none | Blind spots | One STRIDE pass; keep as living doc | 🟡 | M | No |
| Startup secret validation | ✅ | `security_config.py:71` fail-fast | — | Keep | — | — | No |

---

## 12. MONITORING

| Feature | Status | Evidence | Risk | Recommendation | Pri | Cx | Infra? |
|---|---|---|---|---|---|---|---|
| Health endpoints | ✅ | `/health` + admin `/health/details` `main.py:448` | — | Keep | — | — | No |
| Logging | 🟡 | CloudWatch via awslogs; heavy `print()`/DEBUG in routers | Noisy, PII leak risk | Structured JSON logging; strip `print`/DEBUG; scrub PII | 🟠 | M | No |
| CloudWatch metrics | 🟡 | httpApi metrics on; no custom app metrics | Limited insight | Emit business/error metrics (EMF) | 🟡 | M | Yes |
| **Dashboards** | ❌ | none defined | No at-a-glance health | CloudWatch dashboard (latency/5xx/throttles) | 🟡 | S | Yes |
| **Alerts / alarms** | ❌ | none | Incidents unnoticed | Alarms: 5xx rate, p99 latency, ECS unhealthy, DDB throttle → SNS | 🟠 | S | Yes |
| **Tracing** | ❌ | no X-Ray/OTel | Hard to debug distributed calls | Enable X-Ray or OTel + correlation id | 🟡 | M | Yes |
| Incident management | ❌ | no runbooks/on-call | Slow MTTR | Define sev levels, runbooks, on-call | 🟡 | M | No |

---

## 13. DEVOPS

| Feature | Status | Evidence | Risk | Recommendation | Pri | Cx | Infra? |
|---|---|---|---|---|---|---|---|
| CI/CD pipeline | ✅ | `deploy.yml` build→push→deploy | — | Add quality gates (below) | — | — | No |
| **Tests in CI** | ❌ | No test step; only 2 FE tests total, no BE tests | Regressions ship | Add `pytest` + `vitest` gate; raise coverage | 🔴 | M | No |
| **Lint / typecheck gate** | ✅ (new) | `.github/workflows/lint-and-scan.yml` → `frontend-quality` job runs `npm run lint` + build on every PR into `staging`/`main` | Not yet a *required* check until branch protection is applied (`docs/GIT-GOVERNANCE-SOP.md` §6) | Apply the branch-protection runbook | 🟠 | S | No |
| **Branch protection / required reviews** | ❌ | Deploys on direct push to main/staging; `docs/GIT-GOVERNANCE-SOP.md` §3 confirms the rule doesn't actually exist yet despite SOP §9.2 describing it as active | Unreviewed prod deploys | Runbook is written (`docs/GIT-GOVERNANCE-SOP.md` §6) — needs a repo admin to execute it | 🔴 | S | No |
| CODEOWNERS / PR & issue templates | ✅ (new) | `.github/CODEOWNERS`, `.github/PULL_REQUEST_TEMPLATE.md`, `.github/ISSUE_TEMPLATE/*` all added | CODEOWNERS has one placeholder identity pending — `docs/GIT-GOVERNANCE-SOP.md` §5 | — | — | — |
| **commitlint / pre-commit hooks** | ✅ | `.pre-commit-config.yaml`, `commitlint.config.cjs`, `.gitleaks.toml` | Local-only until CI runs `pre-commit run --all-files` | Add the CI job; keep local hooks as the fast feedback layer | 🟡 | S | No |
| **Rollback strategy** | 🟡 | ECS force-new-deploy; `:latest` tag → no pinned rollback | Cannot cleanly revert image | Tag images by SHA; deploy by digest; documented rollback | 🟠 | M | Yes |
| **Blue/Green / Canary** | ❌ | `DesiredCount:1` rolling → brief downtime | No zero-downtime, no canary | CodeDeploy blue/green on ECS; raise desired count | 🟠 | L | **Yes** |
| Release strategy / notes | 🟡 | `CHANGELOG.md` now exists; no version tags yet | Untracked releases | Add semver tags on release | 🟡 | S | No |
| **Repo hygiene** (tracked build artifacts / dead code) | ✅ | 80 stray `.pyc` untracked; dead `backend/database\|models\|services` and stale root files removed; `.gitignore` hardened | — | Keep enforcing via the new blanket `.gitignore` rules | — | — | No |

---

## 14. DOCUMENTATION

| Feature | Status | Evidence | Risk | Rec | Pri | Cx |
|---|---|---|---|---|---|---|
| README | 🟡 | present + Git Hooks section | onboarding | expand further (arch diagram) | 🟡 | S |
| Architecture / ADR | 🟡 | some `docs/`; no ADRs | decisions lost | add ADR log | 🟡 | S |
| API docs | 🟡 | auto Swagger only | consumer clarity | curate + examples | 🟡 | S |
| Deployment / troubleshooting / runbooks / SOP | ❌ | none | ops risk | write runbooks + deploy guide | 🟠 | M |
| **CHANGELOG** | ✅ | `CHANGELOG.md` (Keep a Changelog format) | — | keep updating on every notable change | — | — |
| Release notes / KT guide | 🟡 | `docs/developer-lifecycle/kt-technical-guide.md` covers KT; no per-release notes yet | traceability | pair CHANGELOG with tagged releases | 🟡 | S |
| Security & field-encryption docs | ✅ | `docs/SECURITY-ASSESSMENT.md`, `field-encryption.md` | — | keep | — | — |
| **Developer JML docs** | ✅ | `docs/developer-lifecycle/` (this assessment's §4 gap, now closed) | — | keep in sync with actual tooling | — | — |

---

## 15. UX SAFETY

| Feature | Status | Evidence | Risk | Rec | Pri | Cx |
|---|---|---|---|---|---|---|
| Loading / progress states | ✅ | `Directory.tsx` spinners; timeout fix `use-employees.ts` | — | keep | — | — |
| Friendly errors + retry | ✅ | toasts + Retry button `Directory.tsx:657-664` | — | keep | — | — |
| **Unsaved-changes guard / autosave** | ❌ | not evident on forms | data loss on nav | add dirty-check prompt / autosave drafts | 🟡 | M |
| Read-only mode | 🟡 | role-driven hide of actions | OK | ensure server-enforced too (it is) | ⚪ | S |

---

## 16. ENTERPRISE GOVERNANCE

| Feature | Status | Evidence | Risk | Rec | Pri | Cx |
|---|---|---|---|---|---|---|
| Change mgmt / CAB / release mgmt | ❌ | none | uncontrolled change | lightweight change record + approval on prod deploy | 🟠 | M |
| Risk register / operational & security checklists | 🟡 | security docs exist; no checklists | gaps untracked | add go-live checklists + risk register | 🟡 | S |
| **Access review / quarterly audit — process** | 🟡 | `docs/developer-lifecycle/access-matrix.md` gives a data source; no log of actual grants yet | stale privileges | run quarterly review against the matrix; start logging grants/revocations | 🟠 | S |
| **Disaster recovery / BCP** | ❌ | single region, `DesiredCount:1`, no PITR | data/site loss | PITR + multi-AZ tasks + documented RTO/RPO + DR test | 🔴 | L | Yes |

---

## 17. AI / BOT SAFETY

| Feature | Status | Evidence | Risk | Recommendation | Pri | Cx |
|---|---|---|---|---|---|---|
| Permission-aware AI responses | ❌ | `bedrock_service.py` has no user/authz context | AI leaks data across users | Pass viewer scope; filter data before prompt | 🟠 | M |
| **Prompt-injection protection** | ❌ | prompt built by f-string concat of user input `bedrock_service.py:30` | Injection / jailbreak | Separate system/user roles, delimit + sanitize user content, allowlist actions | 🟠 | M |
| Output validation / hallucination guard | ❌ | raw `content[0].text` returned | Wrong/unsafe output | Validate/format; constrain to retrieved facts | 🟡 | M |
| Human confirmation / action preview | ❌ | none | AI-triggered side effects | Require confirm for any write the AI proposes | 🟡 | M |
| Confidence / ambiguity / explain-denied | ❌ | none | poor UX/safety | add thresholds + denial explanations | ⚪ | M |

---

## 18. OVERALL ARCHITECTURE

| Aspect | Status | Notes |
|---|---|---|
| Scalability | 🟡 | DynamoDB on-demand scales; **ECS `DesiredCount:1` + no autoscaling** is the bottleneck; list endpoints do full **table scans** (cached 120s) |
| Availability / Fault tolerance | 🟡 | Multi-AZ subnets & ALB, but **single task** = SPOF; no PITR/DR |
| Reliability | 🟡 | Good client timeouts + degraded paths; no retries/circuit breakers server-side |
| Performance | 🟡 | 226× S3 presign fix on `feature/security-fixes` (pending merge) + fast-first-page on `staging`; full scans remain |
| Maintainability | 🟡 | Large routers (`reviews.py` ~3k lines, `employees.py` ~1.2k); dead commented code (`main.py:1-208`); `print`/DEBUG noise. Repo-hygiene cleanup (dead modules, stray artifacts) done; duplicate DB modules (`database.py`/`database_new.py`/`database_dynamodb.py`) still present |
| Modularity / layering / SOLID | 🟡 | Services layer exists (good); routers mix transport+business logic; no repository abstraction |
| Clean Architecture | 🟡 | Partial; domain not isolated from framework |
| Microservice readiness | 🟡 | Monolith on Fargate; clean bounded contexts per router would ease future split |
| Technical debt | 🟡 | Commented legacy in `main.py`, triple DB modules, tracked env files, wildcard IAM, few tests — improved slightly by the recent cleanup pass |

---

## SCORES

| Dimension | Score | Rationale |
|---|---|---|
| **Enterprise Readiness** | **63 / 100** | Strong auth/data security; gaps in audit, DR, CI gates. Developer JML gap closed, repo hygiene improved (+2 from baseline) |
| **Security** | **75 / 100** | Excellent app-layer (JWKS pinning, field KMS, redaction, headers); secret scanning now exists locally (+1); still dragged by wildcard IAM, tracked env files, no WAF/SAST/DAST/CI-enforced scanning |
| **Maintainability** | **59 / 100** | Good service layer; dead code and stray build artifacts removed (+2); still hurt by giant routers, triple DB modules, ~2 tests |
| **DevOps Maturity** | **54 / 100** | Working CI/CD & IaC; commit hooks now exist locally (+4); still no CI test/lint/scan gate, no branch protection, `:latest` deploys, no blue/green |
| **Operational Readiness** | **52 / 100** | Health checks + logs; no alarms/dashboards/tracing, 7-day logs, single task, no runbooks/DR |
| **Governance** | **53 / 100** | Employee JML joiner/mover solid; **developer JML now documented** (+5); still no audit trail, no employee-leaver automation, no change mgmt |

---

## TOP 20 IMPROVEMENTS (do first)

| # | Improvement | Category | Pri | Cx | Infra? | Status |
|---|---|---|---|---|---|---|
| 1 | Move secrets to Secrets Manager/SSM; add `.env.example`, untrack real env files | Security | 🔴 | M | Yes | Open |
| 2 | Enable DynamoDB **PITR** on all tables | Data/DR | 🔴 | S | Yes | Open |
| 3 | Add **audit trail** for all mutations (who/what/old/new/ts/IP/corr-id) | Audit | 🔴 | M | No | Open |
| 4 | **Branch protection** + required PR review + green CI on main/staging | DevOps | 🔴 | S | No | **Runbook written (`docs/GIT-GOVERNANCE-SOP.md` §6) — needs admin to execute** |
| 5 | Add **tests in CI** (pytest + vitest) + coverage gate | DevOps | 🔴 | M | No | Open |
| 6 | Add **secret scanning** (gitleaks) pre-commit + CI | Security | 🟡 | S | No | **Local done — CI enforcement open** |
| 7 | Replace wildcard **IAM** task policy with resource-scoped actions | Security | 🔴 | M | Yes | Open |
| 8 | **Leaver auto-deactivation** reconcile pass in Entra sync | JML | 🔴 | S | No | Open |
| 9 | Scheduled Entra sync (EventBridge→Lambda, dry-run logged) | JML | 🟠 | M | Yes | Open |
| 10 | **Dependency scanning** (Dependabot + pip-audit) | Security | 🟠 | S | No | Open |
| 11 | **SAST** (CodeQL/Bandit/ESLint-security) in CI | Security | 🟠 | S | No | Open |
| 12 | Attach **AWS WAF** to CloudFront/ALB | Security | 🟠 | S | Yes | Open |
| 13 | Pin images by **SHA/digest** + documented rollback | DevOps | 🟠 | M | Yes | Open |
| 14 | CloudWatch **alarms + dashboard** (5xx, p99, ECS health, DDB throttle) | Monitoring | 🟠 | S | Yes | Open |
| 15 | Raise ECS **DesiredCount + autoscaling**; blue/green deploy | Arch/Avail | 🟠 | L | Yes | Open |
| 16 | **Optimistic locking** (version + ConditionExpression) on writes | Safe Ops | 🟠 | M | No | Open |
| 17 | Session **revocation / token denylist** (offboard + compromise) | AuthN | 🟠 | M | No | Open |
| 18 | **API versioning** (`/api/v1`) + gate Swagger in prod | API | 🟠 | M | No | Open |
| 19 | **Prompt-injection** guardrails + permission-aware AI context | AI Safety | 🟠 | M | No | Open |
| 20 | CODEOWNERS + PR/issue templates + expand README/runbooks | DevOps/Docs | 🟠 | S | No | **Done** — CODEOWNERS/templates/CI lint gate added (`docs/GIT-GOVERNANCE-SOP.md`); one pending identity, README expansion still open |

---

## QUICK-WIN CLUSTER (≤1 day each, high leverage)
Secrets→SSM (#1 config), PITR (#2), ~~gitleaks~~ (#6 — local done, CI job left),
Dependabot (#10), branch protection (#4), CODEOWNERS/templates (#20), CloudWatch
alarms (#14), Leaver reconcile flag (#8).

*Evidence base: `security.py`, `security_config.py`, `services/*`, `routers/*`, `main.py`, `serverless.yml`, `.github/workflows/deploy.yml`, `sync_azure_ad_to_db.py`, `src/hooks/use-employees.ts`, `package.json`, `.gitleaks.toml`, `.pre-commit-config.yaml`, `commitlint.config.cjs`, `CHANGELOG.md`, `docs/developer-lifecycle/`.*
