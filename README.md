# Zenith HR Pulse

A comprehensive Human Resources Management System built with React (Frontend) and FastAPI (Backend), featuring AWS cloud services integration for scalable data storage and AI-powered HR assistance.

## 🚀 Project Overview

Zenith HR Pulse is a modern HR management platform that provides:

- **Employee Directory & Management** - Complete employee profiles with organizational hierarchy
- **Performance Management** - Goal setting, feedback, and performance tracking
- **Leave Management** - Leave requests, approvals, and tracking
- **Recruitment Management** - Job postings, candidate management, and hiring workflows
- **Engagement Tools** - Employee feedback, surveys, and engagement metrics
- **AI-Powered Features** - Intelligent HR assistance using AWS Bedrock
- **Resource Hub** - Company resources, policies, and documentation
- **Compensation Management** - Salary structures and compensation planning

## 🏗️ Architecture

### Frontend (React + TypeScript)
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **UI Library**: shadcn/ui components with Radix UI primitives
- **Styling**: Tailwind CSS
- **State Management**: Zustand + TanStack Query
- **Authentication**: Azure MSAL (Microsoft Authentication Library)
- **Routing**: React Router DOM

### Backend (FastAPI + Python)
- **Framework**: FastAPI with Python 3.13+
- **Database**: AWS DynamoDB (NoSQL)
- **File Storage**: AWS S3
- **AI Services**: AWS Bedrock (Claude 3 Sonnet)
- **Authentication**: JWT tokens with bcrypt password hashing
- **API Documentation**: Swagger UI (FastAPI auto-generated)

### Cloud Services (AWS)
- **DynamoDB**: Employee data, users, goals, feedback, recruitment
- **S3**: Profile photos and file storage
- **Bedrock**: AI-powered HR assistance and insights

## 📋 Prerequisites

### System Requirements
- **Node.js**: 18.x or higher
- **Python**: 3.13 or higher
- **AWS Account**: With appropriate permissions for DynamoDB, S3, and Bedrock
- **Git**: For version control

### AWS Services Setup
1. **AWS Account**: Create an AWS account if you don't have one
2. **AWS CLI**: Install and configure AWS CLI
3. **IAM Permissions**: Ensure your AWS user has permissions for:
   - DynamoDB (CreateTable, PutItem, GetItem, UpdateItem, DeleteItem, Query, Scan)
   - S3 (CreateBucket, PutObject, GetObject, DeleteObject, ListBucket)
   - Bedrock (InvokeModel)

## 🛠️ Installation & Setup

### 1. Clone the Repository

```bash
git clone <YOUR_GIT_URL>
cd zenith-hr-pulse
```

### 2. Backend Setup

```bash
# Navigate to backend directory
cd backend

# Create virtual environment (recommended)
python -m venv venv

# Activate virtual environment
# On macOS/Linux:
source venv/bin/activate
# On Windows:
venv\Scripts\activate

# Install Python dependencies
pip install -r requirements.txt

# Copy environment configuration
cp env_sample.txt .env

# Edit .env file with your AWS credentials
# See Environment Configuration section below
```

### 3. Frontend Setup

```bash
# Navigate back to root directory
cd ..

# Install Node.js dependencies
npm install
```

### 4. Environment Configuration

Create a `.env` file in the `backend` directory with the following configuration:

```env
# AWS Configuration
AWS_ACCESS_KEY_ID=your_aws_access_key_id
AWS_SECRET_ACCESS_KEY=your_aws_secret_access_key
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

## 🚀 Running the Application

### Development Mode

#### Start Backend Server

```bash
cd backend

# Option 1: Using run.py
python run.py

# Option 2: Using uvicorn directly
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The backend API will be available at:
- **API**: http://localhost:8000
- **API Documentation**: http://localhost:8000/docs (Swagger UI)
- **Health Check**: http://localhost:8000/health

#### Start Frontend Development Server

```bash
# From root directory
npm run dev
```

The frontend will be available at:
- **Frontend**: http://localhost:8080

### Production Mode

#### Build Frontend

```bash
npm run build
```

#### Run Backend in Production

```bash
cd backend
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

## 🔧 Available Scripts

### Frontend Scripts
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run build:dev` - Build in development mode
- `npm run lint` - Run ESLint
- `npm run preview` - Preview production build

### Backend Scripts
- `python run.py` - Start development server
- `python -m uvicorn app.main:app --reload` - Start with auto-reload
- `python migrate_to_aws.py` - Migrate data from MongoDB to AWS
- `python seed_feature_flags.py` - Seed feature flags

## 🔐 Authentication

### Test Accounts

The application includes test accounts for development:

- **Admin User**:
  - Email: admin@example.com
  - Password: admin123

- **Regular User**:
  - Email: user@example.com
  - Password: user123

### Azure AD Integration

The application supports Azure Active Directory integration through MSAL. Configure your Azure AD app registration in `src/auth/msal.ts`.

## 📚 API Endpoints

### Authentication
- `POST /auth/login` - User login
- `POST /auth/token` - OAuth2 token endpoint

### Employee Management
- `GET /api/employees` - Get all employees
- `POST /api/employees` - Create new employee
- `GET /api/employees/{id}` - Get employee by ID
- `PUT /api/employees/{id}` - Update employee
- `DELETE /api/employees/{id}` - Delete employee
- `POST /api/employees/upload-photo` - Upload profile photo

### AI-Powered Features
- `POST /api/ai/chat` - General AI chat
- `POST /api/ai/leave-suggestion` - AI leave suggestions
- `POST /api/ai/recruitment-response` - AI recruitment responses
- `POST /api/ai/performance-insights` - AI performance insights
- `POST /api/ai/sentiment-analysis` - Sentiment analysis

### Goals & Performance
- `GET /api/goals` - Get all goals
- `POST /api/goals` - Create new goal
- `PUT /api/goals/{id}` - Update goal

### Feedback
- `GET /api/feedback` - Get all feedback
- `POST /api/feedback` - Create new feedback

### Feature Flags
- `GET /api/feature-flags` - Get feature flags
- `PUT /api/feature-flags/{name}` - Update feature flag

## 🎨 Frontend Features

### Pages & Components
- **Dashboard** - Overview of HR metrics and activities
- **Directory** - Employee directory with search and filtering
- **Engagement** - Employee engagement tools and surveys
- **Leave Management** - Leave requests and approvals
- **Recruitment** - Job postings and candidate management
- **Performance** - Performance tracking and goal management
- **Resource Hub** - Company resources and documentation
- **Compensation** - Salary and compensation management
- **Feature Flags** - Admin panel for feature management

### UI Components
- Modern, responsive design with dark/light mode support
- Interactive organization charts
- Advanced search and filtering
- Drag-and-drop file uploads
- Real-time notifications
- Mobile-responsive layout

## 🔧 Configuration

### Feature Flags

Configure features in `backend/config/feature_flags.yaml`:

```yaml
features:
  import_linkedin: false
  export_csv: true
  org_chart_view: true
  employee_photos: true
  advanced_search: true
  bulk_upload: true
  activity_tracking: false
  performance_metrics: false
```

### Role Permissions

Define role permissions in the same file:

```yaml
roles:
  admin:
    can_create: true
    can_edit: true
    can_delete: true
    can_import: true
    can_export: true
  
  user:
    can_create: false
    can_edit: false
    can_delete: false
    can_import: false
    can_export: true
```

## 🧪 Testing

### Backend Testing

```bash
cd backend
pip install -r requirements.txt

# Test API endpoints
python test_api.py

# Test authentication
python test_auth.py

# Test S3 uploads
python test_presigned_url.py
```

Optional: run `pytest` from `backend` when you add tests under `backend/tests/`.

### Frontend Testing

```bash
# Run linting
npm run lint

# Build test
npm run build
```

## 🚀 Deployment

### AWS Deployment

1. **Set up AWS infrastructure**:
   - DynamoDB tables will be created automatically
   - S3 bucket will be created automatically
   - Ensure Bedrock model access is granted

2. **Deploy backend**:
   - Use AWS Elastic Beanstalk, ECS, or Lambda
   - Set environment variables in your deployment platform

3. **Deploy frontend**:
   - Use AWS S3 + CloudFront for static hosting
   - Or deploy to Vercel, Netlify, or similar platforms

### Environment Variables for Production

Update the following for production:
- `SECRET_KEY` - Use a strong, random secret key
- `CORS_ORIGINS` - Add your production domain
- `ENVIRONMENT=production`
- `DEBUG=false`

## 📊 Monitoring & Health Checks

### Health Check Endpoint

```bash
curl http://localhost:8000/health
```

Response:
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

## 🐛 Troubleshooting

### Common Issues

1. **AWS Credentials Error**
   - Verify AWS credentials in `.env` file
   - Check IAM permissions
   - Ensure AWS CLI is configured

2. **DynamoDB Table Creation Fails**
   - Check AWS region configuration
   - Verify DynamoDB permissions
   - Ensure table names are unique

3. **S3 Upload Issues**
   - Verify S3 bucket permissions
   - Check bucket region matches configuration
   - Ensure bucket name is globally unique

4. **Bedrock API Errors**
   - Request model access in AWS Bedrock console
   - Check region configuration
   - Verify IAM permissions for Bedrock

5. **Frontend Build Issues**
   - Clear node_modules and reinstall: `rm -rf node_modules && npm install`
   - Check Node.js version compatibility
   - Verify all dependencies are installed

### Debug Mode

Enable debug mode by setting `DEBUG=true` in your `.env` file for detailed error messages.

## 📈 Performance Optimization

### Backend Optimizations
- DynamoDB query optimization
- S3 presigned URLs for direct uploads
- Connection pooling for AWS services
- Caching strategies for frequently accessed data

### Frontend Optimizations
- Code splitting with React.lazy()
- Image optimization and lazy loading
- Memoization with React.memo()
- Virtual scrolling for large lists

## 🔒 Security Considerations

1. **Environment Variables**: Never commit `.env` files
2. **AWS IAM**: Use least privilege principle
3. **JWT Tokens**: Implement proper token expiration
4. **CORS**: Configure appropriate origins for production
5. **S3 Buckets**: Consider private buckets with signed URLs
6. **API Rate Limiting**: Implement rate limiting for production

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Commit changes: `git commit -am 'Add feature'`
4. Push to branch: `git push origin feature-name`
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For support and questions:
1. Check the troubleshooting section above
2. Review AWS service logs
3. Check application logs for detailed error messages
4. Ensure all environment variables are correctly set

## 🔄 Migration from MongoDB

If migrating from MongoDB, use the migration script:

```bash
cd backend
python migrate_to_aws.py
```

This will migrate existing data from MongoDB to DynamoDB and files to S3.

## 📝 Changelog

### Version 2.0.0
- Migrated from MongoDB to AWS DynamoDB
- Integrated AWS S3 for file storage
- Added AWS Bedrock AI features
- Enhanced security with JWT authentication
- Improved performance and scalability

### Version 1.0.0
- Initial release with MongoDB backend
- Basic HR management features
- React frontend with TypeScript

---

**Built with ❤️ using React, FastAPI, and AWS Services**