# Zenith HR Pulse — DynamoDB field-level encryption (production design)

**Document type:** Technical design & implementation strategy  
**Repository:** infosrv-zenith-hr-pulse  
**Application / service name:** `zenith-hr-pulse` (`SERVICE_NAME` in `.env.prod`; Serverless default service name is `zenith-hr-platform` if `SERVICE_NAME` is unset)  
**IaC file:** `backend/serverless.yml` (Serverless Framework 3.x)  
**Scope:** Sensitive employee, review, feedback, goals, recruitment, and org-related data in Amazon DynamoDB  
**Compliance lens:** GDPR, SOC 2, enterprise security baseline  
**Last updated:** 2026-04-02  

> **Secrets:** Do not copy production credentials, TLS certificate ARNs, database URIs, or account identifiers into this document. Use environment variables and a secrets store. Rotate any secret that has been committed to git.

---

## 0. Analysis of this codebase (as-is)

### 0.1 Current data path

| Component | Path | Role |
|-----------|------|------|
| DynamoDB access | `backend/app/database_dynamodb.py` | `DynamoDBService`, table name map, `format_dynamodb_item`, `parse_dynamodb_item` |
| IaC / permissions | `backend/serverless.yml` | `custom.dynamoDbTables` maps env vars to table names; `provider.iam.role` grants scoped DynamoDB actions; ECS `TaskExecutionRole` also defines broad `dynamodb:*` (see §0.6) |
| Domain models | `backend/app/models/*.py` | `employee.py`, `review.py`, `goal.py`, `feedback.py`, `recruitment.py`, `admin.py` |
| API routers | `backend/app/routers/*.py` | Read/write via tables above |
| Auth | `backend/app/security.py`, `routers/auth.py` | Azure AD JWT validation; HS256 tokens for legacy path |

**Finding:** Items are serialized with `format_dynamodb_item` and deserialized with `parse_dynamodb_item` without application-level encryption. DynamoDB **SSE** may be enabled in AWS independently of this repo; that is **not** visible in application code.

### 0.2 Tables registered in `DynamoDBService`

`employees`, `users`, `admin`, `review`, `reviewDraft`, `clientSatisfaction`, `clients`, `competencies`, `cycle`, `engagementActivities`, `resourceMappings`, `revenueForecasts`, `goals`, `feedback`, `recruitment`, `features`.

### 0.3 Sensitive fields by model (candidates for encryption)

| Entity | Examples (non-exhaustive) |
|--------|---------------------------|
| **Employee** (`models/employee.py`) | `phone`, `mobile`, `emergency_contact_*`, `date_of_birth`, `gender`, `bio`, `reason_for_resignation`, `name` (if policy requires), structured `tech_stack` if it embeds PII |
| **Review** (`models/review.py`) | `comments`, `strengths`, `improvements`, `ratings` (policy-dependent), `metadata`, `attachments` if they contain narrative |
| **Goal** (`models/goal.py`) | `description`, milestone `evidence`, `userComment`, `managerComment` |
| **Feedback** (`models/feedback.py`) | `title`, `description` |
| **Recruitment** (`models/recruitment.py`) | Candidate / workflow narrative fields |
| **Admin** (`models/admin.py`) | `name`, `department`, `position` (email often kept for GSI — see §4) |

### 0.4 Recommended integration points in *this* repo

1. **Preferred:** A new module e.g. `backend/app/services/field_crypto.py` (or `crypto/field_encryption.py`) called from **repository-style** code paths that already call `format_dynamodb_item` / `parse_dynamodb_item`, or immediately **after** parse / **before** format in a thin wrapper used by routers.
2. **Alternative:** Extend `format_dynamodb_item` / `parse_dynamodb_item` with optional hooks — higher coupling; use only if you centralize all writes/reads there.
3. **Avoid:** Encrypting inside individual routers without a shared allowlist and tests.

### 0.5 Non-goals of this document

- Replacing **bcrypt** for passwords (not applicable if Azure AD is primary; mock users in `models/auth.py` are dev-only).
- Changing **frontend** directory UI without a separate UX spec for masked fields.

### 0.6 Infrastructure inventory (`serverless.yml` + production env pattern)

**Runtime (ECS Fargate):** `ZenithTaskDefinition` injects environment variables including all `DYNAMODB_TABLE_*` names. Pattern: `zenith-hr-<entity>-${self:provider.stage}` (e.g. stage `prod` → `zenith-hr-employees-prod`). Log group: `/ecs/zenith-hr-pulse-${stage}`. Cluster name: `zenith-hr-pulse-${stage}`.

**Serverless `custom.dynamoDbTables` → env sources:** each logical name resolves from `process.env` at deploy time via `${env:DYNAMODB_TABLE_…}` (see `backend/serverless.yml`).

**Production DynamoDB tables** (from `.env.prod` at repo root and `backend/.env.prod`; `STAGE=prod`, `AWS_REGION=us-east-1`):

| `DynamoDBService` key | Environment variable | Example physical table name (prod) |
|----------------------|----------------------|-------------------------------------|
| `employees` | `DYNAMODB_TABLE_EMPLOYEES` | `zenith-hr-employees-prod` |
| `users` | `DYNAMODB_TABLE_USERS` | `zenith-hr-users-prod` |
| `admin` | `DYNAMODB_TABLE_ADMIN` | `zenith-hr-admin-prod` |
| `review` | `DYNAMODB_TABLE_REVIEW` | `zenith-hr-review-prod` |
| `reviewDraft` | `DYNAMODB_TABLE_REVIEW_DRAFT` | `zenith-hr-review-draft-prod` |
| `clientSatisfaction` | `DYNAMODB_TABLE_CLIENT_SATISFACTION` | `zenith-hr-client-satisfaction-prod` |
| `clients` | `DYNAMODB_TABLE_CLIENTS` | `zenith-hr-clients-prod` |
| `competencies` | `DYNAMODB_TABLE_COMPETENCIES` | `zenith-hr-competencies-prod` |
| `cycle` | `DYNAMODB_TABLE_CYCLE` | `zenith-hr-cycle-prod` |
| `engagementActivities` | `DYNAMODB_TABLE_ENGAGEMENT_ACTIVITIES` | `zenith-hr-engagement-activities-prod` |
| `resourceMappings` | `DYNAMODB_TABLE_RESOURCE_MAPPINGS` | `zenith-hr-resource-mappings-prod` |
| `revenueForecasts` | `DYNAMODB_TABLE_REVENUE_FORECASTS` | `zenith-hr-revenue-forecasts-prod` |
| `goals` | `DYNAMODB_TABLE_GOALS` | `zenith-hr-goals-prod` |
| `feedback` | `DYNAMODB_TABLE_FEEDBACK` | `zenith-hr-feedback-prod` |
| `recruitment` | `DYNAMODB_TABLE_RECRUITMENT` | `zenith-hr-recruitment-prod` |
| `features` | `DYNAMODB_TABLE_FEATURES` | `zenith-hr-feature-flags-prod` |

**Serverless `custom.dynamoDbTables`:** defines env-backed names through `revenueForecasts` only. **`goals`**, **`feedback`**, **`recruitment`**, and **`features`** are **not** in that map but are set on the **ECS container** (`ZenithTaskDefinition` in `backend/serverless.yml`) and in **`.env.prod`** — same physical naming pattern `zenith-hr-<name>-${STAGE}`. When tightening IAM away from `dynamodb:*`, add explicit ARNs for these four tables.

**Related production env (non-secret naming only):** `SERVICE_NAME`, `ENVIRONMENT`, `AWS_REGION`, `ECR_REPOSITORY`, `S3_BUCKET_PHOTOS`, `S3_BUCKET_DOCUMENTS`, `S3_BUCKET_DOMAIN`, `S3_PHOTOS_PREFIX`, `BEDROCK_MODEL_ID`, `BEDROCK_REGION`, `CORS_ORIGINS`, `ECS_CLUSTER_NAME`, `ECS_SERVICE_NAME`, `ECS_TASK_FAMILY`, `ALB_HEALTH_CHECK_PATH`. Azure AD client/tenant IDs are supplied as `AZURE_MSAL_CLIENT_ID` and `AZURE_MSAL_TENANT_ID` in task env (values are secrets — store in SSM/Secrets Manager, not in docs).

**IAM note:** In `serverless.yml`, `TaskExecutionRole` → `ECSAppPermissions` allows `dynamodb:*`, `s3:*`, and `bedrock:*` on `Resource: "*"`. The `provider.iam.role` block is **narrower** (explicit table ARNs for a subset of tables). For field encryption, add **scoped** `kms:*` (or specific KMS actions) on the **CMK ARN only** — do **not** mirror the `dynamodb:*` wildcard pattern for KMS.

**Suggested new env vars for field encryption (add to `.env`, `.env.prod`, and ECS task env in `serverless.yml`):**

| Variable | Purpose |
|----------|---------|
| `DYNAMODB_FIELD_ENCRYPTION_KMS_KEY_ARN` | CMK or alias ARN for envelope encryption (e.g. `arn:aws:kms:us-east-1:<account>:alias/zenith-hr-pulse-field-crypto-prod`) |
| `DYNAMODB_FIELD_ENCRYPTION_ENABLED` | `true` / `false` for staged rollout |
| `DYNAMODB_FIELD_ENCRYPTION_CONTEXT_APP` | Optional; default `SERVICE_NAME` or `zenith-hr-pulse` for KMS encryption context |

### 0.7 Representative GSIs (plaintext keys / filters)

Defined in `serverless.yml` CloudFormation resources (names matter for what must stay queryable):

- **Employees** (`zenith-hr-employees-${stage}`): `DepartmentIndex`, `EmailIndex`, `EmployeeIdIndex`, `Id-Index`.
- **Admin** (`zenith-hr-admin-${stage}`): `CreatedAtIndex`, `EmailIndex`, `EmployeeIdIndex`.
- **Review** (`zenith-hr-review-${stage}`): `EmployeeIndex`, `EntityTypeIndex`, `ReviewerIndex`, `ReviewIdIndex`, `ReviewTypeIndex`.

Keep **partition/sort key attributes** and **GSI key attributes** plaintext unless you adopt deterministic tokens or parallel lookup attributes (see §4).

### 0.8 Implementation status (staging-safe default)

| Artifact | Purpose |
|----------|---------|
| `backend/app/services/field_crypto.py` | AWS Encryption SDK + KMS; `ENCRYPTED_FIELDS_BY_TABLE` allowlist (empty by default) |
| `backend/app/database_dynamodb.py` | Optional `table_logical_name` on `format_dynamodb_item` / `parse_dynamodb_item`; existing callers unchanged |
| `backend/requirements.txt` | `aws-encryption-sdk>=3.1.0,<4.0.0` |
| `backend/.env.staging`, `backend/.env.prod`, root `.env.prod` | `DYNAMODB_FIELD_ENCRYPTION_ENABLED=false`, empty KMS ARN |
| `backend/serverless.yml` (`ZenithTaskDefinition`) | `SERVICE_NAME`, encryption env vars (defaults keep encryption off) |
| `/health` | `field_encryption` object from `describe_status()` (no secrets) |

**Staging / production without touching DynamoDB data:** leave `DYNAMODB_FIELD_ENCRYPTION_ENABLED=false` and **do not** add field names to `ENCRYPTED_FIELDS_BY_TABLE`. No router passes `table_logical_name` yet, so encrypt/decrypt hooks never run. When you are ready for a pilot table, set a KMS CMK ARN, set `enabled=true`, add fields to the allowlist, add scoped `kms:*` IAM on that CMK, and pass `table_logical_name` only on the chosen code paths.

---

## 1. Executive summary

**Recommendation:** Use **AWS KMS (customer managed keys, CMKs)** with **envelope encryption** (AES-256-GCM or equivalent AEAD) for **field-level encryption** of sensitive attributes. Keep **email** and **UUID** (and other key/GSI attributes) plaintext for indexing and querying per product policy. Implement crypto in a **dedicated `FieldCryptoService`** invoked from the **service/repository layer**. Prefer the **AWS Encryption SDK** (Python for this repo; patterns below also note Node/Java). Use **DynamoDB SSE-KMS** on tables as baseline **at-rest** protection; it does **not** replace client-side field encryption against privileged `dynamodb:GetItem` access. Align KMS **encryption context** with `SERVICE_NAME`, `STAGE`, and logical table names from §0.6.

---

## 2. Encryption strategy

### 2.1 Client-side vs server-side

| Approach | What it is | Enterprise use |
|----------|------------|----------------|
| **DynamoDB SSE** (SSE-AWS or **SSE-KMS**) | AWS encrypts storage for the table. | **Always enable** (prefer **SSE-KMS** with CMK for control and audit). |
| **Client-side / application field encryption** | App encrypts attribute values before `PutItem`/`UpdateItem`. | **Required** when the threat model includes DB admins, broad IAM, backup export, or compliance expectations on logical protection of PII. |

**Zenith HR Pulse:** Do **both**: SSE-KMS + **field-level** encryption for HR/review/feedback payloads.

### 2.2 Field-level vs full-record

| Option | Pros | Cons |
|--------|------|------|
| **Full-record** (single blob) | Simple conceptually | Breaks GSIs, filters, partial updates, stream consumers. |
| **Field-level** (selected attributes) | Keeps PK/SK/GSI plaintext; incremental rollout; tunable cost | Requires **per-entity allowlists** and versioning. |

**Recommendation:** **Field-level** encryption with **`enc_schema_version`** (or SDK header) for forward compatibility.

### 2.3 Trade-offs

- **Security vs queryability:** Ciphertext is not substring-searchable without extra design (tokens, external search).
- **Latency:** KMS dominates; **envelope encryption + DEK caching** addresses scale.
- **Complexity:** Centralize; use **AWS Encryption SDK** to avoid custom crypto errors.

---

## 3. AWS services and architecture

### 3.1 KMS

- **CMK per environment:** e.g. `alias/zenith-hr-pulse-field-crypto-dev`, `…-staging`, `…-prod` (match `STAGE` / `ENVIRONMENT` from `.env.prod`).
- **Key policy:** data plane (`GenerateDataKey`, `Decrypt`) for **ECS task role** / **Lambda role** only; administrative actions for **security/IAM admin** — **separation of duties**.
- **Encryption context** (mandatory): e.g. `{ "app": "zenith-hr-pulse", "stage": "prod", "logical_table": "employees", "field_group": "pii", "ddb_table": "zenith-hr-employees-prod" }` (use env-driven values; `ddb_table` should match `DYNAMODB_TABLE_*` for the item).

### 3.2 Envelope encryption

1. `GenerateDataKey` → plaintext DEK + ciphertext DEK (wrapped by CMK).
2. Encrypt each field value (UTF-8 or JSON bytes) with **AES-GCM** via Encryption SDK.
3. Store ciphertext (e.g. base64 string attribute `phone_enc` or SDK-framed blob).
4. Clear plaintext DEK from memory; **never** log DEK or plaintext PII.

### 3.3 DynamoDB Encryption Client vs AWS Encryption SDK

| Tool | Role |
|------|------|
| **AWS Encryption SDK** | **Default** for encrypting individual field values placed in normal attributes. Fits hybrid plaintext/ciphertext items. |
| **AWS Database Encryption SDK for DynamoDB** | Attribute-level crypto + **item signing**; use when tamper-evident rows are required. |

**Practical choice for Zenith HR Pulse:** Start with **AWS Encryption SDK** in Python; evaluate Database Encryption SDK if **signing** becomes a requirement.

### 3.4 Key rotation

| Layer | Behavior |
|-------|----------|
| **KMS CMK** | Enable **automatic key rotation** (symmetric CMKs). |
| **Data keys** | Short-lived; cache only with TTL and byte limits. |
| **Re-encrypt migration** | Background job to re-encrypt under new CMK if manual rotation is required. |

### 3.5 Architecture (textual)

```
[Browser] → TLS → [ZenithALB (HTTPS, ACM) → ZenithTargetGroup :5000] → [FastAPI in ECS Fargate]
                                                                              │
                                                    ECS task role (+ least-privilege KMS) │
                                                                              │
                                                    FieldCryptoService          │
                                                      ├─ AWS Encryption SDK   │
                                                      ├─ KMS GenerateDataKey    │
                                                      │    / Decrypt (cached)   │
                                                      └─ encryption context     │
                                                                              │
                                                    DynamoDB (SSE-KMS)          │
                                                      us-east-1 tables per §0.6 │
                                                      PK/SK/email/uuid plain   │
                                                      *_enc ciphertext attrs     │
```

**Observability:** CloudTrail for KMS; CloudWatch alarms on `Decrypt` / `GenerateDataKey` failures and throttles.

---

## 4. Data modeling considerations

### 4.1 Plaintext (per your requirements + typical keys)

- **Partition key / sort key** (often UUID).
- **Email** (for `EmailIndex`-style GSIs used in this codebase).
- Low-sensitivity filters: `status`, `usage_location`, department codes — **if** accepted by legal/privacy review.

### 4.2 Encrypted attributes

Store either:

- **Suffix convention:** `phone` → `phone_enc` (plaintext removed after migration), **or**
- **Single map:** `encrypted_payloads: { "phone": "<blob>", ... }` (fewer top-level names; harder partial updates).

### 4.3 Searchable sensitive attributes

- **Exact match without plaintext in table:** HMAC-SHA256 with a key from KMS/Secrets Manager in a dedicated GSI attribute (advanced).
- **Prefix / full-text:** External search (OpenSearch) with strict IAM and no PII in application logs.

### 4.4 Hybrid item shape (example)

```text
id (PK), email (GSI), usage_location, department  → plaintext
first_name_enc, phone_enc, bio_enc                → ciphertext
enc_schema_version: 1
```

---

## 5. Implementation details

### 5.1 Layering (clean architecture)

1. Router → service use case.
2. Service → repository building DynamoDB items.
3. **Repository** calls `FieldCryptoService.encrypt_item_for_table(table_logical_name, item)` before `put_item` / `update_item`.
4. After `get_item` / `query`, call `decrypt_item_for_table(...)`.

Configuration: e.g. `ENCRYPTED_FIELDS = { "employees": ["phone", "mobile", ...], "review": ["comments", ...] }`.

### 5.2 Write path

1. Build plaintext dict.
2. For each configured field: serialize → encrypt → write to target attribute name.
3. Optionally remove plaintext field names in same `UpdateItem` after migration cutover.

### 5.3 Read path

1. Fetch item (use `ProjectionExpression` when possible).
2. Decrypt each `*_enc` (or map entries); merge into domain model.
3. Do not attach decrypted values to **logs**.

### 5.4 Node.js (AWS Encryption SDK — reference)

```javascript
import { buildClient, CommitmentPolicy } from '@aws-crypto/client-node';
import { KmsKeyringNode } from '@aws-crypto/kms-keyring-node';

const { encrypt, decrypt } = buildClient(CommitmentPolicy.REQUIRE_ENCRYPT_REQUIRE_DECRYPT);
const keyring = new KmsKeyringNode({ generatorKeyId, keyIds });

const baseContext = {
  app: process.env.SERVICE_NAME || 'zenith-hr-pulse',
  stage: process.env.STAGE || 'prod',
};

export async function encryptField(plaintextUtf8, table, fieldName) {
  const { result } = await encrypt(keyring, Buffer.from(plaintextUtf8, 'utf8'), {
    encryptionContext: { ...baseContext, table, field: fieldName },
  });
  return Buffer.from(result).toString('base64');
}

export async function decryptField(ciphertextB64, table, fieldName) {
  const { plaintext, messageHeader } = await decrypt(
    keyring,
    Buffer.from(ciphertextB64, 'base64')
  );
  // Validate messageHeader.encryptionContext against expected table/field
  return plaintext.toString('utf8');
}
```

### 5.5 Python (this repository)

- Add dependency: `aws-encryption-sdk`.
- Use `aws_encryption_sdk` with KMS key ARN from **`DYNAMODB_FIELD_ENCRYPTION_KMS_KEY_ARN`** (see §0.6). Gate behavior with **`DYNAMODB_FIELD_ENCRYPTION_ENABLED`** during rollout.
- Implement `encrypt_string` / `decrypt_string` mirroring Node pattern; use **async** thread pool if calling from async FastAPI handlers to avoid blocking the event loop, or use **aiobotocore**-compatible patterns as recommended in Encryption SDK docs for your version.
- Table names are already loaded via existing env vars (`DYNAMODB_TABLE_EMPLOYEES`, etc.); pass the **resolved** table name into encryption context, not only the logical key.

### 5.6 Java

- `aws-encryption-sdk-java` with `KmsMasterKeyProvider` / keyrings; same encryption context rules.

### 5.7 `backend/serverless.yml` / IAM

1. **`provider.iam.role.statements`:** Add a new statement for KMS used by field encryption:
   - Actions: `kms:Decrypt`, `kms:GenerateDataKey`, `kms:DescribeKey` (and `kms:Encrypt` only if your pattern requires it).
   - Resource: **only** the CMK ARN (from `${env:DYNAMODB_FIELD_ENCRYPTION_KMS_KEY_ARN}` or a constructed ARN), **not** `*`.
   - Optional: `Condition` on `kms:EncryptionContext` for keys such as `app`, `stage`.

2. **`ZenithTaskDefinition` → Container `Environment`:** Add `DYNAMODB_FIELD_ENCRYPTION_KMS_KEY_ARN`, `DYNAMODB_FIELD_ENCRYPTION_ENABLED`, and optional `DYNAMODB_FIELD_ENCRYPTION_CONTEXT_APP` so the running API matches local `.env.prod`.

3. **Hardening:** Replace the `TaskExecutionRole` `ECSAppPermissions` `dynamodb:*` / `s3:*` / `bedrock:*` on `Resource: "*"` with **table-scoped** ARNs (mirror `provider.iam.role`) plus explicit S3 bucket ARNs and Bedrock model ARNs when possible — independent of encryption work but required for production least privilege.

---

## 6. Performance and scalability

### 6.1 Latency

- KMS: ~1–3 ms per unwrap (region-dependent).
- Local AES-GCM: negligible vs network.

**Mitigations:** Encryption SDK **data key caching**; parallel decrypt with bounded concurrency; **ProjectionExpression** to avoid large blobs.

### 6.2 Batch operations

`BatchWriteItem`: encrypt each item pre-flight; respect **400 KB** item limit and Lambda timeouts for large batches.

### 6.3 Caching decrypted data

- **Request scope only** in memory.
- **Avoid** Redis for decrypted PII unless strictly justified (TTL, encryption at rest, locked-down IAM).
- **Never** cache HR payloads on public CDNs.

---

## 7. Security best practices

### 7.1 IAM (least privilege)

- **`provider.iam.role`:** Already scopes DynamoDB to specific table ARNs under `${self:custom.dynamoDbTables.*}` — align any new tables (goals, feedback, recruitment, features) with explicit ARNs if not already listed there.
- **`TaskExecutionRole`:** Today allows `dynamodb:*` on `*`; treat as **technical debt** and tighten before relying on KMS alone for compliance stories.
- **KMS:** Scope to **one CMK ARN** per env; use encryption context conditions where practical.

### 7.2 Key access

- No keys in git; CI via **OIDC** to AWS.
- Use **Secrets Manager** / SSM for **non-KMS** app secrets only.

### 7.3 Logging

- Redact PII in structured logs; remove debug prints of tokens (see `security.py` — avoid logging token prefixes in production).

### 7.4 Auditing

- CloudTrail on KMS APIs.
- GDPR: **delete item** for erasure requests; document lawful basis and retention in ROPA/DPIA.

---

## 8. DevOps and deployment

### 8.1 CI/CD

- **OIDC**-based AWS role for pipelines.
- Infrastructure (KMS aliases, key policies) via **Terraform/CDK**; app reads **alias ARN** from env.

### 8.2 Environment separation

- Separate CMKs or aliases per **dev/staging/prod**.
- Do not refresh lower env from prod without **sanitization** or **re-encryption**.

### 8.3 Rollback

- Maintain **read compatibility** with plaintext during migration (`dual-read`).
- Feature flag **encrypt on write** before **require ciphertext on read**.

---

## 9. Migration strategy (existing DynamoDB data)

### 9.1 Phases

1. Deploy **decrypt path**: if `*_enc` present, decrypt; else use legacy plaintext.
2. **Backfill:** parallel Scan segments → `UpdateItem` to add encrypted attrs.
3. Switch **writes** to encrypted-only.
4. **Remove** plaintext fields in a second pass.
5. Remove dual-read code.

### 9.2 Zero-downtime

- Prefer **dual-read** over long **dual-write** of full PII to limit storage and consistency issues.

### 9.3 Backfill execution

- ECS/Fargate task or Lambda + SQS with **segment workers**.
- **On-demand** capacity or provisioned WCU planning; **exponential backoff** on throttling.
- **Checkpoint** progress (DynamoDB metadata table or S3).

### 9.4 PITR

- Enable **Point-in-Time Recovery** before mass migration; validate restore in a sandbox account.

---

## 10. Testing and validation

### 10.1 Correctness

- Unit tests with **mocked KMS** or **local stack** (limited KMS fidelity).
- Integration tests against a **dev CMK**.

### 10.2 Integrity

- Tampered ciphertext must **fail** AEAD verification; map to 500 + alert.

### 10.3 Failure handling

- **KMS down:** fail closed (do not write plaintext); return **503** with generic message.
- **Partial decrypt failure:** policy-driven — fail request or omit field with audit.

### 10.4 GDPR data subject export

- Batch job: decrypt in memory, write to customer-controlled encrypted bucket, **audit** all access.

---

## 11. Actionable checklist (ordered)

1. Enable **SSE-KMS** on all DynamoDB tables in §0.6 (CMK per compliance needs).  
2. Create **`alias/zenith-hr-pulse-field-crypto-<stage>`** and restrictive key policy.  
3. Add **`DYNAMODB_FIELD_ENCRYPTION_*`** env vars to `.env.prod`, `backend/.env.prod`, and **`ZenithTaskDefinition`** in `backend/serverless.yml`.  
4. Add `ENCRYPTED_FIELDS` config per logical table (`employees`, `review`, `goals`, `feedback`, …).  
5. Implement **`FieldCryptoService`** using **AWS Encryption SDK** + encryption context (include physical `DYNAMODB_TABLE_*` name in context).  
6. Wire into write/read paths (repository layer); add **dual-read** + **`DYNAMODB_FIELD_ENCRYPTION_ENABLED`**.  
7. Update **`backend/serverless.yml`** IAM (`provider.iam.role` + eventually **ECS task role**) with scoped KMS permissions.  
8. Canary backfill **1%** of items; watch KMS TPS and DDB throttles.  
9. Full **backfill**; verify counts and spot-check API responses.  
10. Strip legacy plaintext attributes; remove dual-read.  
11. CloudWatch **alarms** + **runbooks**; update **SOC 2 / GDPR** evidence.  

---

## 12. References (external)

- [AWS KMS Developer Guide](https://docs.aws.amazon.com/kms/latest/developerguide/)
- [AWS Encryption SDK](https://docs.aws.amazon.com/encryption-sdk/latest/developer-guide/)
- [AWS Database Encryption SDK for DynamoDB](https://docs.aws.amazon.com/database-encryption-sdk/latest/devguide/)
- [DynamoDB encryption at rest](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/EncryptionAtRest.html)

---

*This document is intended for engineering and security review. Legal/privacy teams should approve field classifications and plaintext email/UUID retention under GDPR and company policy.*
