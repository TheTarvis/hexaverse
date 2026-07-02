# Bootstrap Guide: Zero to Production with Terraform

This guide walks through creating your entire infrastructure from scratch using Terraform. All GCP APIs, Firebase configuration, Cloud Run, Pub/Sub, and other resources are managed declaratively in Terraform.

## Prerequisites

1. **GCP Project**: Create a new GCP project (e.g., `flywheel-etl-dev`)
2. **Billing**: Enable billing on the project
3. **gcloud CLI**: Install and authenticate (`gcloud auth application-default login`)
4. **Terraform**: Install version 1.0+
5. **GitLab Access**: For Terraform state backend (or configure local state for initial setup)

## Key Changes from Manual Setup

**All infrastructure is now in Terraform:**

- ✅ GCP API enablement (`services.tf`)
- ✅ Firestore database creation (`firebase.tf`)
- ✅ Proper dependency ordering with `depends_on`

No manual `gcloud` commands needed - Terraform handles everything!

## Step 1: Configure Environment Variables

Update the appropriate `.tfvars` file for your environment:

```bash
cd infra/terraform

# For dev environment, edit environments/dev.tfvars
# For prod environment, edit environments/prod.tfvars
```

Verify it has:

```hcl
project_id         = "flywheel-etl-dev"  # Your actual project ID
region             = "us-central1"
environment        = "dev"
scheduler_timezone = "UTC"
vercel_api_token   = ""  # Add if using Vercel integration
```

## Step 2: Initialize Terraform

```bash
cd infra/terraform

# Initialize Terraform
# Note: If using GitLab backend, set TF_HTTP_PASSWORD with your GitLab personal access token
# For local testing, you can use local backend instead
terraform init
```

## Step 3: Plan Infrastructure

```bash
terraform plan -var-file=environments/dev.tfvars
```

Review the plan. You should see resources to create:

- **GCP API Services** (11 APIs in `services.tf`)
- **Firebase** project and web app
- **Firestore** database
- **Storage buckets** (imports, exports, e2e-test)
- **Artifact Registry** for Docker images
- **Cloud Run services** (backend, claude-agent)
- **Pub/Sub topics** (15+ event topics)
- **Cloud Scheduler** job
- **Service accounts** and IAM bindings
- **Secrets** (OAuth, Anthropic API key)

## Step 4: Apply Infrastructure

```bash
terraform apply -var-file=environments/dev.tfvars
```

Type `yes` when prompted. Terraform will:

1. Enable all required GCP APIs
2. Create Firestore database
3. Set up Firebase web app with config
4. Create Cloud Run services (backend, claude-agent)
5. Set up all Pub/Sub topics
6. Create Cloud Scheduler for cron jobs
7. Configure service accounts with proper permissions
8. Create Artifact Registry for Docker images
9. Set up Cloud Storage buckets with lifecycle policies
10. Create Secret Manager secrets

**Note**: The initial `terraform apply` may take 5-10 minutes as it enables APIs and creates resources with dependencies.

## Step 5: Get Firebase Configuration for GitLab CI/CD

After Terraform completes, extract all the values you need:

```bash
# Get all Firebase config values
terraform output -json firebase_config

# Or get individual values:
terraform output firebase_api_key
terraform output firebase_auth_domain
terraform output firebase_app_id
terraform output firebase_measurement_id
terraform output firebase_messaging_sender_id
terraform output firebase_storage_bucket
```

## Step 6: Set GitLab CI/CD Variables

Go to your GitLab project → Settings → CI/CD → Variables

### Add these as **CI/CD Variables**:

```bash
# Get values from Terraform outputs
FIREBASE_API_KEY=$(terraform output -raw firebase_api_key)
FIREBASE_AUTH_DOMAIN=$(terraform output -raw firebase_auth_domain)
FIREBASE_STORAGE_BUCKET=$(terraform output -raw firebase_storage_bucket)
FIREBASE_MESSAGING_SENDER_ID=$(terraform output -raw firebase_messaging_sender_id)
FIREBASE_APP_ID=$(terraform output -raw firebase_app_id)
FIREBASE_MEASUREMENT_ID=$(terraform output -raw firebase_measurement_id)

# Project configuration
GCP_PROJECT_ID="flywheel-etl-dev"  # Your project ID
VERCEL_API_TOKEN="<your-vercel-token>"  # For frontend deployment

# You'll need to set these manually (from Google OAuth Console):
GOOGLE_OAUTH_CLIENT_ID="<your-oauth-client-id>"
GOOGLE_OAUTH_CLIENT_SECRET="<your-oauth-client-secret>"

# Anthropic API key for Claude Agent
ANTHROPIC_API_KEY="<your-anthropic-api-key>"
```

### Set up Workload Identity Federation for GitLab

For GitLab CI/CD to authenticate with GCP, you need WIF:

```bash
# Set your project ID
export PROJECT_ID="flywheel-etl-dev"
gcloud config set project $PROJECT_ID

# Create workload identity pool for GitLab
gcloud iam workload-identity-pools create "gitlab-pool" \
  --location="global" \
  --display-name="GitLab CI/CD Pool"

# Create workload identity provider
gcloud iam workload-identity-pools providers create-oidc "gitlab-provider" \
  --location="global" \
  --workload-identity-pool="gitlab-pool" \
  --display-name="GitLab Provider" \
  --attribute-mapping="google.subject=assertion.sub,attribute.project_path=assertion.project_path,attribute.ref=assertion.ref" \
  --issuer-uri="https://gitlab.com"

# Create or use existing service account for GitLab CI
# (Terraform creates gitlab-ci-deployer service account)
# Grant it necessary permissions if not already done via Terraform

# Allow GitLab CI to impersonate the service account
# Replace <YOUR_GITLAB_ORG>/<YOUR_REPO> with your actual GitLab project path
gcloud iam service-accounts add-iam-policy-binding \
  "gitlab-ci-deployer@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')/locations/global/workloadIdentityPools/gitlab-pool/attribute.project_path/<YOUR_GITLAB_ORG>/<YOUR_REPO>"

# Get WIF provider name for GitLab CI variables
gcloud iam workload-identity-pools providers describe "gitlab-provider" \
  --location="global" \
  --workload-identity-pool="gitlab-pool" \
  --format="value(name)"
```

Add to GitLab CI/CD Variables:

```bash
GCP_WORKLOAD_IDENTITY_PROVIDER="projects/<PROJECT_NUMBER>/locations/global/workloadIdentityPools/gitlab-pool/providers/gitlab-provider"
GCP_SERVICE_ACCOUNT="gitlab-ci-deployer@${PROJECT_ID}.iam.gserviceaccount.com"
```

## Step 7: Add Secret Values to Secret Manager

Terraform creates the secret resources, but you need to add the actual secret values:

```bash
# Set your project ID
export PROJECT_ID="flywheel-etl-dev"

# Add Google OAuth credentials
echo -n "your-oauth-client-id" | gcloud secrets versions add google-oauth-client-id --data-file=- --project=$PROJECT_ID
echo -n "your-oauth-client-secret" | gcloud secrets versions add google-oauth-client-secret --data-file=- --project=$PROJECT_ID

# Add Anthropic API key
echo -n "your-anthropic-api-key" | gcloud secrets versions add anthropic-api-key --data-file=- --project=$PROJECT_ID
```

## Step 8: Build and Push Initial Docker Images

Before deploying, you need initial Docker images:

```bash
# Authenticate Docker
gcloud auth configure-docker us-central1-docker.pkg.dev

# Build and push backend image
cd backend
docker build -t us-central1-docker.pkg.dev/$PROJECT_ID/flywheel/backend:latest .
docker push us-central1-docker.pkg.dev/$PROJECT_ID/flywheel/backend:latest

# Build and push claude-agent image
cd ../claude-agent
docker build -t us-central1-docker.pkg.dev/$PROJECT_ID/flywheel/claude-agent:latest .
docker push us-central1-docker.pkg.dev/$PROJECT_ID/flywheel/claude-agent:latest
```

## Step 9: Deploy Firestore Indexes

```bash
cd ..  # Back to project root
firebase deploy --only firestore:indexes --project $PROJECT_ID
```

## Step 10: Verify Deployment

```bash
# Get service URLs
cd infra/terraform
terraform output backend_service_url
terraform output claude_agent_service_url

# Test the backend
curl $(terraform output -raw backend_service_url)/health

# Test the agent (if health endpoint exists)
curl $(terraform output -raw claude_agent_service_url)/health
```

## Quick Reference: One-Command Setup

For a streamlined setup after configuring `.tfvars`:

```bash
# From infra/terraform directory
export PROJECT_ID="flywheel-etl-dev"
gcloud config set project $PROJECT_ID && \
  gcloud auth application-default login && \
  terraform init && \
  terraform apply -var-file=environments/dev.tfvars
```

This single command:

1. Sets your GCP project
2. Authenticates for Terraform
3. Initializes Terraform
4. Creates all infrastructure (with approval prompt)

## What Gets Created

| Resource               | File                          | Description                                                |
| ---------------------- | ----------------------------- | ---------------------------------------------------------- |
| **API Services**       | `services.tf`                 | 11 GCP APIs enabled explicitly                             |
| **Firebase Project**   | `firebase.tf`                 | Enables Firebase in your GCP project                       |
| **Firestore Database** | `firebase.tf`                 | Native-mode database for application data                  |
| **Firebase Web App**   | `firebase.tf`                 | Web app registration with config                           |
| **Storage Buckets**    | `storage.tf`                  | Imports, exports, e2e-test buckets with lifecycle policies |
| **Artifact Registry**  | `main.tf`                     | Docker image repository for backend/agent                  |
| **Cloud Run Services** | `cloudrun.tf`                 | Backend API + Claude Agent services                        |
| **Service Accounts**   | `cloudrun.tf`, `scheduler.tf` | Backend, Agent, Scheduler SAs with IAM                     |
| **Pub/Sub Topics**     | `pubsub.tf`                   | 15+ event topics for application events                    |
| **Cloud Scheduler**    | `scheduler.tf`                | Cron job for scheduled task triggers                       |
| **Secrets**            | `secrets.tf`                  | OAuth credentials + Anthropic API key                      |
| **IAM Bindings**       | Multiple files                | Permissions for all services                               |

## Next Steps

1. ✅ Infrastructure is provisioned via Terraform
2. ✅ Secret values added to Secret Manager
3. ✅ Initial Docker images pushed
4. Set GitLab CI/CD variables from Terraform outputs
5. Push code to `main` branch
6. GitLab CI/CD will build and deploy automatically

## Managing Multiple Environments

For production:

1. Create `flywheel-prod` project in GCP
2. Update `environments/prod.tfvars` with prod project ID
3. Run same Terraform workflow with prod vars:
   ```bash
   terraform plan -var-file=environments/prod.tfvars
   terraform apply -var-file=environments/prod.tfvars
   ```
4. Set up separate GitLab CI/CD environments for prod
5. Configure WIF for prod service accounts

## Terraform State Management

**GitLab Backend (Recommended for Teams):**

- State is stored in GitLab with HTTP backend
- CI/CD uses `CI_JOB_TOKEN` automatically
- Local development requires `TF_HTTP_PASSWORD` with GitLab personal access token (API scope)
- Backend config is passed via `-backend-config` in CI

**Local Backend (For Testing):**

```hcl
# In main.tf, replace the backend "http" block with:
terraform {
  backend "local" {
    path = "terraform.tfstate"
  }
}
```

## Troubleshooting

### API Enablement Issues

If you see errors about APIs not being enabled, wait 1-2 minutes and retry. GCP APIs take time to propagate after enablement.

### Firestore Database Already Exists

If Terraform fails because Firestore already exists, import it:

```bash
terraform import google_firestore_database.default "(default)"
```

### Cloud Run Deployment Fails

Ensure Docker images exist in Artifact Registry before first `terraform apply`. Terraform creates the service but won't fail if the image doesn't exist initially (uses lifecycle ignore).

### Secret Manager Errors

If secrets already exist, import them:

```bash
terraform import google_secret_manager_secret.google_oauth_client_id projects/$PROJECT_ID/secrets/google-oauth-client-id
terraform import google_secret_manager_secret.google_oauth_client_secret projects/$PROJECT_ID/secrets/google-oauth-client-secret
terraform import google_secret_manager_secret.anthropic_api_key projects/$PROJECT_ID/secrets/anthropic-api-key
```
