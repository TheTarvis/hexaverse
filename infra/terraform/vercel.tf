
# =============================================================================
# Vercel Frontend Configuration
# =============================================================================
# Manages Vercel project environment variables, automatically syncing
# Firebase configuration and backend API URL from GCP infrastructure.
#
# Benefits:
# - Single source of truth for configuration
# - Automatic sync when GCP resources change
# - Version controlled infrastructure
# - No manual environment variable updates needed
#
# Known Issues:
# - Frontend Build needs these values. Requires manual trigger first time.
#
# See: docs/vercel/terraform_integration.md

# Reference existing Vercel project
data "vercel_project" "frontend" {
  name = var.vercel_project_name
}

# =============================================================================
# Firebase Configuration Environment Variables
# =============================================================================
# These are automatically synced from GCP Firebase configuration
# Dev environment manages preview target, prod environment manages production target
# Downloaded via `vercel pull` in GitLab CI build stage

locals {
  # Map environment to Vercel deployment target
  # dev → preview (PR/branch deployments)
  # prod → production (main production deployment)
  vercel_target = var.environment == "prod" ? ["production"] : ["preview"]
}

resource "vercel_project_environment_variable" "firebase_api_key" {
  project_id = data.vercel_project.frontend.id
  key        = "NEXT_PUBLIC_FIREBASE_API_KEY"
  value      = data.google_firebase_web_app_config.hexaverse.api_key
  target     = local.vercel_target
}

resource "vercel_project_environment_variable" "firebase_auth_domain" {
  project_id = data.vercel_project.frontend.id
  key        = "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"
  # Production uses custom domain, dev uses Firebase default
  value  = var.environment == "prod" ? var.production_auth_domain : data.google_firebase_web_app_config.hexaverse.auth_domain
  target = local.vercel_target
}

resource "vercel_project_environment_variable" "firebase_project_id" {
  project_id = data.vercel_project.frontend.id
  key        = "NEXT_PUBLIC_FIREBASE_PROJECT_ID"
  value      = var.project_id
  target     = local.vercel_target
}

resource "vercel_project_environment_variable" "firebase_storage_bucket" {
  project_id = data.vercel_project.frontend.id
  key        = "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"
  value      = "${var.project_id}.appspot.com"
  target     = local.vercel_target
}

resource "vercel_project_environment_variable" "firebase_messaging_sender_id" {
  project_id = data.vercel_project.frontend.id
  key        = "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"
  value      = data.google_firebase_web_app_config.hexaverse.messaging_sender_id
  target     = local.vercel_target
}

resource "vercel_project_environment_variable" "firebase_app_id" {
  project_id = data.vercel_project.frontend.id
  key        = "NEXT_PUBLIC_FIREBASE_APP_ID"
  value      = google_firebase_web_app.hexaverse.app_id
  target     = local.vercel_target
}

resource "vercel_project_environment_variable" "firebase_measurement_id" {
  project_id = data.vercel_project.frontend.id
  key        = "NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID"
  value      = data.google_firebase_web_app_config.hexaverse.measurement_id
  target     = local.vercel_target
}

# =============================================================================
# Stripe Configuration
# =============================================================================

resource "vercel_project_environment_variable" "stripe_publishable_key" {
  project_id = data.vercel_project.frontend.id
  key        = "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"
  value      = var.stripe_publishable_key
  target     = local.vercel_target
}

# =============================================================================
# Backend API Configuration
# =============================================================================
# Automatically synced from Cloud Run service URL

resource "vercel_project_environment_variable" "api_url" {
  project_id = data.vercel_project.frontend.id
  key        = "NEXT_PUBLIC_API_URL"
  value      = google_cloud_run_v2_service.backend.uri
  target     = local.vercel_target
}

# =============================================================================
# Claude Agent Configuration
# =============================================================================
# Automatically synced from Claude Agent Cloud Run service URL

resource "vercel_project_environment_variable" "claude_agent_url" {
  project_id = data.vercel_project.frontend.id
  key        = "NEXT_PUBLIC_CLAUDE_AGENT_URL"
  value      = google_cloud_run_v2_service.claude_agent.uri
  target     = local.vercel_target
}

# =============================================================================
# Outputs
# =============================================================================

output "vercel_project_id" {
  description = "Vercel project ID"
  value       = data.vercel_project.frontend.id
  sensitive   = true
}

output "vercel_project_url" {
  description = "Vercel production URL"
  value       = "https://${var.vercel_project_name}-large-coffee-studios.vercel.app"
  sensitive   = true
}
