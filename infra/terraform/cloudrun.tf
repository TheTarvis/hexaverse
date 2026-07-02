# =============================================================================
# Cloud Run Service (v2)
# =============================================================================
# This file manages the Cloud Run service for the backend API.
# Uses v2 API with invoker_iam_disabled for public access (bypasses org policy).

resource "google_cloud_run_v2_service" "backend" {
  name     = "{{PROJECT_SLUG}}-backend"
  location = var.region

  # Disable IAM invoker check - makes service publicly accessible
  # This bypasses org policy restrictions on allUsers
  invoker_iam_disabled = true

  # Allow Terraform to destroy this service
  deletion_protection = false

  template {
    service_account = google_service_account.backend.email
    timeout         = "900s" # 15 min — covers pipeline-node-worker (10 min ack deadline) + margin

    scaling {
      min_instance_count = 0
      max_instance_count = 10
    }

    containers {
      # Initial image - will be updated by CI/CD
      image = "us-docker.pkg.dev/cloudrun/container/hello"

      env {
        name  = "FIREBASE_PROJECT_ID"
        value = var.project_id
      }

      env {
        name  = "GCP_PROJECT_ID"
        value = var.project_id
      }

      env {
        name  = "ENV"
        value = upper(var.environment)
      }

      env {
        name  = "FRONTEND_URL"
        value = "https://www.{{PROD_DOMAIN}}"
      }

      # OAuth secrets - mounted from Secret Manager
      env {
        name = "GOOGLE_OAUTH_CLIENT_ID"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.google_oauth_client_id.secret_id
            version = "latest"
          }
        }
      }

      env {
        name = "GOOGLE_OAUTH_CLIENT_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.google_oauth_client_secret.secret_id
            version = "latest"
          }
        }
      }

      env {
        name = "ANTHROPIC_API_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.anthropic_api_key.secret_id
            version = "latest"
          }
        }
      }

      # Resend API Key (platform-managed {{PROJECT_NAME}} email sender)
      env {
        name = "RESEND_API_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.resend_api_key.secret_id
            version = "latest"
          }
        }
      }

      # From address used by the platform-managed email provider
      env {
        name  = "FLYWHEEL_EMAIL_SENDER"
        value = var.email_sender
      }

      # Stripe secrets - mounted from Secret Manager
      env {
        name = "STRIPE_SECRET_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.stripe_secret_key.secret_id
            version = "latest"
          }
        }
      }

      env {
        name = "STRIPE_WEBHOOK_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.stripe_webhook_secret.secret_id
            version = "latest"
          }
        }
      }

      env {
        name = "STRIPE_PRO_MONTHLY_PRICE_ID"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.stripe_pro_monthly_price_id.secret_id
            version = "latest"
          }
        }
      }

      env {
        name = "STRIPE_PRO_ANNUAL_PRICE_ID"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.stripe_pro_annual_price_id.secret_id
            version = "latest"
          }
        }
      }

      # Managed import bucket for signed URL uploads
      env {
        name  = "IMPORT_BUCKET"
        value = google_storage_bucket.import_files.name
      }

      # Internal pipeline artifacts bucket (chunks, intermediate documents)
      env {
        name  = "PIPELINE_ARTIFACTS_BUCKET"
        value = google_storage_bucket.pipeline_artifacts.name
      }

      # Managed export bucket for user file downloads
      env {
        name  = "EXPORT_BUCKET"
        value = google_storage_bucket.export_files.name
      }

      # Service account for signing GCS URLs
      env {
        name  = "GCS_SIGNING_SA"
        value = google_service_account.backend.email
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        cpu_idle = true
      }

      ports {
        container_port = 8080
      }

      startup_probe {
        http_get {
          path = "/healthcheck"
          port = 8080
        }
        initial_delay_seconds = 5
        timeout_seconds       = 5
        period_seconds        = 10
        failure_threshold     = 6
      }
    }
  }

  traffic {
    percent = 100
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
  }

  # Prevent Terraform from reverting changes made by CI/CD (gcloud deploys)
  lifecycle {
    ignore_changes = [
      template[0].containers[0].image,
      client,
      client_version,
    ]
  }

  depends_on = [
    google_project_service.run,
    google_artifact_registry_repository.backend,
    google_service_account.backend,
    google_secret_manager_secret_version.google_oauth_client_id_initial,
    google_secret_manager_secret_version.google_oauth_client_secret_initial,
    google_secret_manager_secret_version.anthropic_api_key_initial,
    google_secret_manager_secret_version.stripe_secret_key_initial,
    google_secret_manager_secret_version.stripe_webhook_secret_initial,
    google_secret_manager_secret_version.stripe_pro_monthly_price_id_initial,
    google_secret_manager_secret_version.stripe_pro_annual_price_id_initial,
    google_storage_bucket.import_files,
    google_storage_bucket.pipeline_artifacts,
    google_storage_bucket.export_files,
  ]
}

# =============================================================================
# Backend Service Account
# =============================================================================

resource "google_service_account" "backend" {
  account_id   = "{{PROJECT_SLUG}}-backend"
  display_name = "{{PROJECT_NAME}} Backend Service Account"
  description  = "Service account for {{PROJECT_NAME}} Cloud Run backend"

  depends_on = [google_project_service.iam]
}

# Grant backend service account permissions to access Firestore
resource "google_project_iam_member" "backend_firestore" {
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.backend.email}"
}

# Grant backend service account permissions to access Pub/Sub
# Editor role includes: create/delete topics and subscriptions, publish, subscribe
resource "google_project_iam_member" "backend_pubsub" {
  project = var.project_id
  role    = "roles/pubsub.editor"
  member  = "serviceAccount:${google_service_account.backend.email}"
}

# Grant backend service account permissions to access Cloud Storage
resource "google_project_iam_member" "backend_storage" {
  project = var.project_id
  role    = "roles/storage.objectAdmin"
  member  = "serviceAccount:${google_service_account.backend.email}"
}

# Grant backend service account permissions to manage Secret Manager
# Admin role is needed for:
# - Reading secrets (OAuth credentials, connection tokens)
# - Creating secrets (OAuth app seed, connection token storage)
# - Updating secrets (token refresh, credential rotation)
resource "google_project_iam_member" "backend_secret_admin" {
  project = var.project_id
  role    = "roles/secretmanager.admin"
  member  = "serviceAccount:${google_service_account.backend.email}"
}

# Grant backend service account permission to sign URLs
# This allows the backend to generate V4 signed URLs for direct GCS uploads
# The service account signs URLs for itself (self-impersonation)
resource "google_service_account_iam_member" "backend_self_token_creator" {
  service_account_id = google_service_account.backend.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:${google_service_account.backend.email}"
}

# =============================================================================
# Claude Agent Service
# =============================================================================
# This manages the Cloud Run service for the Claude Agent API.
# The agent service handles AI-powered chat interactions using the Anthropic API.

resource "google_cloud_run_v2_service" "claude_agent" {
  name     = "claude-agent-service"
  location = var.region

  # Disable IAM invoker check - makes service publicly accessible
  # This bypasses org policy restrictions on allUsers
  invoker_iam_disabled = true

  # Allow Terraform to destroy this service
  deletion_protection = false

  template {
    service_account = google_service_account.claude_agent.email
    timeout         = "300s" # 5 min for long agent operations

    scaling {
      min_instance_count = 0
      max_instance_count = 10
    }

    containers {
      # Initial image - will be updated by CI/CD
      image = "us-docker.pkg.dev/cloudrun/container/hello"

      env {
        name  = "FIREBASE_PROJECT_ID"
        value = var.project_id
      }

      env {
        name  = "GCP_PROJECT_ID"
        value = var.project_id
      }

      env {
        name  = "ENVIRONMENT"
        value = var.environment
      }

      # Backend API URL — tools call the Go backend with the user's
      # Firebase token attached as a Bearer header (token passthrough).
      env {
        name  = "BACKEND_API_URL"
        value = google_cloud_run_v2_service.backend.uri
      }

      # Allowed CORS origins for /chat. Comma-separated. Includes localhost
      # so dev frontends running on :3000 can talk to the deployed agent
      # service while iterating, plus both apex and www of the public domain.
      env {
        name  = "CORS_ALLOWED_ORIGINS"
        value = "http://localhost:3000,https://www.{{PROD_DOMAIN}},https://{{PROD_DOMAIN}}"
      }

      # Anthropic API Key - mounted from Secret Manager
      env {
        name = "ANTHROPIC_API_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.anthropic_api_key.secret_id
            version = "latest"
          }
        }
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        cpu_idle = true
      }

      ports {
        container_port = 8080
      }

      startup_probe {
        http_get {
          path = "/health"
          port = 8080
        }
        initial_delay_seconds = 5
        timeout_seconds       = 5
        period_seconds        = 10
        failure_threshold     = 6
      }
    }
  }

  traffic {
    percent = 100
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
  }

  # Prevent Terraform from reverting changes made by CI/CD (gcloud deploys)
  lifecycle {
    ignore_changes = [
      template[0].containers[0].image,
      client,
      client_version,
    ]
  }

  depends_on = [
    google_project_service.run,
    google_artifact_registry_repository.backend,
    google_service_account.claude_agent,
    google_secret_manager_secret.anthropic_api_key,
    google_cloud_run_v2_service.backend,
  ]
}

# =============================================================================
# Claude Agent Service Account
# =============================================================================

resource "google_service_account" "claude_agent" {
  account_id   = "claude-agent-service"
  display_name = "Claude Agent Service Account"
  description  = "Service account for Claude Agent Cloud Run service"

  depends_on = [google_project_service.iam]
}

# Note: the agent does NOT need run.invoker on the backend. It calls the
# backend over HTTPS with the user's Firebase token attached (token
# passthrough), and the backend has invoker_iam_disabled=true. Service-to-
# service OIDC is unused.
