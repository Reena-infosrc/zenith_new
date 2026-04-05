# Prints the ECS task role ARN for the Zenith Fargate service (for KMS key policy).
# Prerequisites: AWS CLI, cluster exists, service name matches pattern.

param(
    [string]$Region = "us-east-1",
    [string]$ClusterName = "zenith-hr-pulse-staging"
)

$ErrorActionPreference = "Stop"

$json = aws ecs list-services --cluster $ClusterName --region $Region --output json | ConvertFrom-Json
$svcArn = $json.serviceArns | Where-Object { $_ -match "ZenithService" } | Select-Object -First 1
if (-not $svcArn) {
    Write-Error "No service matching ZenithService in cluster $ClusterName"
}

$tdArn = aws ecs describe-services --cluster $ClusterName --services $svcArn --region $Region --query "services[0].taskDefinition" --output text
$roleArn = aws ecs describe-task-definition --task-definition $tdArn --region $Region --query "taskDefinition.taskRoleArn" --output text

Write-Host "ECS task role ARN (paste into KMS key policy Principal.AWS):"
Write-Host $roleArn
