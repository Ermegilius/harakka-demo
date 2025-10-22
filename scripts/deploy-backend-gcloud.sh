set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
RESET='\033[0m'

echo -e "${CYAN}🚀 Google Cloud Run Backend Deployment${RESET}"
echo "============================================="

# Configuration
PROJECT_ID="${GCP_PROJECT_ID:-harakka-demo}"
REGION="${GCP_REGION:-europe-north1}"
SERVICE_NAME="harakka-backend"
IMAGE_URL="europe-north1-docker.pkg.dev/${PROJECT_ID}/harakka-demo/backend:latest"
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

# Validate required variables
required_vars=(
    "SUPABASE_URL"
    "SUPABASE_ANON_KEY"
    "SUPABASE_SERVICE_ROLE_KEY"
    "SUPABASE_JWT_SECRET"
    "SUPABASE_PROJECT_ID"
    "STORAGE_EMAIL"
    "STORAGE_EMAIL_PASSWORD"
    "CRON_SECRET"
    "SUPABASE_STORAGE_URL"
)

echo -e "${YELLOW}🔍 Validating required environment variables...${RESET}"
missing_vars=()

for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
        missing_vars+=("$var")
        echo -e "${RED}❌ $var is not set${RESET}"
    else
        echo -e "${GREEN}✓ $var is set${RESET}"
    fi
done

if [ ${#missing_vars[@]} -ne 0 ]; then
    echo -e "${RED}❌ Missing required environment variables. Please update $ENV_FILE${RESET}"
    exit 1
fi

echo ""
echo -e "${YELLOW}📋 Configuration:${RESET}"
echo "   Project ID: ${PROJECT_ID}"
echo "   Region: ${REGION}"
echo "   Service: ${SERVICE_NAME}"
echo "   Image: ${IMAGE_URL}"
echo ""

# Get backend URL if service exists (for CRON_URL)
echo -e "${YELLOW}🔍 Checking if backend service exists...${RESET}"
BACKEND_URL=$(gcloud run services describe $SERVICE_NAME \
    --region=$REGION \
    --format='value(status.url)' 2>/dev/null || echo "")

if [ -n "$BACKEND_URL" ]; then
    echo -e "${GREEN}✓ Backend service exists at: $BACKEND_URL${RESET}"
    CRON_URL_FINAL="${BACKEND_URL}/cron/reminders/run"
else
    echo -e "${YELLOW}⚠ Backend service not found. Will be created on first deployment.${RESET}"
    CRON_URL_FINAL="${CRON_URL:-https://temp-backend-url.run.app/cron/reminders/run}"
fi

# Get frontend URL if it exists (for ALLOWED_ORIGINS)
echo -e "${YELLOW}🔍 Checking if frontend service exists...${RESET}"
FRONTEND_URL=$(gcloud run services describe harakka-frontend \
    --region=$REGION \
    --format='value(status.url)' 2>/dev/null || echo "")

if [ -n "$FRONTEND_URL" ]; then
    echo -e "${GREEN}✓ Frontend service exists at: $FRONTEND_URL${RESET}"
    ALLOWED_ORIGINS_FINAL="${FRONTEND_URL},http://localhost:5180"
else
    echo -e "${YELLOW}⚠ Frontend service not found. Using .env.production ALLOWED_ORIGINS.${RESET}"
    ALLOWED_ORIGINS_FINAL="${ALLOWED_ORIGINS:-http://localhost:5180}"
fi

echo ""
echo -e "${CYAN}🔧 Preparing environment variables YAML file...${RESET}"

# Create temporary YAML file for environment variables
# ⚠️ REMOVED PORT - Cloud Run sets this automatically
ENV_VARS_YAML=$(mktemp --suffix=.yaml)

cat > "$ENV_VARS_YAML" << EOF
NODE_ENV: "production"
SUPABASE_URL: "${SUPABASE_URL}"
SUPABASE_ANON_KEY: "${SUPABASE_ANON_KEY}"
SUPABASE_SERVICE_ROLE_KEY: "${SUPABASE_SERVICE_ROLE_KEY}"
SUPABASE_JWT_SECRET: "${SUPABASE_JWT_SECRET}"
SUPABASE_PROJECT_ID: "${SUPABASE_PROJECT_ID}"
SUPABASE_STORAGE_URL: "${SUPABASE_STORAGE_URL}"
STORAGE_EMAIL: "${STORAGE_EMAIL}"
STORAGE_EMAIL_PASSWORD: "${STORAGE_EMAIL_PASSWORD}"
CRON_SECRET: "${CRON_SECRET}"
CRON_URL: "${CRON_URL_FINAL}"
ALLOWED_ORIGINS: "${ALLOWED_ORIGINS_FINAL}"
S3_REGION: "${S3_REGION:-eu-north-1}"
S3_BUCKET: "${S3_BUCKET:-item-images}"
EOF

echo -e "${GREEN}✓ Environment variables YAML file created${RESET}"
echo -e "${CYAN}📝 YAML content preview:${RESET}"
echo "---"
head -n 5 "$ENV_VARS_YAML"
echo "..."
echo "---"
echo ""

# Authenticate with gcloud if needed
echo -e "${YELLOW}🔐 Checking authentication...${RESET}"
gcloud auth configure-docker ${REGION}-docker.pkg.dev -q

echo ""
echo -e "${CYAN}🚀 Deploying backend service...${RESET}"
echo "   This may take a few minutes..."
echo ""

# Deploy using --env-vars-file
# Cloud Run will automatically set PORT (usually 8080)
# ⚠️ REMOVED --port flag - let Cloud Run use default
gcloud run deploy $SERVICE_NAME \
    --image=$IMAGE_URL \
    --platform=managed \
    --region=$REGION \
    --allow-unauthenticated \
    --min-instances=0 \
    --max-instances=10 \
    --memory=512Mi \
    --cpu=1 \
    --timeout=300 \
    --env-vars-file="$ENV_VARS_YAML"

# Clean up temporary YAML file
rm -f "$ENV_VARS_YAML"
echo -e "${GREEN}✓ Temporary YAML file cleaned up${RESET}"

echo ""
echo -e "${GREEN}✅ Backend deployed successfully!${RESET}"

# Get the deployed URL
DEPLOYED_URL=$(gcloud run services describe $SERVICE_NAME \
    --region=$REGION \
    --format='value(status.url)')

echo ""
echo -e "${CYAN}📍 Service Information:${RESET}"
echo "   Backend URL: $DEPLOYED_URL"
echo "   Health Check: ${DEPLOYED_URL}/health"
echo "   API Docs: ${DEPLOYED_URL}/api"
echo ""

# Test health endpoint
echo -e "${YELLOW}🏥 Testing health endpoint...${RESET}"
sleep 5
if curl -f -s "${DEPLOYED_URL}/health" > /dev/null; then
    echo -e "${GREEN}✓ Backend is healthy!${RESET}"
else
    echo -e "${RED}❌ Health check failed. Checking logs...${RESET}"
    echo ""
    gcloud run services logs read $SERVICE_NAME --region=$REGION --limit=20
    echo ""
    echo -e "${YELLOW}💡 Check full logs with:${RESET}"
    echo "   gcloud run services logs read $SERVICE_NAME --region=$REGION --limit=50"
fi

# If CRON_URL was placeholder, update it now
if [ "$CRON_URL_FINAL" != "${DEPLOYED_URL}/cron/reminders/run" ]; then
    echo ""
    echo -e "${YELLOW}🔄 Updating CRON_URL with actual backend URL...${RESET}"
    
    CRON_URL_FINAL="${DEPLOYED_URL}/cron/reminders/run"
    
    # Create temporary YAML for update
    UPDATE_YAML=$(mktemp --suffix=.yaml)
    echo "CRON_URL: \"${CRON_URL_FINAL}\"" > "$UPDATE_YAML"
    
    gcloud run services update $SERVICE_NAME \
        --region=$REGION \
        --env-vars-file="$UPDATE_YAML"
    
    rm -f "$UPDATE_YAML"
    echo -e "${GREEN}✓ CRON_URL updated to: ${CRON_URL_FINAL}${RESET}"
fi

echo ""
echo -e "${GREEN}🎉 Deployment complete!${RESET}"
echo ""
echo -e "${CYAN}📝 Next Steps:${RESET}"
echo "   1. Deploy frontend: ./scripts/deploy-frontend-gcloud.sh"
echo "   2. Verify CORS configuration"
echo "   3. Set up Cloud Scheduler for cron jobs"
echo "   4. Configure custom domain (optional)"
echo ""
echo -e "${CYAN}🔗 Useful Commands:${RESET}"
echo "   View logs:        gcloud run services logs read $SERVICE_NAME --region=$REGION"
echo "   Describe service: gcloud run services describe $SERVICE_NAME --region=$REGION"
echo "   List revisions:   gcloud run revisions list --service=$SERVICE_NAME --region=$REGION"
echo "   View env vars:    gcloud run services describe $SERVICE_NAME --region=$REGION --format='value(spec.template.spec.containers[0].env)'"
echo ""