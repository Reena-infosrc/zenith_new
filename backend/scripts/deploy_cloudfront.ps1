param(
    [string]$Stage = "staging",
    [string]$BucketName = "zenith-hr-staging.apps.infoservices.com",
    [string]$AcmCertArn = "",
    [string]$Region = "us-east-1"
)

$StackName = "zenith-hr-frontend-$Stage"
$TemplateFile = Join-Path $PSScriptRoot "..\cloudfront-frontend.yml"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Zenith HR Pulse — Deploying CloudFront Distribution" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Stack Name  : $StackName"
Write-Host "Region      : $Region"
Write-Host "S3 Bucket   : $BucketName"
Write-Host "Stage       : $Stage"
if ($AcmCertArn) {
    Write-Host "ACM Cert    : $AcmCertArn"
} else {
    Write-Host "ACM Cert    : (Using default CloudFront domain certificate)"
}
Write-Host "==========================================================" -ForegroundColor Cyan

$params = @(
    "Stage=$Stage",
    "DomainBucketName=$BucketName"
)

if ($AcmCertArn) {
    $params += "AcmCertificateArn=$AcmCertArn"
}

Write-Host "`nDeploying CloudFormation stack..." -ForegroundColor Yellow

aws cloudformation deploy `
    --template-file $TemplateFile `
    --stack-name $StackName `
    --parameter-overrides @params `
    --capabilities CAPABILITY_IAM `
    --region $Region

if ($LASTEXITCODE -eq 0) {
    Write-Host "`nCloudFront stack deployed successfully!" -ForegroundColor Green
    
    $distId = aws cloudformation describe-stacks `
        --stack-name $StackName `
        --region $Region `
        --query "Stacks[0].Outputs[?OutputKey=='DistributionId'].OutputValue" `
        --output text
        
    $domain = aws cloudformation describe-stacks `
        --stack-name $StackName `
        --region $Region `
        --query "Stacks[0].Outputs[?OutputKey=='DistributionDomainName'].OutputValue" `
        --output text
        
    Write-Host "`n----------------------------------------------------------" -ForegroundColor Cyan
    Write-Host "  CloudFront Distribution ID : $distId" -ForegroundColor Green
    Write-Host "  CloudFront Domain Name     : https://$domain" -ForegroundColor Green
    Write-Host "----------------------------------------------------------" -ForegroundColor Cyan
    Write-Host "`nNext Step: Set this in GitHub Secrets -> CLOUDFRONT_DISTRIBUTION_ID_STAGING = $distId" -ForegroundColor Yellow
} else {
    Write-Host "`nFailed to deploy CloudFront stack." -ForegroundColor Red
}
