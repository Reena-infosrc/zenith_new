#!/bin/bash

# Production Deployment Script for Zenith HR Pulse
# This script deploys the latest changes to production

set -e

echo "🚀 Starting Production Deployment for Zenith HR Pulse..."

# Configuration
AWS_REGION="us-east-1"
ECR_ACCOUNT="339713066436"
ECR_REPO="serverless-ig-zenith-hr-pulse"
STAGE="prod"
JWT_SECRET="YourSuperSecureJWTKeyHere123!"  # Replace with your actual JWT secret

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}📋 Deployment Configuration:${NC}"
echo "  AWS Region: $AWS_REGION"
echo "  ECR Account: $ECR_ACCOUNT"
echo "  ECR Repository: $ECR_REPO"
echo "  Stage: $STAGE"
echo ""

# Check if AWS CLI is configured
if ! aws sts get-caller-identity >/dev/null 2>&1; then
    echo -e "${RED}❌ AWS CLI not configured. Please run 'aws configure' first.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ AWS CLI configured${NC}"

# Login to ECR
echo -e "${YELLOW}🔐 Logging into ECR...${NC}"
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ECR_ACCOUNT.dkr.ecr.$AWS_REGION.amazonaws.com

# Build and push Docker image
echo -e "${YELLOW}🐳 Building Docker image...${NC}"
cd backend

# Build the image
IMAGE_URI="$ECR_ACCOUNT.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO"
PROD_IMAGE="${IMAGE_URI}-${STAGE}:latest"

echo "Building: $PROD_IMAGE"
docker build -t $PROD_IMAGE .

echo -e "${YELLOW}📤 Pushing Docker image...${NC}"
docker push $PROD_IMAGE

cd ..

# Deploy CloudFormation stack
echo -e "${YELLOW}☁️  Deploying CloudFormation stack...${NC}"
STACK_NAME="ZenithHrPulse-${STAGE}"

aws cloudformation deploy \
    --stack-name "$STACK_NAME" \
    --template-file "./backend/serverless.yml" \
    --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM \
    --parameter-overrides Stage=${STAGE} JWTSecret=${JWT_SECRET} \
    --region $AWS_REGION

echo -e "${GREEN}✅ CloudFormation stack deployed${NC}"

# Force ECS service update
echo -e "${YELLOW}🔄 Forcing ECS service update...${NC}"
CLUSTER_NAME="ZenithHrPulseCluster"
SERVICE_NAME="ZenithHrPulseService"

# Stop existing tasks
echo "Stopping existing ECS tasks..."
TASK_ARNS=$(aws ecs list-tasks --cluster "$CLUSTER_NAME" --service-name "$SERVICE_NAME" --desired-status RUNNING --query 'taskArns' --output text --region $AWS_REGION || true)

if [ -n "$TASK_ARNS" ] && [ "$TASK_ARNS" != "None" ]; then
    for TASK in $TASK_ARNS; do
        echo "Stopping task: $TASK"
        aws ecs stop-task --cluster "$CLUSTER_NAME" --task "$TASK" --reason "Force redeploy via script" --region $AWS_REGION || true
    done
else
    echo "No running tasks found."
fi

# Force new deployment
echo "Forcing new deployment..."
aws ecs update-service --cluster "$CLUSTER_NAME" --service "$SERVICE_NAME" --force-new-deployment --region $AWS_REGION

echo -e "${GREEN}🎉 Production deployment completed!${NC}"
echo ""
echo -e "${YELLOW}📝 Next steps:${NC}"
echo "1. Wait 2-3 minutes for the new container to start"
echo "2. Test the admin API endpoints:"
echo "   - GET https://zenith-hr-api.apps.infoservices.com/api/admins/"
echo "   - GET https://zenith-hr-api.apps.infoservices.com/api/admins/check/jagadeesh.l@infoservices.com"
echo "3. Check the User Management module in the Admin Portal"
echo ""
echo -e "${GREEN}✅ Admin router should now be available in production!${NC}"
