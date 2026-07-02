# Flywheel GCP Infrastructure

Terraform configuration for Flywheel's GCP infrastructure.

## 🚀 Quick Start (New Project)

If you're starting from scratch with a new GCP project:

```bash
./bootstrap.sh <project-id> <environment>
```

This will create everything you need: Firebase, Cloud Run, Pub/Sub, Scheduler, and output all the config values for GitHub.

**See [BOOTSTRAP.md](./BOOTSTRAP.md) for detailed instructions.**

## 📋 What Gets Created

- ✅ **Firebase** - Project, web app, and configuration
- ✅ **Cloud Run** - Backend API service with auto-scaling
- ✅ **Artifact Registry** - Docker image repository
- ✅ **Pub/Sub Topics** - 15+ event topics for the application
- ✅ **Cloud Scheduler** - Cron jobs for scheduled tasks
- ✅ **Service Accounts** - With least-privilege IAM permissions
- ✅ **Cloud Storage** - Firebase default bucket

## Prerequisites

1. [Terraform](https://www.terraform.io/downloads) >= 1.6
2. [Google Cloud SDK](https://cloud.google.com/sdk/docs/install)
3. GCP Project with billing enabled

## Usage

### First Time Setup

See [BOOTSTRAP.md](./BOOTSTRAP.md) for complete instructions on:
- Enabling required GCP APIs
- Creating Firebase project
- Running Terraform
- Getting output values for GitHub Secrets

### Regular Updates

```bash
cd infra/terraform-gcp

# Initialize
terraform init

# Plan changes
terraform plan -var-file=environments/dev.tfvars

# Apply changes
terraform apply -var-file=environments/dev.tfvars
```

## Configuration

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `project_id` | GCP Project ID | - | ✅ |
| `region` | GCP region for resources | `us-central1` | ❌ |
| `environment` | Environment name (dev/prod) | `dev` | ❌ |
| `scheduler_timezone` | Timezone for Cloud Scheduler | `UTC` | ❌ |
| `api_service_url` | Cloud Run service URL | `""` | ❌ |

### Environment Files

- `environments/dev.tfvars` - Development configuration
- `environments/prod.tfvars` - Production configuration

## Outputs

After applying Terraform, you can get configuration values:

```bash
# Get all Firebase config
terraform output -json firebase_config

# Get individual values
terraform output firebase_api_key
terraform output backend_service_url
terraform output docker_image_base
```

These outputs are needed for:
- GitHub Actions secrets/variables
- Frontend environment configuration
- Backend deployment

## Resources Managed

### Firebase
- `google_firebase_project` - Firebase project initialization
- `google_firebase_web_app` - Web app registration
- `google_storage_bucket` - Firebase default storage bucket

### Cloud Run
- `google_cloud_run_service` - Backend API service
- `google_service_account` - Backend service account
- IAM bindings for Firestore, Pub/Sub, and Storage

### Pub/Sub Topics
- Core entity events: `organization-events`, `member-events`, `role-events`, `schema-events`
- Data events: `entity-events`, `datarecord-events`, `composite-entity-events`
- Integration events: `source-events`, `sync-events`, `template-events`
- Import/Export: `import-events`, `export-events`
- OAuth: `oauth-events`
- Permissions: `permission-events`
- Scheduler: `schedule-trigger`

### Cloud Scheduler
- `schedule-trigger` - Runs every minute to process scheduled tasks

### Artifact Registry
- Docker repository for backend images

## Architecture

```
Cloud Scheduler (every minute)
    ↓
Pub/Sub "schedule-trigger"
    ↓
Backend subscription handler
    ↓
Queries Firestore for due schedules
    ↓
Publishes to import/export topics
    ↓
Handlers process jobs
```

## CI/CD Integration

This Terraform configuration is integrated with GitHub Actions:

1. **Terraform Plan** - Runs on every push to main
2. **Manual Approval** - Required before applying changes
3. **Terraform Apply** - Creates/updates infrastructure
4. **Backend Deploy** - Deploys after infrastructure is ready

See [.github/TERRAFORM_SETUP.md](../../.github/TERRAFORM_SETUP.md) for CI/CD details.

## State Management

Currently using local state. To enable remote state:

1. Create GCS bucket for state:
```bash
gsutil mb gs://flywheel-terraform-state
```

2. Uncomment the backend block in `main.tf`:
```hcl
backend "gcs" {
  bucket = "flywheel-terraform-state"
  prefix = "gcp"
}
```

3. Run `terraform init -migrate-state`

## Multi-Environment

To manage multiple environments (dev, prod):

1. Create separate GCP projects
2. Update `environments/*.tfvars` with project IDs
3. Apply with appropriate var file:
```bash
terraform apply -var-file=environments/prod.tfvars
```

## Troubleshooting

**Firebase API not enabled:**
```bash
gcloud services enable firebase.googleapis.com
```

**Firestore database required:**
```bash
gcloud firestore databases create --location=us-central1 --type=firestore-native
```

**Permission denied:**
Ensure your user or service account has:
- `roles/firebase.admin`
- `roles/run.admin`
- `roles/iam.serviceAccountUser`

## Notes

- Backend creates Pub/Sub subscriptions dynamically at runtime
- Cloud Scheduler uses dedicated service account with minimal permissions
- Cloud Run service ignores image updates from Terraform (managed by CI/CD)
- Firebase configuration is sensitive - outputs are marked accordingly
