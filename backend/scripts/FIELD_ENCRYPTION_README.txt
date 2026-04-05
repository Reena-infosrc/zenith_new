================================================================================
DynamoDB field encryption — how this repo deploys the API (read this first)
================================================================================

WHAT SERVERLESS DEFINES
  backend/serverless.yml provisions:
    - AWS::ECS::Cluster (ZenithCluster)
    - AWS::ECS::TaskDefinition + Fargate service (ZenithService)
    - ALB, VPC, DynamoDB tables, S3, CloudFront, etc.

  The Python API runs inside a Docker container on ECS Fargate. Field encryption
  uses KMS from that container’s IAM role (TaskExecutionRole — same role is
  used as both execution and task role in this template).

IF YOU “DON’T SEE” AN ECS CLUSTER
  - Wrong AWS account or region (match AWS_REGION / console region).
  - Stack never deployed: run `serverless deploy --stage staging` from backend/
    with .env loaded (see CI).
  - Stack name differs: Serverless stack is usually {SERVICE_NAME}-{stage}.
    Your backend/.env.staging has SERVICE_NAME=zenith-hr-pulse → often
    zenith-hr-pulse-staging (if SERVICE_NAME unset in deploy, default is
    zenith-hr-platform from serverless.yml).

YOU DO NOT NEED TO LIST ECS SERVICES TO GET THE TASK ROLE
  After `serverless deploy`, CloudFormation output EcsTaskRoleArn is set.
  Use get_field_encryption_task_role.cmd (AWS CLI) or the updated .ps1 script.

POWERSHELL “running scripts is disabled”
  Option A (one run):
    powershell -ExecutionPolicy Bypass -File .\field_encryption_find_ecs_task_role.ps1
  Option B (your user account):
    Set-ExecutionPolicy -Scope CurrentUser RemoteSigned

KMS KEY POLICY
  Put the EcsTaskRoleArn value in the CMK key policy (Principal.AWS), plus IAM
  on the role (already added in serverless TaskExecutionRole for KMS).

================================================================================
