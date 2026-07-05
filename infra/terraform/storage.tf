# =============================================================================
# Cloud Storage Buckets
# =============================================================================
# This file manages GCS buckets for Hexaverse.
#
# Buckets:
# - hexaverse-imports-{env}: User file uploads (7-day retention prod, 1-day retention dev)
# - hexaverse-exports-{env}: User file downloads/exports (7-day retention prod, 1-day retention dev)
# - hexaverse-pipelines-{env}: Internal pipeline artifacts - chunks, documents (1-day retention)

# -----------------------------------------------------------------------------
# Managed Import Bucket
# -----------------------------------------------------------------------------
# Bucket for file uploads via signed URLs. Files are uploaded directly from
# the browser to GCS, then read by the GCS provider during import execution.
#
# Security:
# - uniform_bucket_level_access: IAM-only access control (no ACLs)
# - Service account has objectAdmin via google_project_iam_member.backend_storage
#
# Lifecycle:
# - Dev: Files auto-delete after 1 day (faster cleanup for development)
# - Prod: Files auto-delete after 7 days (handles orphaned uploads)

resource "google_storage_bucket" "import_files" {
  name     = "hexaverse-imports-${var.environment}"
  location = var.region
  project  = var.project_id

  # Enforce uniform IAM access (no object ACLs)
  uniform_bucket_level_access = true

  # Auto-delete files based on environment
  # Dev: 1 day (faster cleanup), Prod: 7 days (user grace period)
  lifecycle_rule {
    condition {
      age = var.environment == "dev" ? 1 : 7
    }
    action {
      type = "Delete"
    }
  }

  # CORS configuration for direct browser uploads
  # Allows PUT requests from the frontend to upload files directly to GCS
  cors {
    origin          = ["https://www.hexaverse.io", "https://hexaverse-dev.vercel.app", "http://localhost:3000"]
    method          = ["PUT", "GET", "HEAD", "OPTIONS"]
    response_header = ["Content-Type", "Content-Length", "ETag", "Content-MD5"]
    max_age_seconds = 3600
  }

  # Prevent accidental deletion of bucket
  force_destroy = false

  depends_on = [google_project_service.storage]
}

# -----------------------------------------------------------------------------
# CI Service Account Access to Dev Bucket (for e2e tests)
# -----------------------------------------------------------------------------
# The CI service account from prod project needs access to dev bucket for e2e tests.
# This binding is only created in the dev environment.

resource "google_storage_bucket_iam_member" "ci_import_bucket_access" {
  count  = var.environment == "dev" ? 1 : 0
  bucket = google_storage_bucket.import_files.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:gitlab-ci-deployer@hexaverse.iam.gserviceaccount.com"
}

# -----------------------------------------------------------------------------
# Managed Export Bucket
# -----------------------------------------------------------------------------
# Bucket for export files. Exports write directly to GCS, then get zipped
# for user download via signed URLs.
#
# Security:
# - uniform_bucket_level_access: IAM-only access control (no ACLs)
# - Service account has objectAdmin via google_project_iam_member.backend_storage
#
# Lifecycle:
# - Dev: Files auto-delete after 1 day (faster cleanup for development)
# - Prod: Files auto-delete after 7 days (users should download promptly)

resource "google_storage_bucket" "export_files" {
  name     = "hexaverse-exports-${var.environment}"
  location = var.region
  project  = var.project_id

  # Enforce uniform IAM access (no object ACLs)
  uniform_bucket_level_access = true

  # Auto-delete files based on environment
  # Dev: 1 day (faster cleanup), Prod: 7 days (user grace period)
  lifecycle_rule {
    condition {
      age = var.environment == "dev" ? 1 : 7
    }
    action {
      type = "Delete"
    }
  }

  # CORS configuration for direct browser downloads
  # Allows GET requests from the frontend to download files directly from GCS
  cors {
    origin          = ["https://www.hexaverse.io", "https://hexaverse-dev.vercel.app", "http://localhost:3000"]
    method          = ["GET", "HEAD", "OPTIONS"]
    response_header = ["Content-Type", "Content-Length", "Content-Disposition"]
    max_age_seconds = 3600
  }

  # Prevent accidental deletion of bucket
  force_destroy = false

  depends_on = [google_project_service.storage]
}

# -----------------------------------------------------------------------------
# Pipeline Artifacts Bucket
# -----------------------------------------------------------------------------
# Bucket for internal pipeline execution artifacts (chunks, intermediate documents).
# Never exposed to users - purely internal implementation details.
#
# Contents:
# - JSONL chunks passed between pipeline nodes
# - Documents fetched from sources (PDFs from Google Drive, etc.)
# - Temporary data during pipeline execution
#
# Security:
# - uniform_bucket_level_access: IAM-only access control (no ACLs)
# - No CORS needed - internal access only
# - Service account has objectAdmin via google_project_iam_member.backend_storage
#
# Lifecycle:
# - Aggressive cleanup: 1 day retention in all environments
# - Artifacts are ephemeral cache - no need to keep long-term

resource "google_storage_bucket" "pipeline_artifacts" {
  name     = "hexaverse-pipelines-${var.environment}"
  location = var.region
  project  = var.project_id

  # Enforce uniform IAM access (no object ACLs)
  uniform_bucket_level_access = true

  # Auto-delete files after 1 day in all environments
  # Pipeline artifacts are ephemeral cache - aggressive cleanup
  lifecycle_rule {
    condition {
      age = 1
    }
    action {
      type = "Delete"
    }
  }

  # No CORS - internal access only (not exposed to browser)

  # Prevent accidental deletion of bucket
  force_destroy = false

  depends_on = [google_project_service.storage]
}

# CI Service Account access to pipeline artifacts bucket (for e2e tests)
resource "google_storage_bucket_iam_member" "ci_pipeline_artifacts_bucket_access" {
  count  = var.environment == "dev" ? 1 : 0
  bucket = google_storage_bucket.pipeline_artifacts.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:gitlab-ci-deployer@hexaverse.iam.gserviceaccount.com"
}
