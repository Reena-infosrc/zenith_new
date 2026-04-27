<#
.SYNOPSIS
  Rewrites DynamoDB rows so allowlisted fields use the same encryption as the API (KMS + AES-GCM).

.DESCRIPTION
  Loads env (default: backend\.env.staging), requires DYNAMODB_FIELD_ENCRYPTION_ENABLED=true and
  DYNAMODB_FIELD_ENCRYPTION_KMS_KEY_ARN. Decryption on read is automatic in the app when encryption
  is active — this script only backfills ciphertext at rest.

  Always run --dry-run first against the target account.

.PARAMETER EnvFile
  Path to dotenv file (passed to --env-file). Default: backend\.env.staging

.PARAMETER DryRun
  Parse/format only; no PutItem.

.PARAMETER Limit
  Max items per logical table (trial). 0 = no limit (full table).

.PARAMETER Sleep
  Seconds between writes (throttling).

.EXAMPLE
  .\scripts\backfill-field-encryption.ps1 -DryRun

.EXAMPLE
  .\scripts\backfill-field-encryption.ps1 -EnvFile ..\.env.prod -Limit 5

.EXAMPLE
  cd backend; python -m app.scripts.backfill_field_encryption --logical-table employees --dry-run
#>
param(
    [string] $EnvFile = "",
    [switch] $DryRun,
    [int] $Limit = 0,
    [double] $Sleep = 0
)

$ErrorActionPreference = "Stop"
$backendRoot = Split-Path -Parent $PSScriptRoot
Set-Location $backendRoot

$argsList = @("-m", "app.scripts.backfill_field_encryption", "--all-tables")
if ($DryRun) { $argsList += "--dry-run" }
if ($Limit -gt 0) { $argsList += "--limit", "$Limit" }
if ($Sleep -gt 0) { $argsList += "--sleep", "$Sleep" }
if ($EnvFile) { $argsList += "--env-file", $EnvFile }

Write-Host "Running: python $($argsList -join ' ')" -ForegroundColor Cyan
& python @argsList
