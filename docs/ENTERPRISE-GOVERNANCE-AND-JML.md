# Zenith HR Pulse — Enterprise Safety, Governance, Reliability & Identity Lifecycle (JML)

> End-to-end analysis of the platform's enterprise controls, with a complete
> **Joiner → Mover → Leaver (JML)** lifecycle model, current-state code mapping,
> gaps, and prioritized recommendations.
>
> Status: living document. Line references point to the security-hardened
> employee router (`feature/security-fixes`) unless noted — see the callout
> in §7 for what differs on `staging`.
>
> See also: `docs/developer-lifecycle/` for the **developer** JML process
> (GitHub/AWS/Azure access), which this document's §4 summarizes and that
> folder expands into actionable checklists.

---

## 1. Executive summary

Zenith HR Pulse is a FastAPI (Python) + React/TypeScript HR platform on AWS
(DynamoDB, S3, KMS, Bedrock), fronted by Azure Entra ID (MSAL) for authentication.

The platform already implements a strong baseline of enterprise controls:

| Domain | Maturity | Evidence |
|---|---|---|
| Authentication (Entra/MSAL + JWKS) | **Strong** | `backend/app/security.py` |
| Authorization (RBAC + object-level / BOLA) | **Strong** | `backend/app/services/employee_authorization.py` |
| Data-at-rest protection (KMS envelope field crypto) | **Strong** | `backend/app/services/field_crypto.py` |
| PII redaction by viewer role | **Strong** | `employee_authorization.redact_employee_record` |
| Private object storage (presigned, no public bucket) | **Strong** | `backend/app/services/s3_service.py` |
| API safety (rate limit, generic errors, headers, CORS) | **Strong** | `backend/app/main.py`, `rate_limit.py` |
| Secrets governance (fail-fast startup validation) | **Strong** | `backend/app/security_config.py` |
| Reliability (caching, request timeouts, degraded paths) | **Good** | `employees.py`, `src/hooks/use-employees.ts` |
| **JML — Joiner / Mover (employee)** | **Partial (automated)** | `backend/sync_azure_ad_to_db.py` |
| **JML — Leaver (employee)** | **Manual (gap)** | admin "InActive" toggle only |
| **JML — Developer (Joiner/Mover/Leaver)** | **Now documented** | `docs/developer-lifecycle/` |

The largest enterprise gaps are: (1) no automated employee **Leaver**
deprovisioning from Entra, (2) no durable **audit trail** for employee/admin
lifecycle actions, and (3) employee sync is **manual/CLI**, not scheduled.
See §8.

---

## 2. Architecture & trust boundaries

```
Browser (React SPA, Entra MSAL login)
   │  Bearer JWT (Entra access token → exchanged for app JWT)
   ▼
CloudFront/CDN (static site, CSP)  ──►  API Gateway → Lambda (Mangum) / FastAPI
                                             │
              ┌──────────────────────────────┼───────────────────────────┐
              ▼                               ▼                           ▼
        DynamoDB (employees,           S3 (private photos +          AWS KMS
        admins, leadership_access,      review attachments,          (envelope DEK
        reviews, goals, …)              presigned GET only)          for field crypto)
                                                                          │
                                                                     AWS Bedrock (AI)
```

- **Identity source of truth:** Azure Entra ID (Microsoft Graph). Employees,
  managers (`reporting_to`), department, location, and `usage_location` originate
  there and are synced into DynamoDB.
- **App boundary:** every API route requires a validated app JWT
  (`get_current_active_user`). Admin/leadership are resolved server-side, never
  trusted from the token claims.

---

## 3. Identity & Access Management (AuthN + AuthZ)

### 3.1 Authentication
- **Entra/MSAL + JWKS validation** — `backend/app/security.py:20` `JWKSValidator`:
  - Keys fetched from `login.microsoftonline.com/{tenant}/discovery/v2.0/keys`,
    cached 24h, **10s HTTP timeout** so a hung IdP cannot stall auth
    (`_jwks_http_timeout`, `security.py:26`).
  - **Tenant pinning:** always validates against the *configured* tenant, never the
    token's `tid` (`security.py:65`) — blocks cross-tenant token replay.
  - **Audience pinning:** only `client_id` / `api://client_id` accepted; Graph
    tokens explicitly rejected (`security.py:105-115`) — blocks cross-app replay.
  - Signature + `exp`/`nbf` enforced; issuer normalized and checked.
- **App JWT** — `HS256`, **15-minute** access token (`security.py:131`), `iat`
  stamped to bound absolute session lifetime across refreshes.
- **Local/password path** — bcrypt, 12 rounds (`security.py:134`). Used for
  mock/service users only; production identity is Entra.

### 3.2 Authorization model (roles)
Four effective principals, resolved server-side each request:

| Role | Source | Powers |
|---|---|---|
| **Admin** | `admins` DynamoDB table (`is_active`) | Full HR CRUD, reporting-line edits, bulk ops, diagnostics |
| **Leadership** | `leadership_access` allowlist table | Org-wide *read* of full (unredacted) employee data |
| **Manager** | `reporting_to` graph (`is_reporting_manager_of`) | View full records of direct reports |
| **Self** | email match | View/update own profile, upload own photo |
| **Coworker** | authenticated, none of above | Redacted directory view only |

- Admin resolution: `get_current_active_user` (`security.py:224`) queries
  `EmailIndex` GSI with GSI-missing scan fallback.
- Privilege gates: `require_admin_user`, `require_admin_or_leadership_user`
  (`security.py:273`, `328`).

### 3.3 Object-level authorization (BOLA/BFLA)
`backend/app/services/employee_authorization.py`:
- `can_view_employee_full` (`:57`) — privileged **or** self **or** reporting manager.
- `require_employee_write_access` (`:100`) — self-service edit or HR admin;
  **managers are view-only**.
- **Reporting-line changes are admin-only** — enforced again at the write path
  (`employees.py:982-992`): a `reporting_to` change by a non-admin returns 403.
  This is a deliberate JML control (only HR moves people in the org graph).

### 3.4 Field-level PII redaction
`redact_employee_record` (`employee_authorization.py:124`) strips a sensitive-field
allowlist (`_SENSITIVE_EMPLOYEE_FIELDS`, `:26`) — phone, DOB, gender, emergency
contacts, resignation reason/date, performance scores — for any viewer without full
access. Applied per-row on the directory list and on detail reads.

---

## 4. Data protection

### 4.1 Field-level encryption at rest
`backend/app/services/field_crypto.py` — **AES-256-GCM + AWS KMS envelope**:
- Toggle: `DYNAMODB_FIELD_ENCRYPTION_ENABLED` (safe no-op default).
- Only allowlisted fields (`config/field_encryption_allowlist.json`) are
  transformed (`plaintext → *_enc`); keys/GSI attributes stay cleartext by design.
- **Request-scoped DEK cache** (`contextvars`) avoids repeated KMS `Decrypt` per
  row/field; cache cleared per request in middleware (`main.py:290`).
- AAD-bound ciphertext (schema v1); legacy AWS Encryption SDK blobs still decrypt
  during backfill.
- Startup validation: `validate_field_encryption_config` (`main.py:266`).

### 4.2 Private object storage
`backend/app/services/s3_service.py` — no public bucket policy; short-lived
**presigned GET** URLs only. Photos stored as **stable S3 keys**, presigned at read
time (`resolve_photo_display_url`), never persisted as expiring URLs
(`employees.py:1125`). Bucket hardening in `s3_bucket_hardening.py`.

### 4.3 Input sanitization / XSS
- `employee_sanitization.py` — server-side payload sanitization on create/update
  (`sanitize_employee_payload`), raising `422` on violations.
- Frontend `src/lib/safe-image-url.ts`, `safe-internal-navigation.ts`,
  `safe-download.ts` — sanitize image `src`, internal nav, and downloads.

---

## 5. API safety & reliability

| Control | Where |
|---|---|
| **Rate limiting** (SlowAPI) — e.g. `120/min` list, `30/min` login | `rate_limit.py`, `employees.py:439`, `auth.py:60` |
| **Generic error envelope** — stack traces logged server-side only | `main.py:275-284`, `http_errors.py` |
| **Security headers** — `nosniff`, `X-Frame-Options: DENY`, Referrer-Policy, Permissions-Policy | `main.py:287-298` |
| **CORS** — explicit origin allowlist; `*` blocked with credentials | `main.py:239-306` |
| **Fail-fast startup** — weak/placeholder secret or missing Entra config aborts boot in prod-like envs | `security_config.py:71` |
| **Debug endpoints gated** — `/api/version-check`, `/api/routes-debug` return 404 unless `ENABLE_DEBUG_ENDPOINTS` | `main.py:311-351` |
| **Health split** — public `/health` (status only); operational detail behind admin (`/health/details`) | `main.py:448-470` |
| **List caching** — 120s in-memory employee cache, invalidated on write | `employees.py:45`, `_invalidate_employee_cache` |
| **Fast-first-page scan cap** — bounded DynamoDB scan for first paint | `employees.py:434` |
| **Client request timeouts** — 30s `AbortController` on directory fetches; guaranteed spinner-clear event | `src/hooks/use-employees.ts` (on `staging`) |
| **Bounded S3 presign** — single client + parallel signing (226× faster) | `s3_service.resolve_photo_display_urls` (`feature/security-fixes` only — see `CHANGELOG.md` "In progress") |

---

## 6. Governance controls

- **Feature flags & role permissions** — `feature_flags.py` + `config` provide
  `is_enabled`, `get_role_permissions`, `can_user_perform_action` for
  config-driven capability gating.
- **Environment classification** — `security_config.get_environment` treats
  `production/staging/uat/preprod/preview` as prod-like; AWS runtime without an
  explicit `ENVIRONMENT` defaults to production (fail-safe).
- **Secrets** — never in code; `SECURITY_SECRET_KEY`, Entra IDs, KMS ARN sourced
  from env.
- **Audit events (partial)** — structured `audit_event` log records for review
  cycle create/update/delete/export (`reviews.py:521,637,725,2146`). **Not yet
  present for employee or admin lifecycle actions** (gap — §8).
- **Repo hygiene** — `.gitignore` hardened to blanket-ignore `.env*` and
  `__pycache__/`/`*.pyc`; `.pre-commit-config.yaml` + `.gitleaks.toml` gate
  secrets at commit time; `commitlint.config.cjs` enforces Conventional
  Commits; `CHANGELOG.md` tracks notable changes. See
  `docs/developer-lifecycle/` for the process these tools support.

---

## 7. Developer / Identity Lifecycle Management — **JML**

> "Developer Governance" here = the **identity lifecycle** of every person in the
> org graph. Zenith models this as an HR record lifecycle sourced from Entra ID.
> For the separate **developer access** JML process (GitHub/AWS/Azure/CI), see
> `docs/developer-lifecycle/`.

### 7.1 Source of truth & flow

```
Azure Entra ID ──(Graph export)──► azure_ad_users.json ──► sync_azure_ad_to_db.py ──► DynamoDB
      (JML authority)                (fetch_azure_ad_users.py)      (CLI, gated)      (app store)
```

- `fetch_azure_ad_users.py` pulls users/managers/teams from Graph.
- `sync_azure_ad_to_db.py` reconciles into `zenith-hr-employees`.

### 7.2 JOINER

| Step | Mechanism | Code |
|---|---|---|
| Identity created | Entra ID (external) | — |
| App record provisioned | Sync insert (`insert_only`/full) — maps display name, email (lowercased), dept, title, location; `status=active` | `sync_azure_ad_to_db.py:280,294,486` |
| Manual add (off-cycle hire) | Admin `POST /api/employees/` | `employees.py:770` |
| First access | Entra MSAL login → app JWT; non-admin by default | `security.py:149-166,224` |
| Dedup safety | Case-insensitive email match prevents duplicates | `sync…:52` |
| Exclusions | `excluded_users.json` allowlist (service/system accounts) | `sync…:339` |

**Controls:** email normalized lowercase everywhere; `--dry-run` preview; explicit
confirmation prompt before writes; `SafePath` validation on the JSON input
(`safe_path.py`).

### 7.3 MOVER

| Change | Mechanism | Code |
|---|---|---|
| Reporting-line (manager) change | Sync sets `reporting_to` by manager email; **app edits admin-only** | `sync…:116`, `employees.py:982-992` |
| Location / office change | Sync derives from Teams membership + address signals (Chennai/Hyderabad/USA/Remote) | `sync…:166,195,238` |
| Role / dept / profile edits | Self-service (own record) or HR admin `PUT /api/employees/{id}` | `employees.py:946` |
| License/country (`usage_location`) | Carried from Entra usageLocation | `models/employee.py:33` |
| Cache coherence | Write invalidates list + dashboard cache | `employees.py:1006` |

**Controls:** `reporting_to` mutations rejected for non-admins at the API
(defense-in-depth beyond object-level check); `skip_if_already_set` avoids
clobbering manual overrides; location sync **never downgrades** an explicit
`Remote` (`sync…:259`).

### 7.4 LEAVER

| Step | Mechanism | Code | Status |
|---|---|---|---|
| Mark inactive | Admin "InActive Profiles" toggle → `status=inactive` | `employees.py` PUT; UI `Directory.tsx` | ✅ manual |
| Record resignation | `resignation_date`, `reason_for_resignation` fields | `models/employee.py:39-40` | ✅ |
| Hide from directory | Inactive filtered from non-admin views by default | `employees.py:530-535,552` | ✅ |
| Redact leaver PII | Resignation reason/date in sensitive allowlist | `employee_authorization.py:35-36` | ✅ |
| Hard delete | Admin `DELETE /api/employees/{id}` (privileged) | `employees.py:1068` | ✅ (destructive) |
| **Auto-deprovision on Entra removal** | — | — | ❌ **gap** |
| **Revoke app access on leave** | Relies on Entra disabling the account (JWT stops validating) | implicit | ⚠️ indirect |

**Key gap:** the sync **never deactivates** records for users who disappeared from
the Entra export — Leaver is entirely manual via the admin toggle. Access is only
truly revoked when Entra disables the account (JWKS/JWT then fails). There is no
reconciliation that flips `status=inactive` for departed users.

### 7.5 JML control matrix (RACI-style)

| Control | Joiner | Mover | Leaver |
|---|---|---|---|
| Automated (Entra sync) | ✅ insert | ✅ manager+location | ❌ none |
| Admin-driven | ✅ add | ✅ edit / reporting | ✅ inactivate/delete |
| Self-service | — | ✅ own profile | — |
| Access enforced by | Entra + app JWT | admin-only reporting edits | Entra disable + inactive flag |
| PII protection | redaction | redaction | redaction |
| Audit trail | ❌ | ❌ | ❌ |

---

## 8. Gaps & prioritized recommendations

| # | Gap | Risk | Recommendation | Cost |
|---|---|---|---|---|
| 1 | **No automated Leaver** — departed Entra users stay `active` | Orphaned access / stale directory | Add a reconcile pass in `sync_azure_ad_to_db.py`: users present in DB but absent from Entra export → set `status=inactive` (never hard-delete). Gate behind `--deactivate-missing`, `--dry-run` first. | S |
| 2 | **No durable audit trail** for employee/admin JML actions | Compliance / forensics | Reuse the existing `audit_event` pattern (`reviews.py`) for create/update/inactivate/delete/reporting-change; write to a dedicated append-only `audit` table or structured log sink. Capture actor, target, before/after, timestamp. | M |
| 3 | **Sync is manual CLI** | Drift between Entra and app | Schedule the sync (EventBridge → Lambda) daily; keep `--dry-run` diff in the run log. **No new standing cost** beyond invocation. | M |
| 4 | **Hard delete** loses history | Irreversible; breaks referential history | Prefer soft-delete (`status=inactive` + `deleted_at`); restrict hard-delete to a separate purge job with retention policy. | S |
| 5 | No explicit MFA/Conditional Access assertion in app | Assumes Entra enforces | Document the Entra Conditional Access baseline (MFA, device compliance) as a control owned upstream; optionally assert `amr`/`acr` claims at token validation. | S |
| 6 | Location inference relies on **hard-coded team/keyword maps** | Silent misclassification | Move `derive_location_from_teams` / keyword lists (`sync…:166-236`) into config; add an "unmapped" report. | S |
| 7 | Admin resolution is a **GSI query per request** | Latency/throttle at scale | Cache admin/leadership membership per request (short TTL), like the DEK cache. No Redis needed. | S |
| 8 | **No developer JML process existed** | Access sprawl, slow offboarding | ✅ **Addressed** — see `docs/developer-lifecycle/` | S |

Cost legend: S ≤ ½ day, M ≈ 1–3 days. None require new paid infrastructure.

---

## 9. Reliability posture (recent work)

- **Directory load** hardened: 30s client timeout + guaranteed loading-state
  clear (`use-employees.ts`, on `staging`) — the "Loading more employees…"
  spinner can no longer hang forever.
- **Photo presign N+1** eliminated on `feature/security-fixes`: one S3 client +
  parallel signing (`resolve_photo_display_urls`), benchmarked **193.7s →
  0.86s for 300 rows (226×)**. Not yet merged to `staging` — see
  `CHANGELOG.md`.
- In-memory list cache + fast-first-page scan cap keep first paint fast without
  external cache infrastructure.

---

## 10. Control ownership summary

| Layer | Owner | Primary artifacts |
|---|---|---|
| Identity / MFA / Conditional Access | Azure Entra (IT) | tenant config |
| App AuthN/AuthZ | Backend | `security.py`, `employee_authorization.py` |
| Data protection | Backend + AWS KMS | `field_crypto.py`, `s3_service.py` |
| Employee JML sync | Ops (CLI, → schedule) | `sync_azure_ad_to_db.py`, `fetch_azure_ad_users.py` |
| **Developer JML** | Eng lead / repo owner | `docs/developer-lifecycle/` |
| Audit / compliance | **Unassigned (gap #2)** | — |
| Feature governance | Product | `feature_flags.py`, `config` |

---

*Appendix — key files:* `backend/app/security.py`, `security_config.py`,
`services/employee_authorization.py`, `services/field_crypto.py`,
`services/s3_service.py`, `routers/employees.py`, `routers/auth.py`, `main.py`,
`sync_azure_ad_to_db.py`, `src/hooks/use-employees.ts`,
`docs/developer-lifecycle/`.
