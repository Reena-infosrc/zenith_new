@echo off
REM Prints ECS task role ARN from CloudFormation stack output EcsTaskRoleArn.
REM No ECS cluster browsing required.
REM
REM Set STACK to your Serverless stack name: typically %%SERVICE_NAME%%-staging
REM (see backend\.env.staging SERVICE_NAME + stage).

setlocal
if "%STACK%"=="" set STACK=zenith-hr-pulse-staging

echo Using stack: %STACK%
echo If this fails, list stacks: aws cloudformation list-stacks --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE --query "StackSummaries[].StackName" --output text
echo.

aws cloudformation describe-stacks --stack-name "%STACK%" --query "Stacks[0].Outputs[?OutputKey=='EcsTaskRoleArn'].OutputValue" --output text

if errorlevel 1 (
  echo.
  echo FAILED. Try STACK=zenith-hr-platform-staging or your actual stack name from list-stacks.
  exit /b 1
)
