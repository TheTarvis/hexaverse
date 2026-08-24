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

# =============================================================================
# Credit-ledger reconciliation (#0011)
# =============================================================================
# The periodic half of the balance/ledger reconciliation invariant. Credits are
# the one place this codebase keeps a MATERIALIZED total instead of folding a
# ledger on every read (a credit ledger accrues entries for the life of an
# account, so folding it per read doesn't age well) — and that deviation is only
# safe for as long as the fold and the stored balance provably agree. This job is
# what makes "provably" true on a cadence rather than on a hope.
#
# Correctness does not depend on it firing. Every settlement transaction already
# runs an O(1) chained check against the previous entry's recorded resulting
# balance, so a divergence is caught at the moment it would occur; this cycle is
# the backstop that finds one nobody's next mutation would have surfaced —
# including for a corporation that trades nothing all week.
#
# Hourly rather than the sweep's 15 minutes: the check is a windowed fold per
# living corporation (never from genesis), so its cost scales with corporation
# count, and an undetected divergence already halts further mutation the instant
# anyone touches that balance.
#
# NOTE for Travis — this route inherits the audience bug flagged above: the
# backend's `pushAudience` is still hardcoded to "flywheel-backend"
# (backend/middlewares/oidc.go:13), so this job will 401 in prod exactly like
# the sweep and the existing sse/account push subscriptions until that constant
# becomes "hexaverse-backend". It is a one-word fix, but it changes the auth
# behaviour of four live push consumers at once, so it is deliberately left for
# you rather than folded silently into the market change.
resource "google_cloud_scheduler_job" "credit_reconcile" {
  name        = "credit-reconcile"
  description = "Reconciles each corporation's credit balance against its trade ledger (#0011)"
  schedule    = "0 * * * *"
  time_zone   = var.scheduler_timezone

  http_target {
    uri         = "${google_cloud_run_v2_service.backend.uri}/v1/push/credit-reconcile"
    http_method = "POST"
    oidc_token {
      service_account_email = google_service_account.scheduler.email
      audience              = "hexaverse-backend"
    }
  }

  depends_on = [google_project_service.cloudscheduler, google_cloud_run_v2_service.backend]
}
