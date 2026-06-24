<#
.SYNOPSIS
  Grant the Zenith ECS task role permission to use an external field-encryption CMK.

.DESCRIPTION
  Backfill often runs with a personal/admin AWS identity, but the API decrypts on ECS
  using ZenithAppTaskRole. Both must be allowed on the CMK:
    1) IAM task policy (serverless.yml) - deploy handles this
    2) KMS key policy on the CMK - run this script once per external key

  Requires AWS CLI credentials (same account as staging). Example:
    aws sso login --profile YOUR_PROFILE
    $env:AWS_PROFILE = "YOUR_PROFILE"

.EXAMPLE
  .\scripts\grant_field_encryption_kms_to_ecs.ps1 `
    -KmsKeyArn "arn:aws:kms:us-east-1:383574875115:key/aca337ae-07e3-4e13-835a-bb8f6d6e8c25" `
    -Stage staging

.EXAMPLE
  .\scripts\grant_field_encryption_kms_to_ecs.ps1 `
    -KmsKeyArn "arn:aws:kms:us-east-1:383574875115:key/aca337ae-07e3-4e13-835a-bb8f6d6e8c25" `
    -TaskRoleArn "arn:aws:iam::383574875115:role/zenith-hr-pulse-staging-ZenithAppTaskRole-XXXX"
#>
param(
    [Parameter(Mandatory = $true)]
    [string] $KmsKeyArn,
    [string] $Stage = "staging",
    [string] $Region = "us-east-1",
    [string] $TaskRoleArn = ""
)

$ErrorActionPreference = "Stop"

function Invoke-AwsCli {
    param([string[]] $Args)
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $out = & aws @Args 2>&1
    $exit = $LASTEXITCODE
    $ErrorActionPreference = $prev
    if ($exit -ne 0) {
        $msg = ($out | Out-String).Trim()
        if ($msg -match "Unable to locate credentials") {
            throw @"
AWS credentials are not configured.

  aws sso login --profile YOUR_PROFILE
  `$env:AWS_PROFILE = "YOUR_PROFILE"

Or set AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY, then re-run this script.
"@
        }
        throw "AWS CLI failed (exit $exit): $msg"
    }
    return ($out | Out-String).Trim()
}

Write-Host "Checking AWS credentials ..." -ForegroundColor Cyan
$identity = Invoke-AwsCli @("sts", "get-caller-identity", "--region", $Region, "--output", "json") | ConvertFrom-Json
Write-Host ("Using account {0} as {1}" -f $identity.Account, $identity.Arn)

if ($TaskRoleArn) {
    $taskRoleArn = $TaskRoleArn.Trim()
    Write-Host "Using provided task role ARN." -ForegroundColor Cyan
} else {
    $stackName = "zenith-hr-pulse-$Stage"
    Write-Host "Resolving ZenithAppTaskRole from stack $stackName ..." -ForegroundColor Cyan
    $roleName = Invoke-AwsCli @(
        "cloudformation", "describe-stack-resources",
        "--stack-name", $stackName,
        "--logical-resource-id", "ZenithAppTaskRole",
        "--region", $Region,
        "--query", "StackResources[0].PhysicalResourceId",
        "--output", "text"
    )
    if (-not $roleName -or $roleName -eq "None") {
        throw "Could not find ZenithAppTaskRole in stack $stackName. Pass -TaskRoleArn explicitly."
    }
    $taskRoleArn = Invoke-AwsCli @("iam", "get-role", "--role-name", $roleName, "--query", "Role.Arn", "--output", "text")
}

Write-Host "Task role: $taskRoleArn"

$keyId = ($KmsKeyArn -split "/")[-1]
$policyJson = Invoke-AwsCli @("kms", "get-key-policy", "--key-id", $keyId, "--policy-name", "default", "--region", $Region, "--output", "text")
$policy = $policyJson | ConvertFrom-Json

$sid = "AllowZenithAppTaskRoleFieldEncryption"
$existing = @($policy.Statement | Where-Object { $_.Sid -eq $sid })
if ($existing.Count -gt 0) {
    Write-Host "Key policy already contains $sid; nothing to do." -ForegroundColor Green
    exit 0
}

$newStatement = [ordered]@{
    Sid       = $sid
    Effect    = "Allow"
    Principal = @{ AWS = $taskRoleArn }
    Action    = @(
        "kms:Encrypt",
        "kms:Decrypt",
        "kms:GenerateDataKey",
        "kms:DescribeKey"
    )
    Resource  = "*"
}

$policy.Statement = @($policy.Statement) + @($newStatement)
$updated = $policy | ConvertTo-Json -Depth 10 -Compress

Invoke-AwsCli @("kms", "put-key-policy", "--key-id", $keyId, "--policy-name", "default", "--policy", $updated, "--region", $Region) | Out-Null
Write-Host ('Updated KMS key policy on {0} for {1}' -f $KmsKeyArn, $taskRoleArn) -ForegroundColor Green
