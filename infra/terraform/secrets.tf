# =============================================================================
# Secret Manager Secrets
# =============================================================================
# This file manages secrets in Google Secret Manager.
# Secret values are provided via Terraform variables and automatically
# stored as secret versions.

# Google OAuth Client ID
# Secret resource only - actual secret value should be added via:
# gcloud secrets versions add google-oauth-client-id --data-file=- <<< "your-value"
resource "google_secret_manager_secret" "google_oauth_client_id" {
  secret_id = "google-oauth-client-id"

  replication {
    auto {}
  }

  labels = {
    environment = var.environment
    managed_by  = "terraform"
  }

  depends_on = [google_project_service.secretmanager]
}

# Google OAuth Client Secret
# Secret resource only - actual secret value should be added via:
# gcloud secrets versions add google-oauth-client-secret --data-file=- <<< "your-value"
resource "google_secret_manager_secret" "google_oauth_client_secret" {
  secret_id = "google-oauth-client-secret"

  replication {
    auto {}
  }

  labels = {
    environment = var.environment
    managed_by  = "terraform"
  }

  depends_on = [google_project_service.secretmanager]
}

# Anthropic API Key
# Secret resource only - actual secret value should be added via:
# gcloud secrets versions add anthropic-api-key --data-file=- <<< "your-value"
resource "google_secret_manager_secret" "anthropic_api_key" {
  secret_id = "anthropic-api-key"

  replication {
    auto {}
  }

  labels = {
    environment = var.environment
    managed_by  = "terraform"
  }

  depends_on = [google_project_service.secretmanager]
}

# Resend API Key (platform-managed Hexaverse email sender)
# Secret resource only - actual secret value synced by CI/CD sync-secrets job
resource "google_secret_manager_secret" "resend_api_key" {
  secret_id = "resend-api-key"

  replication {
    auto {}
  }

  labels = {
    environment = var.environment
    managed_by  = "terraform"
  }

  depends_on = [google_project_service.secretmanager]
}

# Stripe Secret Key
# Secret resource only - actual secret value synced by CI/CD sync-secrets job
resource "google_secret_manager_secret" "stripe_secret_key" {
  secret_id = "stripe-secret-key"

  replication {
    auto {}
  }

  labels = {
    environment = var.environment
    managed_by  = "terraform"
  }

  depends_on = [google_project_service.secretmanager]
}

# Stripe Webhook Secret
# Secret resource only - actual secret value synced by CI/CD sync-secrets job
resource "google_secret_manager_secret" "stripe_webhook_secret" {
  secret_id = "stripe-webhook-secret"

  replication {
    auto {}
  }

  labels = {
    environment = var.environment
    managed_by  = "terraform"
  }

  depends_on = [google_project_service.secretmanager]
}

# Stripe Pro Monthly Price ID
# Secret resource only - actual secret value synced by CI/CD sync-secrets job
resource "google_secret_manager_secret" "stripe_pro_monthly_price_id" {
  secret_id = "stripe-pro-monthly-price-id"

  replication {
    auto {}
  }

  labels = {
    environment = var.environment
    managed_by  = "terraform"
  }

  depends_on = [google_project_service.secretmanager]
}

# Stripe Pro Annual Price ID
# Secret resource only - actual secret value synced by CI/CD sync-secrets job
resource "google_secret_manager_secret" "stripe_pro_annual_price_id" {
  secret_id = "stripe-pro-annual-price-id"

  replication {
    auto {}
  }

  labels = {
    environment = var.environment
    managed_by  = "terraform"
  }

  depends_on = [google_project_service.secretmanager]
}

# =============================================================================
# Secret Versions
# =============================================================================
# Values come from TF_VAR_ environment variables set in GitLab CI/CD.
# lifecycle { ignore_changes } ensures Terraform only creates the version once.
# To rotate: update the GitLab variable, then taint the resource to force recreation.

resource "google_secret_manager_secret_version" "google_oauth_client_id_initial" {
  secret      = google_secret_manager_secret.google_oauth_client_id.id
  secret_data = var.google_oauth_client_id != null ? var.google_oauth_client_id : "placeholder"
  lifecycle { ignore_changes = [secret_data] }
}

resource "google_secret_manager_secret_version" "google_oauth_client_secret_initial" {
  secret      = google_secret_manager_secret.google_oauth_client_secret.id
  secret_data = var.google_oauth_client_secret != null ? var.google_oauth_client_secret : "placeholder"
  lifecycle { ignore_changes = [secret_data] }
}

resource "google_secret_manager_secret_version" "anthropic_api_key_initial" {
  secret      = google_secret_manager_secret.anthropic_api_key.id
  secret_data = var.anthropic_api_key
  lifecycle { ignore_changes = [secret_data] }
}

resource "google_secret_manager_secret_version" "resend_api_key_initial" {
  secret      = google_secret_manager_secret.resend_api_key.id
  secret_data = var.resend_api_key
  lifecycle { ignore_changes = [secret_data] }
}

resource "google_secret_manager_secret_version" "stripe_secret_key_initial" {
  secret      = google_secret_manager_secret.stripe_secret_key.id
  secret_data = var.stripe_secret_key
  lifecycle { ignore_changes = [secret_data] }
}

resource "google_secret_manager_secret_version" "stripe_webhook_secret_initial" {
  secret      = google_secret_manager_secret.stripe_webhook_secret.id
  secret_data = var.stripe_webhook_secret
  lifecycle { ignore_changes = [secret_data] }
}

resource "google_secret_manager_secret_version" "stripe_pro_monthly_price_id_initial" {
  secret      = google_secret_manager_secret.stripe_pro_monthly_price_id.id
  secret_data = var.stripe_pro_monthly_price_id
  lifecycle { ignore_changes = [secret_data] }
}

resource "google_secret_manager_secret_version" "stripe_pro_annual_price_id_initial" {
  secret      = google_secret_manager_secret.stripe_pro_annual_price_id.id
  secret_data = var.stripe_pro_annual_price_id
  lifecycle { ignore_changes = [secret_data] }
}
# =============================================================================
# Secret Access Permissions
# =============================================================================
# Grant backend service account access to read these secrets

resource "google_secret_manager_secret_iam_member" "backend_oauth_client_id" {
  secret_id = google_secret_manager_secret.google_oauth_client_id.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.backend.email}"
}

resource "google_secret_manager_secret_iam_member" "backend_oauth_client_secret" {
  secret_id = google_secret_manager_secret.google_oauth_client_secret.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.backend.email}"
}

resource "google_secret_manager_secret_iam_member" "backend_anthropic_api_key" {
  secret_id = google_secret_manager_secret.anthropic_api_key.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.backend.email}"
}

resource "google_secret_manager_secret_iam_member" "backend_resend_api_key" {
  secret_id = google_secret_manager_secret.resend_api_key.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.backend.email}"
}

# Grant Claude Agent service account access to read Anthropic API key
resource "google_secret_manager_secret_iam_member" "claude_agent_anthropic_api_key" {
  secret_id = google_secret_manager_secret.anthropic_api_key.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.claude_agent.email}"
}

resource "google_secret_manager_secret_iam_member" "backend_stripe_secret_key" {
  secret_id = google_secret_manager_secret.stripe_secret_key.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.backend.email}"
}

resource "google_secret_manager_secret_iam_member" "backend_stripe_webhook_secret" {
  secret_id = google_secret_manager_secret.stripe_webhook_secret.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.backend.email}"
}

resource "google_secret_manager_secret_iam_member" "backend_stripe_pro_monthly_price_id" {
  secret_id = google_secret_manager_secret.stripe_pro_monthly_price_id.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.backend.email}"
}

resource "google_secret_manager_secret_iam_member" "backend_stripe_pro_annual_price_id" {
  secret_id = google_secret_manager_secret.stripe_pro_annual_price_id.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.backend.email}"
}
