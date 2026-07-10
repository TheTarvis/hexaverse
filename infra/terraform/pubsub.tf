# =============================================================================
# Pub/Sub topics
# =============================================================================
# Topics for event-driven communication. Replace with your own topics — the
# `item_events` topic below is wired to the example items domain.

resource "google_pubsub_topic" "item_events" {
  name = "item-events"

  labels = {
    environment = var.environment
    managed_by  = "terraform"
  }

  depends_on = [google_project_service.pubsub]
}

# =============================================================================
# Push subscription service account
# =============================================================================
# Used by Pub/Sub to authenticate push deliveries to Cloud Run via OIDC tokens.
# No Cloud Run invoker binding needed — invoker_iam_disabled = true on the service.

resource "google_service_account" "pubsub_push" {
  account_id   = "pubsub-push-sa"
  display_name = "Pub/Sub Push Service Account"
  description  = "Service account for Pub/Sub push subscription OIDC tokens"

  depends_on = [google_project_service.iam]
}

# =============================================================================
# Push subscriptions (example)
# =============================================================================
# Push subscriptions deliver to Cloud Run HTTP endpoints, letting the backend
# scale to zero when idle. Audience "hexaverse-backend" is verified by the OIDC
# middleware in the backend.

resource "google_pubsub_subscription" "sse_item_broadcast" {
  name  = "sse-item-broadcast"
  topic = google_pubsub_topic.item_events.id

  push_config {
    push_endpoint = "${google_cloud_run_v2_service.backend.uri}/v1/push/sse-item"
    oidc_token {
      service_account_email = google_service_account.pubsub_push.email
      audience              = "hexaverse-backend"
    }
  }

  ack_deadline_seconds = 30
  retry_policy {
    minimum_backoff = "10s"
    maximum_backoff = "60s"
  }
}

# =============================================================================
# Action & Timer system (#0005)
# =============================================================================
# ActionCompleted envelopes fan out to SSE watchers of the action's scope. SSE
# is invalidation, not truth — a dropped delivery self-heals via the client
# refetch rules, so this subscription is a nicety, not a correctness dependency.

resource "google_pubsub_topic" "action_events" {
  name = "action-events"

  labels = {
    environment = var.environment
    managed_by  = "terraform"
  }

  depends_on = [google_project_service.pubsub]
}

resource "google_pubsub_subscription" "sse_action_broadcast" {
  name  = "sse-action-broadcast"
  topic = google_pubsub_topic.action_events.id

  push_config {
    push_endpoint = "${google_cloud_run_v2_service.backend.uri}/v1/push/sse-action"
    oidc_token {
      service_account_email = google_service_account.pubsub_push.email
      audience              = "hexaverse-backend"
    }
  }

  ack_deadline_seconds = 30
  retry_policy {
    minimum_backoff = "10s"
    maximum_backoff = "60s"
  }
}
