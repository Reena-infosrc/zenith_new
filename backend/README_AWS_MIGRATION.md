# AWS Services Migration Guide

This guide explains how to migrate the Zenith HR Pulse application from MongoDB and local file storage to AWS services (DynamoDB, S3, and Bedrock).

## Overview

The application has been refactored to use the following AWS services:

- **DynamoDB**: Replaces MongoDB for data storage
- **S3**: Replaces local file storage for profile photos
- **AWS Bedrock**: Provides AI-powered features for HR assistance

## Prerequisites

1. **AWS Account**: You need an active AWS account with appropriate permissions
2. **AWS CLI**: Install and configure AWS CLI with your credentials
3. **Python Dependencies**: Install the updated requirements

## Setup Instructions

### 1. Install Dependencies

```bash
cd backend
pip install -r requirements.txt
```

### 2. Configure AWS Credentials

Create a `.env` file in the backend directory with your AWS configuration:

```bash
# Copy the sample environment file
cp env_sample.txt .env
```

Edit the `.env` file with your actual AWS credentials:

```env
# AWS Configuration
AWS_ACCESS_KEY_ID=your_actual_access_key_id
AWS_SECRET_ACCESS_KEY=your_actual_secret_access_key
AWS_DEFAULT_REGION=us-east-1
AWS_REGION=us-east-1

# DynamoDB Configuration
DYNAMODB_TABLE_EMPLOYEES=zenith-hr-employees
DYNAMODB_TABLE_USERS=zenith-hr-users
DYNAMODB_TABLE_GOALS=zenith-hr-goals
DYNAMODB_TABLE_FEEDBACK=zenith-hr-feedback
DYNAMODB_TABLE_RECRUITMENT=zenith-hr-recruitment
DYNAMODB_TABLE_FEATURE_FLAGS=zenith-hr-feature-flags
DYNAMODB_TABLE_ADMINS=zenith-hr-admin
DYNAMODB_TABLE_REVIEWS=zenith-hr-review

# S3 Configuration
S3_BUCKET_NAME=zenith-hr-pulse-photos
S3_BUCKET_REGION=us-east-1
S3_PHOTOS_PREFIX=profile-photos/

# AWS Bedrock Configuration
BEDROCK_MODEL_ID=anthropic.claude-3-sonnet-20240229-v1:0
BEDROCK_REGION=us-east-1

# Application Configuration
SECRET_KEY=your-secret-key-for-development-replace-in-production
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# CORS Configuration
CORS_ORIGINS=http://localhost:3000,http://localhost:8080

# Development/Production Environment
ENVIRONMENT=development
DEBUG=true
```

### 3. AWS IAM Permissions

Ensure your AWS user/role has the following permissions:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "dynamodb:CreateTable",
                "dynamodb:DescribeTable",
                "dynamodb:PutItem",
                "dynamodb:GetItem",
                "dynamodb:UpdateItem",
                "dynamodb:DeleteItem",
                "dynamodb:Query",
                "dynamodb:Scan",
                "dynamodb:BatchWriteItem"
            ],
            "Resource": "arn:aws:dynamodb:*:*:table/zenith-hr-*"
        },
        {
            "Effect": "Allow",
            "Action": [
                "s3:CreateBucket",
                "s3:GetBucketLocation",
                "s3:PutObject",
                "s3:GetObject",
                "s3:DeleteObject",
                "s3:ListBucket"
            ],
            "Resource": [
                "arn:aws:s3:::zenith-hr-pulse-photos",
                "arn:aws:s3:::zenith-hr-pulse-photos/*"
            ]
        },
        {
            "Effect": "Allow",
            "Action": [
                "bedrock:InvokeModel"
            ],
            "Resource": "arn:aws:bedrock:*:*:model/anthropic.claude-3-sonnet-20240229-v1:0"
        }
    ]
}
```

### 4. Enable AWS Bedrock

1. Go to the AWS Bedrock console
2. Navigate to "Model access" in the left sidebar
3. Request access to the Claude 3 Sonnet model
4. Wait for approval (usually takes a few minutes)

## Migration Process

### Option 1: Fresh Start (Recommended for new deployments)

If you're starting fresh or don't need to migrate existing data:

1. Start the application:
```bash
cd backend
python -m uvicorn app.main:app --reload
```

2. The application will automatically create DynamoDB tables and S3 bucket on startup.

### Option 2: Migrate Existing Data

If you have existing MongoDB data to migrate:

1. **Run the migration script**:
```bash
cd backend
python migrate_to_aws.py
```

2. **Verify migration**:
   - Check DynamoDB tables in AWS console
   - Check S3 bucket for uploaded photos
   - Test the application endpoints

## New Features

### AI-Powered Endpoints

The application now includes several AI-powered endpoints:

#### 1. General AI Chat
```http
POST /api/ai/chat
Content-Type: application/json

{
    "message": "What are the company's leave policies?",
    "context": "HR policy context"
}
```

#### 2. Leave Suggestions
```http
POST /api/ai/leave-suggestion
Content-Type: application/json

{
    "employee_name": "John Doe",
    "start_date": "2024-01-15",
    "end_date": "2024-01-17"
}
```

#### 3. Recruitment Responses
```http
POST /api/ai/recruitment-response
Content-Type: application/json

{
    "question": "What is the salary range for this position?",
    "job_info": {
        "position": "Software Engineer",
        "department": "Engineering",
        "salary_range": "$80,000 - $120,000"
    }
}
```

#### 4. Performance Insights
```http
POST /api/ai/performance-insights
Content-Type: application/json

{
    "employee_data": {
        "name": "John Doe",
        "position": "Software Engineer",
        "performance_metrics": {
            "communication": 85,
            "leadership": 90,
            "technical_skills": 95
        }
    }
}
```

#### 5. Sentiment Analysis
```http
POST /api/ai/sentiment-analysis
Content-Type: application/json

{
    "feedback_text": "I really enjoy working here. The team is supportive and the projects are challenging."
}
```

### Employee AI Features

#### Goal Suggestions
```http
POST /api/employees/{employee_id}/ai-goal-suggestions
```

#### Performance Feedback
```http
POST /api/employees/{employee_id}/ai-performance-feedback?feedback_type=general
```

## API Changes

### Photo Upload Changes

- **Before**: Photos were stored locally in `uploads/photos/`
- **After**: Photos are stored in S3 and return full S3 URLs

Example response:
```json
{
    "photo_url": "https://zenith-hr-pulse-photos.s3.us-east-1.amazonaws.com/profile-photos/uuid.jpg"
}
```

### Database Changes

- **Before**: MongoDB collections with `_id` fields
- **After**: DynamoDB tables with `id` fields
- **Compatibility**: The API maintains backward compatibility with MongoDB-style responses

## Testing

### 1. Health Check
```http
GET /health
```

Expected response:
```json
{
    "status": "healthy",
    "services": {
        "dynamodb": "initialized",
        "s3": "initialized",
        "bedrock": "initialized"
    }
}
```

### 2. Test Photo Upload
```bash
curl -X POST "http://localhost:8000/api/employees/upload-photo" \
  -H "Content-Type: multipart/form-data" \
  -F "file=@test-photo.jpg"
```

### 3. Test AI Features
```bash
curl -X POST "http://localhost:8000/api/ai/chat" \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello, how can you help me?"}'
```

## Troubleshooting

### Common Issues

1. **DynamoDB Table Creation Fails**
   - Check AWS credentials
   - Verify IAM permissions
   - Ensure region is correct

2. **S3 Upload Fails**
   - Check bucket name is unique
   - Verify S3 permissions
   - Check bucket region matches configuration

3. **Bedrock API Fails**
   - Ensure model access is granted
   - Check region configuration
   - Verify IAM permissions for Bedrock

4. **Migration Script Fails**
   - Check MongoDB connection
   - Verify AWS credentials
   - Check DynamoDB table permissions

### Debug Mode

Enable debug mode by setting `DEBUG=true` in your `.env` file to see detailed error messages.

## Cost Considerations

### DynamoDB
- **On-Demand**: Pay per request (recommended for development)
- **Provisioned**: Fixed capacity (recommended for production)

### S3
- **Storage**: ~$0.023 per GB per month
- **Requests**: ~$0.0004 per 1,000 PUT requests

### Bedrock
- **Claude 3 Sonnet**: ~$0.003 per 1K input tokens, ~$0.015 per 1K output tokens

## Security Best Practices

1. **Environment Variables**: Never commit `.env` files to version control
2. **IAM Roles**: Use least privilege principle for AWS permissions
3. **S3 Bucket**: Consider private buckets with signed URLs for sensitive photos
4. **Bedrock**: Monitor usage and set up billing alerts

## Rollback Plan

If you need to rollback to MongoDB:

1. Keep the original `database.py` file as backup
2. Update imports in `main.py` to use the old database module
3. Remove AWS service initializations
4. Restore local photo storage

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review AWS service logs in the console
3. Check application logs for detailed error messages
4. Ensure all environment variables are correctly set

## Next Steps

After successful migration:

1. **Update Frontend**: Modify frontend to use new S3 photo URLs
2. **Monitor Costs**: Set up AWS billing alerts
3. **Performance Tuning**: Optimize DynamoDB queries and S3 usage
4. **Security Review**: Implement additional security measures as needed
5. **Documentation**: Update API documentation with new endpoints
