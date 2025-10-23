# Google Cloud Run Deployment

This guide covers deploying the Harakka demo application to Google Cloud Run using Cloud Build for containerization.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Deployment Architecture](#deployment-architecture)
- [Environment Configuration](#environment-configuration)
- [Backend Deployment](#backend-deployment)
- [Frontend Deployment](#frontend-deployment)
- [Post-Deployment](#post-deployment)
- [Monitoring](#monitoring)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Tools

- **Google Cloud CLI** (`gcloud`) installed and authenticated
- **Git** for version control
- **Bash** shell (Git Bash on Windows, native on macOS/Linux)

### Verify Installation

```bash
# Check gcloud installation
gcloud --version

# Login to Google Cloud
gcloud auth login

# Set your project
gcloud config set project harakka-demo

# Enable required APIs
gcloud services enable run.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable artifactregistry.googleapis.com
```

### Google Cloud Setup

1. **Create Project**: `harakka-demo` (or your project ID)
2. **Enable Billing**: Required for Cloud Run and Cloud Build
3. **Create Artifact Registry**:

```bash
gcloud artifacts repositories create harakka-demo \
  --repository-format=docker \
  --location=europe-north1 \
  --description="Harakka demo application containers"
```

---

## Deployment Architecture

### Overview

```
┌─────────────────────────────────────────────┐
│  User Browser                                │
└──────────────┬──────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────┐
│  Frontend (Cloud Run)                       │
│  - React SPA served by Nginx                │
│  - europe-north1                            │
│  - https://harakka-frontend-*.run.app       │
└──────────────┬──────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────┐
│  Backend (Cloud Run)                        │
│  - NestJS REST API                          │
│  - europe-north1                            │
│  - https://harakka-backend-*.run.app        │
└──────────────┬──────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────┐
│  Supabase (External)                        │
│  - PostgreSQL Database                      │
│  - Authentication                           │
│  - Storage                                  │
└─────────────────────────────────────────────┘
```

### Build Process

- **Cloud Build**: Builds Docker images in Google Cloud (no local Docker required)
- **Artifact Registry**: Stores built images
- **Cloud Run**: Runs containerized applications with auto-scaling

---

## Environment Configuration

### Create `.env.production`

Create `.env.production` in project root with production values:

```bash
# Supabase Configuration (Production)
SUPABASE_PROJECT_ID=your-project-id
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-production-service-role-key
SUPABASE_ANON_KEY=your-production-anon-key
SUPABASE_JWT_SECRET=your-production-jwt-secret
SUPABASE_STORAGE_URL=https://your-project-id.supabase.co/storage/v1/s3

# Backend Configuration
NODE_ENV=production
ALLOWED_ORIGINS=http://localhost:5180  # Will be updated with actual frontend URL later

# S3 Configuration TODO: deprecated?
S3_REGION=eu-north-1
S3_BUCKET=item-images

# Email Configuration
STORAGE_EMAIL=harakka.storage.solutions@gmail.com
STORAGE_EMAIL_PASSWORD=your-app-password

# Cron Configuration
CRON_SECRET=your-production-cron-secret
CRON_URL=  # Will be auto-populated after backend deployment

# Frontend Configuration (for local .env.production reference)
VITE_API_URL=  # Will be set during build
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-production-anon-key
```

**⚠️ Security Notes:**

- Never commit `.env.production` to git (already in `.gitignore`)
- Use Google Secret Manager for production secrets (optional but recommended)
- All values must be fully expanded (no `${VAR}` syntax)

---

## Backend Deployment

### Deployment Script

The backend deployment is automated via `scripts/deploy-backend-gcloud.sh`.

### What the Script Does

1. **Validates** environment variables from `.env.production`
2. **Builds** the Docker image using Google Cloud Build
3. **Pushes** to Artifact Registry automatically
4. **Deploys** to Cloud Run with environment variables
5. **Tests** health endpoint
6. **Updates** CRON_URL with deployed backend URL

### Run Backend Deployment

```bash
# From project root
./scripts/deploy-backend-gcloud.sh
```

### Expected Output

```
🚀 Google Cloud Run Backend Deployment
=============================================
📄 Loading environment variables from .env.production
🔍 Validating required environment variables...
✓ SUPABASE_URL is set
✓ SUPABASE_ANON_KEY is set
...
🏗️  Building backend image in Google Cloud...
   This may take 8-15 minutes on first build...

✅ Build completed successfully in Google Cloud!
🚀 Deploying backend service to Cloud Run...
✅ Backend deployed successfully!

📍 Service Information:
   Backend URL: https://harakka-backend-2dlkvkbokq-lz.a.run.app
   Health Check: https://harakka-backend-2dlkvkbokq-lz.a.run.app/health
   API Docs: https://harakka-backend-2dlkvkbokq-lz.a.run.app/api
```

### Manual Deployment (Alternative)

If you need to deploy manually:

```bash
# Set variables
PROJECT_ID="harakka-demo"
REGION="europe-north1"
IMAGE_URL="europe-north1-docker.pkg.dev/${PROJECT_ID}/harakka-demo/backend:latest"

# Authenticate Docker
gcloud auth configure-docker ${REGION}-docker.pkg.dev

# Build with Cloud Build
gcloud builds submit . \
    --config=- <<EOF
steps:
- name: 'gcr.io/cloud-builders/docker'
  args:
  - 'build'
  - '-f'
  - 'backend/Dockerfile'
  - '-t'
  - '${IMAGE_URL}'
  - '.'
images:
- '${IMAGE_URL}'
timeout: 1200s
EOF

# Deploy to Cloud Run
gcloud run deploy harakka-backend \
    --image=${IMAGE_URL} \
    --region=${REGION} \
    --platform=managed \
    --allow-unauthenticated \
    --memory=512Mi \
    --cpu=1 \
    --set-env-vars="NODE_ENV=production" \
    --set-env-vars="SUPABASE_URL=https://your-project-id.supabase.co"
```

---

## Frontend Deployment

### Deployment Script

The frontend deployment is automated via `scripts/deploy-frontend-gcloud.sh`.

### What the Script Does

1. **Loads** environment variables from `.env.production`
2. **Fetches** backend URL from Cloud Run
3. **Builds** frontend with Vite environment variables embedded
4. **Pushes** to Artifact Registry
5. **Deploys** to Cloud Run
6. **Updates** backend CORS to include frontend URL

### Run Frontend Deployment

```bash
# From project root
./scripts/deploy-frontend-gcloud.sh
```

### Expected Output

```
🚀 Google Cloud Run Frontend Deployment
=============================================
📄 Loading environment variables from .env.production
🔍 Getting backend service URL...
✓ Backend URL: https://harakka-backend-2dlkvkbokq-lz.a.run.app

🏗️  Building frontend with Google Cloud Build...
✅ Frontend deployed successfully!

📍 Service Information:
   Frontend URL: https://harakka-frontend-2dlkvkbokq-lz.a.run.app
   Health Check: https://harakka-frontend-2dlkvkbokq-lz.a.run.app/health

🔄 Updating backend CORS settings...
✓ ALLOWED_ORIGINS updated

🎉 Deployment complete!
```

---

## Post-Deployment

### 1. Update Supabase Auth URLs

Go to **Supabase Dashboard → Authentication → URL Configuration**:

**Site URL:**

```
https://harakka-frontend-2dlkvkbokq-lz.a.run.app
```

**Redirect URLs** (add both):

```
https://harakka-frontend-2dlkvkbokq-lz.a.run.app/**
http://localhost:5180/**
```

### 2. Set Up Cloud Scheduler (Cron Jobs)

<!-- TODO: didn't set it for this instance, do when new mail service is set up -->

```bash
# Create service account for Cloud Scheduler
gcloud iam service-accounts create harakka-scheduler \
  --display-name="Harakka Cloud Scheduler"

# Grant Cloud Run invoker role
gcloud run services add-iam-policy-binding harakka-backend \
  --member="serviceAccount:harakka-scheduler@harakka-demo.iam.gserviceaccount.com" \
  --role="roles/run.invoker" \
  --region=europe-north1

# Create scheduler job (runs daily at 9 AM)
BACKEND_URL=$(gcloud run services describe harakka-backend --region=europe-north1 --format='value(status.url)')

gcloud scheduler jobs create http harakka-reminders \
  --schedule="0 9 * * *" \
  --uri="${BACKEND_URL}/cron/reminders/run" \
  --http-method=POST \
  --headers="x-cron-secret=YOUR_CRON_SECRET" \
  --location=europe-north1 \
  --oidc-service-account-email="harakka-scheduler@harakka-demo.iam.gserviceaccount.com"
```

### 3. Verify Deployments

```bash
# Test backend health
BACKEND_URL=$(gcloud run services describe harakka-backend --region=europe-north1 --format='value(status.url)')
curl "${BACKEND_URL}/health"

# Test frontend health
FRONTEND_URL=$(gcloud run services describe harakka-frontend --region=europe-north1 --format='value(status.url)')
curl "${FRONTEND_URL}/health"

# Test API endpoint
curl "${BACKEND_URL}/api"
```

---

## Monitoring

### View Logs

```bash
# Backend logs (live tail)
gcloud run services logs tail harakka-backend --region=europe-north1

# Frontend logs (last 50 lines)
gcloud run services logs read harakka-frontend --region=europe-north1 --limit=50

# Build logs
gcloud builds list --limit=10
gcloud builds log <BUILD_ID>
```

### Service Status

```bash
# List all services
gcloud run services list --region=europe-north1

# Describe specific service
gcloud run services describe harakka-backend --region=europe-north1

# View revisions
gcloud run revisions list --service=harakka-backend --region=europe-north1
```

### Metrics (Cloud Console)

Visit: https://console.cloud.google.com/run?project=harakka-demo

Monitor:

- Request count
- Request latency
- Container instance count
- CPU and memory usage
- Error rate

---

## Additional Resources

- [Google Cloud Run Documentation](https://cloud.google.com/run/docs)
- [Cloud Build Documentation](https://cloud.google.com/build/docs)
- [Artifact Registry Documentation](https://cloud.google.com/artifact-registry/docs)
- [Cloud Scheduler Documentation](https://cloud.google.com/scheduler/docs)
- [Dockerfile Best Practices](https://docs.docker.com/develop/dev-best-practices/)

---

**Last Updated:** October 23, 2025  
**Deployment Method:** Google Cloud Build + Cloud Run  
**Region:** europe-north1  
**Project:** harakka-demo
