# =============================================================================
# Pub/Sub Topic Outputs
# =============================================================================

output "pubsub_topics" {
  description = "Map of Pub/Sub topic names"
  value = {
    organization_events    = google_pubsub_topic.organization_events.name
    member_events          = google_pubsub_topic.member_events.name
    role_events            = google_pubsub_topic.role_events.name
    schema_events          = google_pubsub_topic.schema_events.name
    entity_events          = google_pubsub_topic.entity_events.name
    datarecord_events      = google_pubsub_topic.datarecord_events.name
    source_events          = google_pubsub_topic.source_events.name
    sync_events            = google_pubsub_topic.sync_events.name
    oauth_events           = google_pubsub_topic.oauth_events.name
    pipeline_events        = google_pubsub_topic.pipeline_events.name
    pipeline_node_work     = google_pubsub_topic.pipeline_node_work.name
    pipeline_node_work_dlq = google_pubsub_topic.pipeline_node_work_dlq.name
    metrics_events         = google_pubsub_topic.metrics_events.name
    schedule_trigger       = google_pubsub_topic.schedule_trigger.name
  }
}

# =============================================================================
# Cloud Scheduler Outputs
# =============================================================================

output "scheduler_job_name" {
  description = "Name of the schedule trigger Cloud Scheduler job"
  value       = google_cloud_scheduler_job.schedule_trigger.name
}

output "scheduler_service_account_email" {
  description = "Email of the Cloud Scheduler service account"
  value       = google_service_account.scheduler.email
}

# =============================================================================
# Firebase Configuration Outputs
# =============================================================================
# These outputs provide all the Firebase config values needed for your frontend

output "firebase_config" {
  description = "Complete Firebase web app configuration"
  value = {
    apiKey            = data.google_firebase_web_app_config.hexaverse.api_key
    authDomain        = data.google_firebase_web_app_config.hexaverse.auth_domain
    projectId         = var.project_id
    messagingSenderId = data.google_firebase_web_app_config.hexaverse.messaging_sender_id
    appId             = google_firebase_web_app.hexaverse.app_id
    measurementId     = data.google_firebase_web_app_config.hexaverse.measurement_id
  }
}

output "firebase_api_key" {
  description = "Firebase API key for web app"
  value       = data.google_firebase_web_app_config.hexaverse.api_key
  sensitive   = true
}

output "firebase_auth_domain" {
  description = "Firebase Auth domain"
  value       = data.google_firebase_web_app_config.hexaverse.auth_domain
}

output "firebase_messaging_sender_id" {
  description = "Firebase Cloud Messaging sender ID"
  value       = data.google_firebase_web_app_config.hexaverse.messaging_sender_id
  sensitive   = true
}

output "firebase_app_id" {
  description = "Firebase web app ID"
  value       = google_firebase_web_app.hexaverse.app_id
}

output "firebase_measurement_id" {
  description = "Firebase Analytics measurement ID"
  value       = data.google_firebase_web_app_config.hexaverse.measurement_id
}

# =============================================================================
# Cloud Run Outputs
# =============================================================================

output "backend_service_url" {
  description = "URL of the Cloud Run backend service"
  value       = google_cloud_run_v2_service.backend.uri
}

output "backend_service_account_email" {
  description = "Email of the backend service account"
  value       = google_service_account.backend.email
}

output "claude_agent_service_url" {
  description = "URL of the Claude Agent Cloud Run service"
  value       = google_cloud_run_v2_service.claude_agent.uri
}

output "claude_agent_service_account_email" {
  description = "Email of the Claude Agent service account"
  value       = google_service_account.claude_agent.email
}

# =============================================================================
# Artifact Registry Outputs
# =============================================================================

output "artifact_registry_repository" {
  description = "Artifact Registry repository name"
  value       = google_artifact_registry_repository.backend.name
}

output "docker_image_base" {
  description = "Base path for Docker images"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.backend.name}/backend"
}
