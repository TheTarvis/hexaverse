# =============================================================================
# GCP API Services
# =============================================================================
# Explicitly enable required GCP APIs for the project.
# These APIs must be enabled before their dependent resources can be created.

# Firebase API - Required for Firebase project and web app configuration
resource "google_project_service" "firebase" {
  project = var.project_id
  service = "firebase.googleapis.com"

  disable_on_destroy = false
}

# Firestore API - Required for Firestore database
resource "google_project_service" "firestore" {
  project = var.project_id
  service = "firestore.googleapis.com"

  disable_on_destroy = false
}

# Cloud Resource Manager API - Required for project-level operations
resource "google_project_service" "cloudresourcemanager" {
  project = var.project_id
  service = "cloudresourcemanager.googleapis.com"

  disable_on_destroy = false
}

# Service Usage API - Required for enabling other APIs
resource "google_project_service" "serviceusage" {
  project = var.project_id
  service = "serviceusage.googleapis.com"

  disable_on_destroy = false
}

# Artifact Registry API - Required for Docker image repositories
resource "google_project_service" "artifactregistry" {
  project = var.project_id
  service = "artifactregistry.googleapis.com"

  disable_on_destroy = false
}

# Cloud Run API - Required for Cloud Run services
resource "google_project_service" "run" {
  project = var.project_id
  service = "run.googleapis.com"

  disable_on_destroy = false
}

# Cloud Scheduler API - Required for scheduled jobs
resource "google_project_service" "cloudscheduler" {
  project = var.project_id
  service = "cloudscheduler.googleapis.com"

  disable_on_destroy = false
}

# Pub/Sub API - Required for event messaging
resource "google_project_service" "pubsub" {
  project = var.project_id
  service = "pubsub.googleapis.com"

  disable_on_destroy = false
}

# Cloud Storage API - Required for Cloud Storage buckets
resource "google_project_service" "storage" {
  project = var.project_id
  service = "storage-api.googleapis.com"

  disable_on_destroy = false
}

# IAM API - Required for service accounts and IAM bindings
resource "google_project_service" "iam" {
  project = var.project_id
  service = "iam.googleapis.com"

  disable_on_destroy = false
}

# Secret Manager API - Required for managing secrets
resource "google_project_service" "secretmanager" {
  project = var.project_id
  service = "secretmanager.googleapis.com"

  disable_on_destroy = false
}
