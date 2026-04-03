# Field encryption (Zenith HR Pulse / DynamoDB)

This folder documents **application-level, field-level encryption** for sensitive attributes stored in Amazon DynamoDB for **infosrv-zenith-hr-pulse** (`SERVICE_NAME=zenith-hr-pulse` in production env).

## Canonical design document

| Document | What it covers |
|----------|----------------|
| **[dynamodb-field-encryption-design.md](./dynamodb-field-encryption-design.md)** | Full production design: codebase analysis, **§0.6–§0.8** (includes **implemented** staging-safe defaults), KMS, envelope encryption, data modeling, Python patterns, IAM, migration, testing, checklist |

Start there for implementation. This page is a **navigation hub** only.

## Topics — jump links

Open the design doc and use these sections (anchors depend on your Markdown viewer; headings are numbered in the source):

| Topic | Section |
|-------|---------|
| **This repo today** (paths, tables, sensitive fields) | [§0 Analysis](./dynamodb-field-encryption-design.md#0-analysis-of-this-codebase-as-is) |
| **`serverless.yml`, `.env.prod`, DynamoDB table names, new encryption env vars, GSIs** | §0.6–§0.7 in [dynamodb-field-encryption-design.md](./dynamodb-field-encryption-design.md) |
| **Executive summary** | [§1 Executive summary](./dynamodb-field-encryption-design.md#1-executive-summary) |
| **Client-side vs SSE, field vs full record** | [§2 Encryption strategy](./dynamodb-field-encryption-design.md#2-encryption-strategy) |
| **KMS, envelope encryption, Encryption SDK vs DDB client, rotation** | [§3 AWS services and architecture](./dynamodb-field-encryption-design.md#3-aws-services-and-architecture) |
| **GSIs, email/UUID plaintext, hybrid attributes** | [§4 Data modeling considerations](./dynamodb-field-encryption-design.md#4-data-modeling-considerations) |
| **Service layer, write/read path, code snippets** | [§5 Implementation details](./dynamodb-field-encryption-design.md#5-implementation-details) |
| **Latency, batch, caching** | [§6 Performance and scalability](./dynamodb-field-encryption-design.md#6-performance-and-scalability) |
| **IAM, logging, auditing** | [§7 Security best practices](./dynamodb-field-encryption-design.md#7-security-best-practices) |
| **CI/CD, env keys, rollback** | [§8 DevOps and deployment](./dynamodb-field-encryption-design.md#8-devops-and-deployment) |
| **Backfill, dual-read, PITR** | [§9 Migration strategy](./dynamodb-field-encryption-design.md#9-migration-strategy-existing-dynamodb-data) |
| **Tests, failures, GDPR export** | [§10 Testing and validation](./dynamodb-field-encryption-design.md#10-testing-and-validation) |
| **Ordered rollout checklist** | [§11 Actionable checklist](./dynamodb-field-encryption-design.md#11-actionable-checklist-ordered) |
| **External AWS docs** | [§12 References](./dynamodb-field-encryption-design.md#12-references-external) |

## Suggested code location (not yet implemented)

- `backend/app/services/field_crypto.py` — encrypt/decrypt helpers + allowlists  
- Call from repository-style code near `format_dynamodb_item` / `parse_dynamodb_item` (see §0.4 in the design doc)

## See also

- [Documentation index](./README.md) — all files under `docs/`
