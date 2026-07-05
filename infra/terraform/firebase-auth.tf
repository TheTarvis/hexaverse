# =============================================================================
# Firebase Authentication (Identity Platform)
# =============================================================================
# This file configures Firebase Authentication including OAuth providers
# and authorized domains for authentication flows_old.

# Enable Firebase Authentication (Identity Platform)
resource "google_identity_platform_config" "default" {
  provider = google-beta
  project  = var.project_id

  # Sign-in options
  sign_in {
    allow_duplicate_emails = false

    # Enable email/password and Google OAuth
    email {
      enabled           = true
      password_required = true
    }
  }

  # Authorized domains for OAuth redirects
  # These domains are allowed to initiate OAuth flows_old
  authorized_domains = [
    "${var.project_id}.firebaseapp.com",
    "${var.project_id}.web.app",
    "localhost",
    "hexaverse.io",
    "www.hexaverse.io",
    "${var.vercel_project_name}.vercel.app",
    "${var.vercel_project_name}-large-coffee-studios.vercel.app"
  ]

  depends_on = [google_firebase_project.default]
}

# Configure Google as an OAuth provider
# Note: This requires you to set up OAuth credentials in Google Cloud Console
# and provide the client ID and secret via terraform.tfvars or environment variables
# This resource is only created when both google_oauth_client_id and google_oauth_client_secret are provided
resource "google_identity_platform_default_supported_idp_config" "google" {
  count         = var.google_oauth_client_id != null && var.google_oauth_client_secret != null ? 1 : 0
  provider      = google-beta
  project       = var.project_id
  idp_id        = "google.com"
  client_id     = var.google_oauth_client_id
  client_secret = var.google_oauth_client_secret
  enabled       = true

  depends_on = [google_identity_platform_config.default]
}