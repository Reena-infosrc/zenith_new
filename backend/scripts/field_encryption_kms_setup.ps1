# Creates a KMS CMK for DynamoDB field-level encryption (staging or prod).
# Requires: AWS CLI configured (same account/region as ECS). Run from repo root or backend/.
# See FIELD_ENCRYPTION_README.txt for how the API is deployed (ECS Fargate via Serverless).
# If scripts are blocked: powershell -ExecutionPolicy Bypass -File .\field_encryption_kms_setup.ps1
#
# After this script:
# 1) Copy the printed Key ARN into backend/.env.staging (or .env.prod) as DYNAMODB_FIELD_ENCRYPTION_KMS_KEY_ARN
# 2) Attach a KEY POLICY on this CMK so your ECS task role can use it (see field_encryption_kms_key_policy_snippet.json)
# 3) Set DYNAMODB_FIELD_ENCRYPTION_ENABLED=true and serverless deploy

param(
    [string]$Region = "us-east-1",
    [string]$AliasName = "alias/zenith-hr-field-encryption-staging"
)

$ErrorActionPreference = "Stop"

Write-Host "Creating KMS key in $Region ..."
$keyJson = aws kms create-key `
    --region $Region `
    --description "Zenith HR Pulse - DynamoDB field encryption" `
    --key-usage ENCRYPT_DECRYPT `
    --key-spec SYMMETRIC_DEFAULT `
    --output json | ConvertFrom-Json

$keyId = $keyJson.KeyMetadata.KeyId
$arn = $keyJson.KeyMetadata.Arn

Write-Host "KeyId: $keyId"
Write-Host "ARN:   $arn"
Write-Host ""

try {
    aws kms create-alias --region $Region --alias-name $AliasName --target-key-id $keyId
    Write-Host "Alias created: $AliasName"
} catch {
    Write-Host "Alias may already exist; ignore if intentional."
}

Write-Host ""
Write-Host "NEXT STEPS:"
Write-Host "1) Put this line in backend/.env.staging (or prod file):"
Write-Host "   DYNAMODB_FIELD_ENCRYPTION_KMS_KEY_ARN=$arn"
Write-Host "2) Edit the KMS key policy in AWS Console -> KMS -> this key -> Key policy"
Write-Host "   Add permission for your ECS task role (IAM role used by Fargate tasks) to use this key."
Write-Host "   See: backend/scripts/field_encryption_kms_key_policy_snippet.json"
Write-Host "3) Set DYNAMODB_FIELD_ENCRYPTION_ENABLED=true and deploy serverless (staging)."
