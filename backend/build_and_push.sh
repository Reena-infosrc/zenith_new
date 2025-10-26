#!/bin/bash
set -e

echo "🔨 Building Docker image..."
docker build -t zenith-hr-pulse-api:latest .

echo "🏷️ Tagging image..."
docker tag zenith-hr-pulse-api:latest 339713066436.dkr.ecr.us-east-1.amazonaws.com/serverless-ig-zenith-hr-pulse-dev:latest

echo "🔐 Logging into ECR..."
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 339713066436.dkr.ecr.us-east-1.amazonaws.com

echo "📤 Pushing image to ECR..."
docker push 339713066436.dkr.ecr.us-east-1.amazonaws.com/serverless-ig-zenith-hr-pulse-dev:latest

echo "✅ Image pushed successfully!"
echo ""
echo "Next steps:"
echo "1. The ECS service will automatically use the new image"
echo "2. Check CloudWatch logs to see the new endpoints"
echo "3. Test with: https://zenith-hr-api.apps.infoservices.com/api/version-check"
