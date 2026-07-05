# =============================================================================
# Firebase Resources
# =============================================================================
# This file manages Firebase configuration including web apps and their config.
# Firebase uses the same GCP project, so no separate project creation is needed.

# Enable Firebase services (if not already enabled)
resource "google_firebase_project" "default" {
  provider = google-beta
  project  = var.project_id

  depends_on = [
    google_project_service.firebase,
    google_project_service.firestore
  ]
}

# Create Firebase Web App
resource "google_firebase_web_app" "hexaverse" {
  provider     = google-beta
  project      = var.project_id
  display_name = "Hexaverse ${var.environment}"

  depends_on = [google_firebase_project.default]
}

# Get Firebase Web App configuration
data "google_firebase_web_app_config" "hexaverse" {
  provider   = google-beta
  project    = var.project_id
  web_app_id = google_firebase_web_app.hexaverse.app_id
}

# =============================================================================
# Firestore Database
# =============================================================================
# Create Firestore database in Native mode for the backend application

resource "google_firestore_database" "default" {
  provider    = google-beta
  project     = var.project_id
  name        = "(default)"
  location_id = var.region
  type        = "FIRESTORE_NATIVE"

  depends_on = [
    google_firebase_project.default,
    google_project_service.firestore
  ]
}

