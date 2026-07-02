#!/bin/bash
# Build and push the custom test runner Docker image to GCP Artifact Registry
# This is a one-time setup for the GitLab CI/CD pipeline

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}GitLab CI/CD Test Runner Image Builder${NC}"
echo -e "${YELLOW}========================================${NC}"
echo ""

# Check if GCP_PROJECT is set
if [ -z "$GCP_PROJECT" ]; then
    echo -e "${RED}Error: GCP_PROJECT environment variable is not set${NC}"
    echo "Usage: export GCP_PROJECT=your-project-id && ./build-test-runner.sh"
    exit 1
fi

# Variables
IMAGE_REGISTRY="us-central1-docker.pkg.dev"
IMAGE_NAME="${IMAGE_REGISTRY}/${GCP_PROJECT}/flywheel/test-runner"
IMAGE_TAG="latest"
FULL_IMAGE="${IMAGE_NAME}:${IMAGE_TAG}"
DOCKERFILE_PATH="infra/docker/test-runner.Dockerfile"

echo -e "${GREEN}Configuration:${NC}"
echo "  GCP Project: $GCP_PROJECT"
echo "  Image: $FULL_IMAGE"
echo "  Dockerfile: $DOCKERFILE_PATH"
echo ""

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
echo -e "${YELLOW}[1/4] Authenticating to GCP Artifact Registry...${NC}"
gcloud auth configure-docker ${IMAGE_REGISTRY} --quiet

# Build the Docker image
echo -e "${YELLOW}[2/4] Building Docker image...${NC}"
docker build \
    -f $DOCKERFILE_PATH \
    -t $FULL_IMAGE \
    .

# Verify the build
echo -e "${YELLOW}[3/4] Verifying image...${NC}"
docker run --rm $FULL_IMAGE sh -c "echo 'Go:' && go version && echo 'Node:' && node --version && echo 'Firebase:' && firebase --version"

# Push to Artifact Registry
echo -e "${YELLOW}[4/4] Pushing image to Artifact Registry...${NC}"
docker push $FULL_IMAGE

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✅ Success!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Test runner image is ready:"
echo "  $FULL_IMAGE"
echo ""
echo "Update GitLab CI/CD variable:"
echo "  TEST_RUNNER_IMAGE=$FULL_IMAGE"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Configure GitLab CI/CD variables (see docs/gitlab-ci-setup.md)"
echo "2. Push .gitlab-ci.yml to trigger pipeline"
echo "3. Monitor pipeline in GitLab UI"
echo ""
