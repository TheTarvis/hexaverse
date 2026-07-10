# =============================================================================
# Cloud Scheduler
# =============================================================================
# Add scheduled jobs here as needed. The pattern below shows a recurring HTTP
# job authenticated to Cloud Run via an OIDC token.
#
# resource "google_cloud_scheduler_job" "example" {
#   name        = "example-job"
#   description = "Example scheduled job"
#   schedule    = "*/15 * * * *"
#   time_zone   = var.scheduler_timezone
#
#   http_target {
#     uri         = "${google_cloud_run_v2_service.backend.uri}/v1/example"
#     http_method = "POST"
#     oidc_token {
#       service_account_email = google_service_account.scheduler.email
#       audience              = google_cloud_run_v2_service.backend.uri
#     }
#   }
#
#   depends_on = [google_project_service.cloudscheduler, google_cloud_run_v2_service.backend]
# }

# Service account for Cloud Scheduler to invoke Cloud Run.
resource "google_service_account" "scheduler" {
  account_id   = "cloud-scheduler-sa"
  display_name = "Cloud Scheduler Service Account"
  description  = "Service account used by Cloud Scheduler to invoke Cloud Run services"

  depends_on = [google_project_service.iam]
}

resource "google_cloud_run_v2_service_iam_member" "scheduler_invoker" {
  name     = google_cloud_run_v2_service.backend.name
  location = google_cloud_run_v2_service.backend.location
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.scheduler.email}"
}

# =============================================================================
# Action & Timer sweep (#0005)
# =============================================================================
# The liveness floor: ~every 15 min, an ordinary reader on a clock resolves
# anything outstanding so actions complete even with nobody watching. Correctness
# never depends on it — every acceptance criterion holds with the sweep disabled;
# it only bounds how late an unobserved resolution can be.
#
# The OIDC audience matches the backend's OIDCTokenVerification middleware and the
# other push subscriptions ("hexaverse-backend"). NOTE for Travis: that middleware
# currently hardcodes `pushAudience = "flywheel-backend"` (an un-substituted
# skeleton leftover) — it must become "hexaverse-backend" for ANY /v1/push OIDC to
# verify in prod (this affects the existing sse-item/account subs too, not just
# the sweep). Left untouched here as it's outside M5's scope.
resource "google_cloud_scheduler_job" "action_sweep" {
  name        = "action-sweep"
  description = "Resolves due actions as a liveness floor (#0005)"
  schedule    = "*/15 * * * *"
  time_zone   = var.scheduler_timezone

  http_target {
    uri         = "${google_cloud_run_v2_service.backend.uri}/v1/push/action-sweep"
    http_method = "POST"
    oidc_token {
      service_account_email = google_service_account.scheduler.email
      audience              = "hexaverse-backend"
    }
  }

  depends_on = [google_project_service.cloudscheduler, google_cloud_run_v2_service.backend]
}
