terraform {
  required_version = ">= 1.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 7.18.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 7.18.0"
    }
    vercel = {
      source  = "vercel/vercel"
      version = "~> 3.0"
    }
  }

  # GitLab-managed Terraform state
  # State is stored securely in GitLab with encryption
  # CI/CD uses CI_JOB_TOKEN for authentication (automatic)
  # Local development requires TF_HTTP_PASSWORD with personal access token (API scope)
  # Note: address, lock_address, and unlock_address are passed via -backend-config in CI
  backend "http" {
    username       = "gitlab-ci-token"
    lock_method    = "POST"
    unlock_method  = "DELETE"
    retry_wait_min = 5
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
}

# Vercel provider for frontend deployment configuration
# NOTE: Vercel integration is REQUIRED. Set VERCEL_API_TOKEN in GitLab CI/CD variables.
# If you don't want Vercel integration, comment out this provider block and vercel.tf
provider "vercel" {
  api_token = var.vercel_api_token
  team      = "large-coffee-studios"
}

# =============================================================================
# Artifact Registry
# =============================================================================

# {{PROJECT_NAME}} backend Docker repository
# Note: Previously imported from manually-created repository
resource "google_artifact_registry_repository" "backend" {
  location      = var.region
  repository_id = "{{PROJECT_SLUG}}"
  format        = "DOCKER"
  description   = "Docker images for {{PROJECT_NAME}} backend"

  cleanup_policies {
    id     = "keep-recent-images"
    action = "KEEP"

    most_recent_versions {
      keep_count = 3
    }
  }

  depends_on = [google_project_service.artifactregistry]
}

# =============================================================================
# Artifact Registry IAM - CI/CD Access
# =============================================================================
# Note: GitLab CI service account is created by docs/gitlab/gitlab_wif_setup.sh
# We reference it here and grant it access to Artifact Registry

# Reference the existing GitLab CI service account
# Created by: docs/gitlab/gitlab_wif_setup.sh
data "google_service_account" "gitlab_ci_main" {
  account_id = "gitlab-ci-deployer"
}

# Grant CI service account write access to Artifact Registry
resource "google_artifact_registry_repository_iam_member" "ci_writer" {
  project    = var.project_id
  location   = google_artifact_registry_repository.backend.location
  repository = google_artifact_registry_repository.backend.name
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${data.google_service_account.gitlab_ci_main.email}"
}

# Cross-project access: Allow prod CI to read from dev registry (for image promotion)
# This binding is only created in the dev environment
resource "google_artifact_registry_repository_iam_member" "prod_ci_reader" {
  count      = var.environment == "dev" ? 1 : 0
  project    = var.project_id
  location   = google_artifact_registry_repository.backend.location
  repository = google_artifact_registry_repository.backend.name
  role       = "roles/artifactregistry.reader"
  member     = "serviceAccount:gitlab-ci-deployer@{{PROJECT_SLUG}}-etl-prod.iam.gserviceaccount.com"
}
