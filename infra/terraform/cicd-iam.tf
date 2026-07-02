# =============================================================================
# GitLab CI/CD IAM Permissions
# =============================================================================
# This file manages IAM permissions for GitLab CI/CD.
#
# IMPORTANT: WIF and Service Account are managed by gitlab_wif_setup.sh
# - WIF Pool: gitlab-pool (created by script)
# - WIF Provider: gitlab-provider (created by script)
# - Service Account: gitlab-ci-deployer@{project}.iam.gserviceaccount.com (created by script)
#
# This file ONLY manages additional IAM bindings needed for CI/CD operations.
# See: docs/gitlab/gitlab_wif_setup.sh

# Reference the existing service account created by gitlab_wif_setup.sh
data "google_service_account" "gitlab_ci" {
  account_id = "gitlab-ci-deployer"
}

# =============================================================================
# Cloud Run Permissions
# =============================================================================

# Allow CI to deploy Cloud Run services
resource "google_project_iam_member" "ci_cloudrun_admin" {
  project = var.project_id
  role    = "roles/run.admin"
  member  = "serviceAccount:${data.google_service_account.gitlab_ci.email}"
}

# Allow CI to act as Cloud Run runtime service accounts
# Required to deploy services that use custom service accounts
resource "google_project_iam_member" "ci_service_account_user" {
  project = var.project_id
  role    = "roles/iam.serviceAccountUser"
  member  = "serviceAccount:${data.google_service_account.gitlab_ci.email}"
}

# =============================================================================
# Storage Permissions (for Artifact Registry and Cloud Storage)
# =============================================================================

# Artifact Registry access is managed in main.tf via repository-level IAM

# Allow CI to access Cloud Storage (for build artifacts, logs, etc.)
resource "google_project_iam_member" "ci_storage_admin" {
  project = var.project_id
  role    = "roles/storage.admin"
  member  = "serviceAccount:${data.google_service_account.gitlab_ci.email}"
}

# =============================================================================
# Terraform State Management Permissions
# =============================================================================
# Note: Terraform state is stored in GitLab, not GCS
# These permissions are for managing GCP resources via Terraform

# Allow CI to view project resources
resource "google_project_iam_member" "ci_viewer" {
  project = var.project_id
  role    = "roles/viewer"
  member  = "serviceAccount:${data.google_service_account.gitlab_ci.email}"
}

# =============================================================================
# Secret Manager Permissions (Optional - for builds that need secrets)
# =============================================================================

# Allow CI to access secrets during builds (if needed)
# Currently secrets are passed via GitLab CI/CD variables, not Secret Manager
# Uncomment if you want CI to read secrets directly from Secret Manager
# resource "google_project_iam_member" "ci_secret_accessor" {
#   project = var.project_id
#   role    = "roles/secretmanager.secretAccessor"
#   member  = "serviceAccount:${google_service_account.gitlab_ci.email}"
# }

# =============================================================================
# Workload Identity Federation (WIF)
# =============================================================================
# NOTE: WIF pool, provider, and service account are managed by gitlab_wif_setup.sh
# - Pool: projects/255694242424/locations/global/workloadIdentityPools/gitlab-pool
# - Provider: gitlab-provider
# - Service Account: gitlab-ci-deployer@{project}.iam.gserviceaccount.com
#
# The script handles:
# - Initial WIF pool/provider creation
# - Service account creation
# - workloadIdentityUser IAM binding
# - Initial project-level permissions
#
# This Terraform file only manages ADDITIONAL IAM bindings for specific resources
# (Artifact Registry, Cloud Run, Storage, etc.)
#
# See: docs/gitlab/gitlab_wif_setup.sh for WIF setup

# =============================================================================
# Outputs for GitLab CI/CD Configuration
# =============================================================================

output "gitlab_ci_service_account_email" {
  description = "Email of the GitLab CI service account (created by gitlab_wif_setup.sh)"
  value       = data.google_service_account.gitlab_ci.email
}
