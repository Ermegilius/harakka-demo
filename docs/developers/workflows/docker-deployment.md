# Production Deployment

## Google Cloud Run Deployment

This guide covers deploying the Harakka application to Google Cloud Run using pre-built container images from Google Artifact Registry.

### Prerequisites

1. **Google Cloud Account** with billing enabled
2. **Google Cloud CLI** (`gcloud`) installed and configured
3. **Docker images** already built and . **Docker images** already built and pushed to Google Artifact Registry
4. **Supabase project** set up and accessible

### Verify gcloud Installation

```bash
# Check installation
gcloud --version

# Login to Google Cloud
gcloud auth login

# Set your project
gcloud config set project YOUR_PROJECT_ID

# Enable required APIs
gcloud services enable run.googleapis.com
gcloud services enable artifactregistry.googleapis.com
```

---

### Step 1: Prepare Environment Variables

Create a `.env.production` file with production values:

```bash
# Supabase Configuration (Production)
SUPABASE_PROJECT_ID=rcbddkhvysexkvgqpcud
SUPABASE_URL=https://rcbddkhvysexkvgqpcud.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-production-service-role-key
SUPABASE_ANON_KEY=your-production-anon-key
SUPABASE_JWT_SECRET=your-production-jwt-secret

# Backend Configuration
PORT=8080
NODE_ENV=production
ALLOWED_ORIGINS=https://your-frontend-url.run.app

# S3 Configuration
SUPABASE_STORAGE_URL=https://rcbddkhvysexkvgqpcud.supabase.co/storage/v1/s3

# Email Configuration
STORAGE_EMAIL=harakka.storage.solutions@gmail.com
STORAGE_EMAIL_PASSWORD=your-app-password

# Cron Configuration
CRON_SECRET=your-production-cron-secret
CRON_URL=https://your-backend-url.run.app/cron/reminders/run
```

**⚠️ Security Notes:**

- Never commit `.env.production` to git
- Use Google Secret Manager for sensitive values in production
- Rotate secrets regularly

---

### Step 2: Deploy Backend Service

#### Deploy from Artifact Registry

```bash
# Set variables
PROJECT_ID="your-project-id"
REGION="europe-north1"  # Choose closest region
SERVICE_NAME="harakka-backend"
IMAGE_URL="europe-north1-docker.pkg.dev/${PROJECT_ID}/harakka-demo/backend:latest"

# Deploy backend
gcloud run deploy ${SERVICE_NAME} \
  --image=${IMAGE_URL} \
  --region=${REGION} \
  --platform=managed \
  --allow-unauthenticated \
  --port=8080 \
  --memory=512Mi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=10 \
  --set-env-vars="NODE_ENV=production,PORT=8080" \
  --set-env-vars="SUPABASE_PROJECT_ID=rcbddkhvysexkvgqpcud" \
  --set-env-vars="SUPABASE_URL=https://rcbddkhvysexkvgqpcud.supabase.co" \
  --set-secrets="SUPABASE_SERVICE_ROLE_KEY=harakka-service-role-key:latest" \
  --set-secrets="SUPABASE_ANON_KEY=harakka-anon-key:latest" \
  --set-secrets="SUPABASE_JWT_SECRET=harakka-jwt-secret:latest" \
  --set-secrets="STORAGE_EMAIL_PASSWORD=harakka-email-password:latest" \
  --set-secrets="CRON_SECRET=harakka-cron-secret:latest"
```

**Get the backend URL:**

```bash
BACKEND_URL=$(gcloud run services describe ${SERVICE_NAME} \
  --region=${REGION} \
  --format='value(status.url)')
echo "Backend URL: ${BACKEND_URL}"
```

---

### Step 3: Configure Backend Environment

#### Using Google Secret Manager (Recommended)

```bash
# Create secrets in Secret Manager
echo -n "your-service-role-key" | gcloud secrets create harakka-service-role-key \
  --data-file=- \
  --replication-policy="automatic"

echo -n "your-anon-key" | gcloud secrets create harakka-anon-key \
  --data-file=- \
  --replication-policy="automatic"

echo -n "your-jwt-secret" | gcloud secrets create harakka-jwt-secret \
  --data-file=- \
  --replication-policy="automatic"

echo -n "your-email-password" | gcloud secrets create harakka-email-password \
  --data-file=- \
  --replication-policy="automatic"

echo -n "your-cron-secret" | gcloud secrets create harakka-cron-secret \
  --data-file=- \
  --replication-policy="automatic"

# Grant Cloud Run access to secrets
gcloud secrets add-iam-policy-binding harakka-service-role-key \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

#### Update Backend with Secrets

```bash
# Update the service with all environment variables and secrets
gcloud run services update harakka-backend \
  --region=${REGION} \
  --update-env-vars="ALLOWED_ORIGINS=https://your-frontend-url.run.app,http://localhost:5180" \
  --update-env-vars="STORAGE_EMAIL=harakka.storage.solutions@gmail.com" \
  --update-env-vars="CRON_URL=${BACKEND_URL}/cron/reminders/run"
```

---

### Step 4: Deploy Frontend Service

```bash
# Set variables
FRONTEND_SERVICE="harakka-frontend"
FRONTEND_IMAGE="europe-north1-docker.pkg.dev/${PROJECT_ID}/harakka-repo/frontend:latest"

# Build frontend with production environment variables
# Note: These must be set at BUILD TIME for Vite
docker build \
  --build-arg VITE_API_URL="${BACKEND_URL}/api" \
  --build-arg VITE_SUPABASE_URL="https://rcbddkhvysexkvgqpcud.supabase.co" \
  --build-arg VITE_SUPABASE_ANON_KEY="your-anon-key" \
  -f frontend/Dockerfile \
  -t ${FRONTEND_IMAGE} \
  .

# Push to Artifact Registry
docker push ${FRONTEND_IMAGE}

# Deploy frontend
gcloud run deploy ${FRONTEND_SERVICE} \
  --image=${FRONTEND_IMAGE} \
  --region=${REGION} \
  --platform=managed \
  --allow-unauthenticated \
  --port=80 \
  --memory=256Mi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=10
```

**Get the frontend URL:**

```bash
FRONTEND_URL=$(gcloud run services describe ${FRONTEND_SERVICE} \
  --region=${REGION} \
  --format='value(status.url)')
echo "Frontend URL: ${FRONTEND_URL}"
```

---

### Step 5: Update Backend CORS Settings

```bash
# Update backend with frontend URL for CORS
gcloud run services update harakka-backend \
  --region=${REGION} \
  --update-env-vars="ALLOWED_ORIGINS=${FRONTEND_URL},http://localhost:5180"
```

---

### Step 6: Configure Custom Domain (Optional)

```bash
# Map custom domain to frontend
gcloud run domain-mappings create \
  --service=${FRONTEND_SERVICE} \
  --domain=app.harakka.com \
  --region=${REGION}

# Map custom domain to backend
gcloud run domain-mappings create \
  --service=${SERVICE_NAME} \
  --domain=api.harakka.com \
  --region=${REGION}
```

**Update DNS records** with the values provided by Cloud Run.

---

### Step 7: Set Up Cloud Scheduler (Cron Jobs)

```bash
# Create a service account for Cloud Scheduler
gcloud iam service-accounts create harakka-scheduler \
  --display-name="Harakka Cloud Scheduler"

# Grant invoker role to the service account
gcloud run services add-iam-policy-binding harakka-backend \
  --member="serviceAccount:harakka-scheduler@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/run.invoker" \
  --region=${REGION}

# Create Cloud Scheduler job for reminders
gcloud scheduler jobs create http harakka-reminders \
  --schedule="0 9 * * *" \
  --uri="${BACKEND_URL}/cron/reminders/run" \
  --http-method=POST \
  --headers="x-cron-secret=your-cron-secret" \
  --location=${REGION} \
  --oidc-service-account-email="harakka-scheduler@${PROJECT_ID}.iam.gserviceaccount.com"
```

---

#### Monitoring and Logging

##### View Logs

```bash
# Backend logs
gcloud run logs read harakka-backend --region=${REGION} --limit=50

# Frontend logs
gcloud run logs read harakka-frontend --region=${REGION} --limit=50

# Follow logs in real-time
gcloud run logs tail harakka-backend --region=${REGION}
```

##### View Service Details

```bash
# Backend service details
gcloud run services describe harakka-backend --region=${REGION}

# Frontend service details
gcloud run services describe harakka-frontend --region=${REGION}
```

##### Monitor Performance

```bash
# View metrics in Cloud Console
https://console.cloud.google.com/run?project=${PROJECT_ID}
```

---

#### Scaling Configuration

##### Update Service Settings

```bash
# Configure autoscaling
gcloud run services update harakka-backend \
  --region=${REGION} \
  --min-instances=1 \
  --max-instances=20 \
  --cpu=2 \
  --memory=1Gi \
  --concurrency=80 \
  --timeout=300

# Configure frontend scaling
gcloud run services update harakka-frontend \
  --region=${REGION} \
  --min-instances=1 \
  --max-instances=10 \
  --cpu=1 \
  --memory=512Mi
```

---

#### Rollback and Revisions

```bash
# List revisions
gcloud run revisions list --service=harakka-backend --region=${REGION}

# Rollback to previous revision
gcloud run services update-traffic harakka-backend \
  --region=${REGION} \
  --to-revisions=harakka-backend-00002-abc=100

# Gradual traffic split (blue-green deployment)
gcloud run services update-traffic harakka-backend \
  --region=${REGION} \
  --to-revisions=harakka-backend-00003-xyz=50,harakka-backend-00002-abc=50
```

---

#### CI/CD Integration

##### Deploy Script Example

Create `deploy-production.sh`:

```bash
#!/bin/bash
set -e

PROJECT_ID="your-project-id"
REGION="europe-north1"
BACKEND_IMAGE="europe-north1-docker.pkg.dev/${PROJECT_ID}/harakka-repo/backend:${GITHUB_SHA:-latest}"
FRONTEND_IMAGE="europe-north1-docker.pkg.dev/${PROJECT_ID}/harakka-repo/frontend:${GITHUB_SHA:-latest}"

echo "Deploying backend..."
gcloud run deploy harakka-backend \
  --image=${BACKEND_IMAGE} \
  --region=${REGION} \
  --platform=managed

echo "Getting backend URL..."
BACKEND_URL=$(gcloud run services describe harakka-backend \
  --region=${REGION} \
  --format='value(status.url)')

echo "Deploying frontend..."
gcloud run deploy harakka-frontend \
  --image=${FRONTEND_IMAGE} \
  --region=${REGION} \
  --platform=managed

echo "Deployment complete!"
echo "Backend: ${BACKEND_URL}"
echo "Frontend: $(gcloud run services describe harakka-frontend --region=${REGION} --format='value(status.url)')"
```

---

#### Cost Optimization

##### Cloud Run Pricing Tips

1. **Use min-instances=0** for development environments
2. **Set appropriate timeouts** to avoid idle charges
3. **Optimize container size** to reduce cold start times
4. **Use Cloud CDN** for static frontend assets
5. **Monitor and set budget alerts**

```bash
# Set budget alert
gcloud billing budgets create \
  --billing-account=YOUR_BILLING_ACCOUNT_ID \
  --display-name="Harakka Monthly Budget" \
  --budget-amount=50USD \
  --threshold-rule=percent=50 \
  --threshold-rule=percent=90
```

---

#### Troubleshooting Cloud Run

##### Service Not Starting

```bash
# Check service status
gcloud run services describe harakka-backend --region=${REGION}

# View detailed logs
gcloud run logs read harakka-backend --region=${REGION} --limit=100

# Check environment variables
gcloud run services describe harakka-backend \
  --region=${REGION} \
  --format='value(spec.template.spec.containers[0].env)'
```

##### CORS Errors

```bash
# Verify ALLOWED_ORIGINS includes frontend URL
gcloud run services describe harakka-backend \
  --region=${REGION} \
  --format='value(spec.template.spec.containers[0].env)' | grep ALLOWED_ORIGINS
```

##### Secret Access Denied

```bash
# Check service account has access to secrets
gcloud secrets get-iam-policy harakka-service-role-key

# Grant access if missing
gcloud secrets add-iam-policy-binding harakka-service-role-key \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

---

#### Clean Up Resources

```bash
# Delete services
gcloud run services delete harakka-backend --region=${REGION} --quiet
gcloud run services delete harakka-frontend --region=${REGION} --quiet

# Delete Cloud Scheduler jobs
gcloud scheduler jobs delete harakka-reminders --location=${REGION} --quiet

# Delete secrets
gcloud secrets delete harakka-service-role-key --quiet
gcloud secrets delete harakka-anon-key --quiet
gcloud secrets delete harakka-jwt-secret --quiet
```

---

#### Production Checklist

- [ ] Backend deployed and healthy
- [ ] Frontend deployed and healthy
- [ ] Environment variables configured correctly
- [ ] Secrets stored in Secret Manager
- [ ] CORS origins updated with production URLs
- [ ] Cloud Scheduler jobs configured
- [ ] Custom domains mapped (if applicable)
- [ ] SSL certificates active
- [ ] Monitoring and logging configured
- [ ] Budget alerts set up
- [ ] Backup and disaster recovery plan in place

---

### Additional Resources

- [Google Cloud Run Documentation](https://cloud.google.com/run/docs)
- [Google Secret Manager](https://cloud.google.com/secret-manager/docs)
- [Cloud Scheduler Documentation](https://cloud.google.com/scheduler/docs)
- [Cloud Run Pricing](https://cloud.google.com/run/pricing)
- [Best Practices for Cloud Run](https://cloud.google.com/run/docs/best-practices)

---
