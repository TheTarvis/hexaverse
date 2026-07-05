variable "project_id" {
  description = "GCP Project ID"
  type        = string
}

variable "region" {
  description = "GCP region for resources"
  type        = string
  default     = "us-central1"
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "scheduler_timezone" {
  description = "Timezone for Cloud Scheduler jobs"
  type        = string
  default     = "UTC"
}

variable "vercel_project_name" {
  description = "Name of the Vercel project for frontend deployment"
  type        = string
  default     = "hexaverse"
}

variable "vercel_api_token" {
  description = "Vercel API token for Terraform provider authentication. Set in GitLab CI/CD variables as VERCEL_API_TOKEN. If not provided, a dummy token will be used (Vercel resources will fail to create)."
  type        = string
  sensitive   = true
  default     = "000000000000000000000000"
}

variable "google_oauth_client_id" {
  description = "Google OAuth 2.0 client ID for Firebase Authentication. Required for firebase-auth.tf."
  type        = string
  sensitive   = true
  default     = null
}

variable "google_oauth_client_secret" {
  description = "Google OAuth 2.0 client secret for Firebase Authentication. Required for firebase-auth.tf."
  type        = string
  sensitive   = true
  default     = null
}

variable "stripe_publishable_key" {
  description = "Stripe publishable key for frontend checkout integration"
  type        = string
  default     = ""
}

# =============================================================================
# Secret Manager values — set via TF_VAR_ env vars in GitLab CI/CD
# =============================================================================
# These feed into google_secret_manager_secret_version resources.
# Terraform creates the initial version; lifecycle { ignore_changes } prevents
# subsequent applies from overwriting them. To rotate a secret, update the
# GitLab CI/CD variable and either:
#   - taint the version resource: terraform taint google_secret_manager_secret_version.X
#   - or add a new version manually: gcloud secrets versions add ...

variable "anthropic_api_key" {
  description = "Anthropic API key for Claude agent service"
  type        = string
  sensitive   = true
  default     = "placeholder"
}

variable "resend_api_key" {
  description = "Resend API key for the platform-managed Hexaverse email sender"
  type        = string
  sensitive   = true
  default     = "placeholder"
}

variable "email_sender" {
  description = "From address used by the platform-managed email provider (e.g. \"Hexaverse <pipelines@hexaverse.io>\")"
  type        = string
  default     = "Hexaverse <pipelines@hexaverse.io>"
}

variable "stripe_secret_key" {
  description = "Stripe secret key for payment processing"
  type        = string
  sensitive   = true
  default     = "placeholder"
}

variable "stripe_webhook_secret" {
  description = "Stripe webhook signing secret"
  type        = string
  sensitive   = true
  default     = "placeholder"
}

variable "stripe_pro_monthly_price_id" {
  description = "Stripe Price ID for Pro monthly plan"
  type        = string
  sensitive   = true
  default     = "placeholder"
}

variable "stripe_pro_annual_price_id" {
  description = "Stripe Price ID for Pro annual plan"
  type        = string
  sensitive   = true
  default     = "placeholder"
}

variable "production_auth_domain" {
  description = "Custom domain for production Firebase Auth (e.g., www.hexaverse.io)"
  type        = string
  default     = "www.hexaverse.io"
}
