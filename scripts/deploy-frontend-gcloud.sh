#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
RESET='\033[0m'

echo -e "${CYAN}🚀 Google Cloud Run Frontend Deployment${RESET}"
echo "============================================="

# Configuration
PROJECT_ID="${GCP_PROJECT_ID:-harakka-demo}"
REGION="${GCP_REGION:-europe-north1}"
SERVICE_NAME="harakka-frontend"
IMAGE_URL="europe-north1-docker.pkg.dev/${PROJECT_ID}/harakka-demo/frontend:latest"
ENV_FILE=".env.production"

# Check if .env.production exists
if [ ! -f "$ENV_FILE" ]; then
    echo -e "${RED}❌ $ENV_FILE not found!${RESET}"
    echo "Please create it from .env.production.template"
    exit 1
fi

# Load environment variables from .env.production
echo -e "${YELLOW}📄 Loading environment variables from $ENV_FILE${RESET}"
set -a
source "$ENV_FILE"
set +a

# Get backend URL
echo -e "${YELLOW}🔍 Getting backend service URL...${RESET}"
BACKEND_SERVICE="harakka-backend"
BACKEND_URL=$(gcloud run services describe $BACKEND_SERVICE \
    --region=$REGION \
    --format='value(status.url)' 2>/dev/null || echo "")

if [ -z "$BACKEND_URL" ]; then
    echo -e "${RED}❌ Backend service not found!${RESET}"
    echo -e "${YELLOW}💡 Please deploy backend first:${RESET}"
    echo "   ./scripts/deploy-backend-gcloud.sh"
    exit 1
fi

echo -e "${GREEN}✓ Backend URL: $BACKEND_URL${RESET}"

# Validate Vite variables
required_vite_vars=(
    "VITE_SUPABASE_URL"
    "VITE_SUPABASE_ANON_KEY"
)

echo -e "${YELLOW}🔍 Validating Vite environment variables...${RESET}"
missing_vars=()

for var in "${required_vite_vars[@]}"; do
    if [ -z "${!var}" ]; then
        missing_vars+=("$var")
        echo -e "${RED}❌ $var is not set${RESET}"
    else
        echo -e "${GREEN}✓ $var is set${RESET}"
    fi
done

if [ ${#missing_vars[@]} -ne 0 ]; then
    echo -e "${RED}❌ Missing required Vite variables. Please update $ENV_FILE${RESET}"
    exit 1
fi

VITE_API_URL_BUILD="${BACKEND_URL}"
echo -e "${GREEN}✓ VITE_API_URL set to: ${VITE_API_URL_BUILD}${RESET}"

echo ""
echo -e "${YELLOW}📋 Configuration:${RESET}"
echo "   Project ID: ${PROJECT_ID}"
echo "   Region: ${REGION}"
echo "   Service: ${SERVICE_NAME}"
echo "   Image: ${IMAGE_URL}"
echo "   Backend URL: ${BACKEND_URL}"
echo ""

# Authenticate
echo -e "${YELLOW}🔐 Checking authentication...${RESET}"
gcloud auth configure-docker ${REGION}-docker.pkg.dev -q

echo ""
echo -e "${CYAN}🏗️  Creating Cloud Build configuration...${RESET}"

# Create temporary cloudbuild.yaml
CLOUDBUILD_FILE=$(mktemp --suffix=.yaml)

cat > "$CLOUDBUILD_FILE" << EOF
steps:
  - name: 'gcr.io/cloud-builders/docker'
    args:
      - 'build'
      - '--build-arg'
      - 'BUILD_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")'
      - '--build-arg'
      - 'VCS_REF=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")'
      - '--build-arg'
      - 'VITE_API_URL=${VITE_API_URL_BUILD}'
      - '--build-arg'
      - 'VITE_SUPABASE_URL=${VITE_SUPABASE_URL}'
      - '--build-arg'
      - 'VITE_SUPABASE_ANON_KEY=${VITE_SUPABASE_ANON_KEY}'
      - '--build-arg'
      - 'NODE_ENV=production'
      - '-t'
      - '${IMAGE_URL}'
      - '-f'
      - 'frontend/Dockerfile'
      - '.'
    timeout: 1200s

images:
  - '${IMAGE_URL}'

options:
  machineType: 'E2_HIGHCPU_8'
  diskSizeGb: 100
  logging: CLOUD_LOGGING_ONLY
EOF

echo -e "${GREEN}✓ Cloud Build configuration created${RESET}"
echo -e "${CYAN}📝 Configuration preview:${RESET}"
head -n 15 "$CLOUDBUILD_FILE"
echo "..."

echo ""
echo -e "${CYAN}🏗️  Building frontend with Google Cloud Build...${RESET}"
echo "   This may take several minutes..."
echo ""

# Submit build using cloudbuild.yaml
gcloud builds submit \
    --config="$CLOUDBUILD_FILE" \
    --timeout=20m \
    .

# Clean up temporary file
rm -f "$CLOUDBUILD_FILE"

echo -e "${GREEN}✓ Image built and pushed to Artifact Registry${RESET}"

echo ""
echo -e "${CYAN}🚀 Deploying frontend service to Cloud Run...${RESET}"

gcloud run deploy ${SERVICE_NAME} \
    --image=${IMAGE_URL} \
    --platform=managed \
    --region=${REGION} \
    --allow-unauthenticated \
    --min-instances=0 \
    --max-instances=10 \
    --memory=512Mi \
    --cpu=1 \
    --timeout=60 \
    --port=8080

echo ""
echo -e "${GREEN}✅ Frontend deployed successfully!${RESET}"

# Get frontend URL
FRONTEND_URL=$(gcloud run services describe ${SERVICE_NAME} \
    --region=${REGION} \
    --format='value(status.url)')

echo ""
echo -e "${CYAN}📍 Service Information:${RESET}"
echo "   Frontend URL: ${FRONTEND_URL}"
echo "   Health Check: ${FRONTEND_URL}/health"
echo ""

# Test health
echo -e "${YELLOW}🏥 Testing health endpoint...${RESET}"
sleep 5
if curl -f -s "${FRONTEND_URL}/health" > /dev/null; then
    echo -e "${GREEN}✓ Frontend is healthy!${RESET}"
else
    echo -e "${RED}❌ Health check failed${RESET}"
    gcloud run services logs read ${SERVICE_NAME} --region=${REGION} --limit=20
fi

echo ""
echo -e "${CYAN}🔄 Updating backend CORS settings...${RESET}"

# Get current ALLOWED_ORIGINS
CURRENT_ALLOWED_ORIGINS=$(gcloud run services describe ${BACKEND_SERVICE} \
    --region=${REGION} \
    --format='value(spec.template.spec.containers[0].env[?name==`ALLOWED_ORIGINS`].value)' || echo "")

echo -e "${CYAN}Current ALLOWED_ORIGINS: ${CURRENT_ALLOWED_ORIGINS}${RESET}"

# Check if already exists
if [[ "$CURRENT_ALLOWED_ORIGINS" == *"$FRONTEND_URL"* ]]; then
    echo -e "${GREEN}✓ Frontend URL already in ALLOWED_ORIGINS${RESET}"
else
    if [ -n "$CURRENT_ALLOWED_ORIGINS" ]; then
        NEW_ORIGINS="${CURRENT_ALLOWED_ORIGINS},${FRONTEND_URL}"
    else
        NEW_ORIGINS="${FRONTEND_URL},http://localhost:5180"
    fi
    
    echo -e "${YELLOW}New ALLOWED_ORIGINS: ${NEW_ORIGINS}${RESET}"
    
    # Create YAML for update
    BACKEND_ENV_YAML=$(mktemp --suffix=.yaml)
    echo "ALLOWED_ORIGINS: \"${NEW_ORIGINS}\"" > "$BACKEND_ENV_YAML"
    
    gcloud run services update ${BACKEND_SERVICE} \
        --region=${REGION} \
        --env-vars-file="$BACKEND_ENV_YAML"
    
    rm -f "$BACKEND_ENV_YAML"
    echo -e "${GREEN}✓ ALLOWED_ORIGINS updated${RESET}"
fi

echo ""
echo -e "${GREEN}🎉 Deployment complete!${RESET}"
echo ""
echo -e "${CYAN}📊 Access Points:${RESET}"
echo "   Frontend: ${FRONTEND_URL}"
echo "   Backend:  ${BACKEND_URL}"
echo ""
echo -e "${CYAN}📝 Next Steps:${RESET}"
echo "   1. Visit: ${FRONTEND_URL}"
echo "   2. Test the application"
echo "   3. Set up Cloud Scheduler for cron jobs"
echo "   4. Configure monitoring"
echo ""
echo -e "${CYAN}🔗 Useful Commands:${RESET}"
echo "   View logs:        gcloud run services logs read ${SERVICE_NAME} --region=${REGION}"
echo "   Describe service: gcloud run services describe ${SERVICE_NAME} --region=${REGION}"
echo "   View builds:      gcloud builds list --limit=10"
echo ""