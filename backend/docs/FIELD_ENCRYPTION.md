# DynamoDB field-level encryption

Sensitive attributes are encrypted **before** `put_item` using **AES-256-GCM** with a **data key** wrapped by **AWS KMS** (`GenerateDataKey` / `Decrypt`). Ciphertext is stored in DynamoDB under `{field}_enc` (JSON envelope). Index / query attributes (e.g. `email`, `id`, `pk`/`sk`) stay plaintext.

## Environment variables

| Variable | Purpose |
|----------|---------|
| `DYNAMODB_FIELD_ENCRYPTION_ENABLED` | `true` to encrypt on write and decrypt on read |
| `DYNAMODB_FIELD_ENCRYPTION_KMS_KEY_ARN` | CMK ARN for **v1** (and default for v2 if `..._V2` unset) |
| `DYNAMODB_FIELD_ENCRYPTION_KMS_KEY_ARN_V2` | Optional second CMK for **v2** writes / rotation |
| `DYNAMODB_FIELD_ENCRYPTION_VERSION` | `v1` or `v2` — version label for new envelopes and AAD |
| `DYNAMODB_FIELD_ENCRYPTION_COMPRESS` | `true` to zlib-compress large JSON payloads before encrypt |
| `DYNAMODB_FIELD_ENCRYPTION_DECRYPT_ON_READ` | `true` (default): decrypt existing `*_enc` when KMS is configured, even if `ENABLED=false` (prod rollout) |
| `DYNAMODB_FIELD_ENCRYPTION_CONTEXT_APP` | Optional KMS context; defaults to `SERVICE_NAME` |
| `DYNAMODB_FIELD_ENCRYPTION_ALLOWLIST_FILE` | Path to JSON allowlist relative to `backend/` (default `config/field_encryption_allowlist.json`) |
| `DYNAMODB_FIELD_ENCRYPTION_ALLOWLIST_JSON` | Optional inline JSON override for allowlist (advanced) |

## Allowlisted fields

Configured in `backend/config/field_encryption_allowlist.json` (or override via env above). Edit the JSON and redeploy — no code change required.

## Legacy data (AWS Encryption SDK)

Older rows may store `*_enc` as a **base64 AWS Encryption SDK** message. If `aws-encryption-sdk` is installed, reads still decrypt those blobs. Run **backfill** or **rotate** to rewrite to the native AES-GCM envelope.

## Scripts

### Backfill plaintext → encrypted

```bash
cd backend
python -m app.scripts.backfill_field_encryption --logical-table employees --dry-run
python -m app.scripts.backfill_field_encryption --logical-table employees goals review reviewDraft clientRmFeedback
```

### Rotate v1 → v2 (or re-wrap legacy)

Set `DYNAMODB_FIELD_ENCRYPTION_KMS_KEY_ARN_V2` if the second CMK should differ from v1.

```bash
cd backend
set DYNAMODB_FIELD_ENCRYPTION_VERSION=v2
python -m app.scripts.rotate_field_encryption --logical-table employees --to-version v2 --from-version v1 --dry-run
python -m app.scripts.rotate_field_encryption --logical-table employees goals review reviewDraft clientRmFeedback --to-version v2 --from-version v1
```

## Runtime behaviour

- Per-request **DEK cache**: the first field encryption in a request calls KMS `GenerateDataKey`; further fields in the same HTTP request reuse that DEK. The cache is cleared at the **start** of each request (`main.py` middleware).

## IAM (ECS task role)

On deploy, `serverless.yml` grants **ZenithAppTaskRole**:

| IAM statement | KMS actions | Resources |
|---------------|-------------|-----------|
| `FieldEncryptionKmsOnStackCmk` | Encrypt, Decrypt, GenerateDataKey, DescribeKey | Stack CMK (`ZenithFieldEncryptionKey`) |
| `FieldEncryptionKmsFromDeployEnv` | same | `DYNAMODB_FIELD_ENCRYPTION_KMS_KEY_ARN` from env |
| `FieldEncryptionKmsV2FromDeployEnv` | same | `DYNAMODB_FIELD_ENCRYPTION_KMS_KEY_ARN_V2` (if set) |

A deploy-time Lambda custom resource (`GrantFieldEncryptionKmsKeyPolicy`) also adds **ZenithAppTaskRole** to the **configured CMK key policy** (idempotent). Manual script `scripts/grant_field_encryption_kms_to_ecs.ps1` is optional if deploy already succeeded.

The API principal (ECS **task role**, Lambda execution role, or IAM user running backfill) needs the same KMS actions on **each CMK** used for backfill, plus normal DynamoDB/S3 permissions.
