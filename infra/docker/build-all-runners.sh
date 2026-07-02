#!/bin/bash
# Build and push all custom CI/CD runner Docker images to GCP Artifact Registry

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}GitLab CI/CD Runner Images Builder${NC}"
echo -e "${YELLOW}========================================${NC}"
echo ""
export GCP_PROJECT=flywheel-etl-prod
# Check if GCP_PROJECT is set
if [ -z "$GCP_PROJECT" ]; then
    echo -e "${RED}Error: GCP_PROJECT environment variable is not set${NC}"
    echo "Usage: export GCP_PROJECT=flywheel-etl-prod && ./build-all-runners.sh"
    exit 1
fi

# Variables
IMAGE_REGISTRY="us-central1-docker.pkg.dev"
PROJECT_ID="${GCP_PROJECT}"
REPO="flywheel-ci"  # CI images in separate repository

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}Error: gcloud CLI is not installed${NC}"
    echo "Install: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Check if Docker is running
if ! docker info &> /dev/null; then
    echo -e "${RED}Error: Docker is not running${NC}"
    exit 1
fi

# Authenticate to Artifact Registry
echo -e "${YELLOW}[1/7] Authenticating to GCP Artifact Registry...${NC}"
gcloud auth configure-docker ${IMAGE_REGISTRY} --quiet

# Build and push test-runner
echo ""
echo -e "${YELLOW}[2/7] Building test-runner image...${NC}"
TEST_RUNNER_IMAGE="${IMAGE_REGISTRY}/${PROJECT_ID}/${REPO}/test-runner:latest"
docker build \
    --platform linux/amd64 \
    -f infra/docker/test-runner.Dockerfile \
    -t $TEST_RUNNER_IMAGE \
    .
echo -e "${GREEN}✅ test-runner built${NC}"
docker push $TEST_RUNNER_IMAGE
echo -e "${GREEN}✅ test-runner pushed${NC}"

# Build and push gcp-deployer
echo ""
echo -e "${YELLOW}[3/7] Building gcp-deployer image...${NC}"
GCP_DEPLOYER_IMAGE="${IMAGE_REGISTRY}/${PROJECT_ID}/${REPO}/gcp-deployer:latest"
docker build \
    --platform linux/amd64 \
    -f infra/docker/gcp-deployer.Dockerfile \
    -t $GCP_DEPLOYER_IMAGE \
    .
echo -e "${GREEN}✅ gcp-deployer built${NC}"
docker push $GCP_DEPLOYER_IMAGE
echo -e "${GREEN}✅ gcp-deployer pushed${NC}"

# Build and push terraform-deployer
echo ""
echo -e "${YELLOW}[4/7] Building terraform-deployer image...${NC}"
TERRAFORM_DEPLOYER_IMAGE="${IMAGE_REGISTRY}/${PROJECT_ID}/${REPO}/terraform-deployer:latest"
docker build \
    --platform linux/amd64 \
    -f infra/docker/terraform-deployer.Dockerfile \
    -t $TERRAFORM_DEPLOYER_IMAGE \
    .
echo -e "${GREEN}✅ terraform-deployer built${NC}"
docker push $TERRAFORM_DEPLOYER_IMAGE
echo -e "${GREEN}✅ terraform-deployer pushed${NC}"

# Build and push frontend-builder
echo ""
echo -e "${YELLOW}[5/7] Building frontend-builder image...${NC}"
FRONTEND_BUILDER_IMAGE="${IMAGE_REGISTRY}/${PROJECT_ID}/${REPO}/frontend-builder:latest"
docker build \
    --platform linux/amd64 \
    -f infra/docker/frontend-builder.Dockerfile \
    -t $FRONTEND_BUILDER_IMAGE \
    .
echo -e "${GREEN}✅ frontend-builder built${NC}"
docker push $FRONTEND_BUILDER_IMAGE
echo -e "${GREEN}✅ frontend-builder pushed${NC}"

# Build and push postgres-test
echo ""
echo -e "${YELLOW}[6/7] Building postgres-test image...${NC}"
POSTGRES_TEST_IMAGE="${IMAGE_REGISTRY}/${PROJECT_ID}/${REPO}/postgres-test:latest"
docker build \
    --platform linux/amd64 \
    -f infra/docker/postgres-test.Dockerfile \
    -t $POSTGRES_TEST_IMAGE \
    .
echo -e "${GREEN}✅ postgres-test built${NC}"
docker push $POSTGRES_TEST_IMAGE
echo -e "${GREEN}✅ postgres-test pushed${NC}"

# Build and push python-builder
echo ""
echo -e "${YELLOW}[7/7] Building python-builder image...${NC}"
PYTHON_BUILDER_IMAGE="${IMAGE_REGISTRY}/${PROJECT_ID}/${REPO}/python-builder:latest"
docker build \
    --platform linux/amd64 \
    -f infra/docker/python-builder.Dockerfile \
    -t $PYTHON_BUILDER_IMAGE \
    .
echo -e "${GREEN}✅ python-builder built${NC}"
docker push $PYTHON_BUILDER_IMAGE
echo -e "${GREEN}✅ python-builder pushed${NC}"

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✅ All runner images built and pushed!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Images available:"
echo "  1. Test Runner:        $TEST_RUNNER_IMAGE"
echo "  2. GCP Deployer:       $GCP_DEPLOYER_IMAGE"
echo "  3. Terraform Deployer: $TERRAFORM_DEPLOYER_IMAGE"
echo "  4. Frontend Builder:   $FRONTEND_BUILDER_IMAGE"
echo "  5. PostgreSQL Test DB: $POSTGRES_TEST_IMAGE"
echo "  6. Python Builder:     $PYTHON_BUILDER_IMAGE"
echo ""
echo -e "${YELLOW}Update .gitlab-ci.yml to use these images:${NC}"
echo ""
echo "test-backend:"
echo "  image: $TEST_RUNNER_IMAGE"
echo ""
echo "build-backend:"
echo "  image: $GCP_DEPLOYER_IMAGE"
echo ""
echo "plan:"
echo "  image: $TERRAFORM_DEPLOYER_IMAGE"
echo ""
echo "apply:"
echo "  image: $TERRAFORM_DEPLOYER_IMAGE"
echo ""
echo "lint-frontend / test-frontend / vercel-preview / promote-vercel:"
echo "  image: $FRONTEND_BUILDER_IMAGE"
echo ""
echo "lint-agent / test-agent:"
echo "  image: $PYTHON_BUILDER_IMAGE"
echo ""