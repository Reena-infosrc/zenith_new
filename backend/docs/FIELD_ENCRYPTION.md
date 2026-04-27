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
| `DYNAMODB_FIELD_ENCRYPTION_CONTEXT_APP` | String included in KMS encryption context metadata |

## Allowlisted fields

Configured in `app/services/field_crypto.py` → `ENCRYPTED_FIELDS_BY_TABLE`.

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

## IAM

The API principal (ECS **task role**, Lambda execution role, or IAM user running backfill) needs at least **`kms:GenerateDataKey`**, **`kms:Decrypt`**, and optionally **`kms:DescribeKey`** / **`kms:Encrypt`** on **each CMK** referenced by `DYNAMODB_FIELD_ENCRYPTION_KMS_KEY_ARN` and `DYNAMODB_FIELD_ENCRYPTION_KMS_KEY_ARN_V2`, plus normal DynamoDB/S3 permissions.

In **`serverless.yml`**: `ZenithAppTaskRole` carries app permissions; KMS actions are scoped to `!GetAtt ZenithFieldEncryptionKey.Arn` only. **`ZenithFieldEncryptionKey`** key policy includes **`AllowAppTaskRole`** so the CMK trusts that same role. If you point `..._KMS_KEY_ARN_V2` at a **second** CMK created outside this stack, add the task role to **that** key’s policy and extend **`ZenithAppTaskPolicy`** with a second KMS statement on that key’s ARN.
