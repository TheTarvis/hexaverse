# =============================================================================
# Firestore composite indexes
# =============================================================================
# Add composite indexes here as your queries require them. Single-field
# indexes are created automatically by Firestore — only multi-field equality
# or order-by-one-field/inequality-on-another queries need entries below.
#
# Example shape (commented):
#
# resource "google_firestore_index" "items_owner_created" {
#   provider    = google-beta
#   project     = var.project_id
#   database    = google_firestore_database.default.name
#   collection  = "items"
#   query_scope = "COLLECTION"
#
#   fields {
#     field_path = "ownerId"
#     order      = "ASCENDING"
#   }
#
#   fields {
#     field_path = "createdAt"
#     order      = "DESCENDING"
#   }
# }

# -----------------------------------------------------------------------------
# Action & Timer system (#0005) — the due-actions queries.
# -----------------------------------------------------------------------------
# Resolution is "resolve this scope's running actions with eta ≤ now, in ETA
# order" (plus by-actor for a fleet read, and unfiltered for the sweep). Each
# needs a composite index: equality filters + an inequality/order-by on eta.
# The Firestore emulator auto-indexes, so tests pass without these; production
# needs them applied. (Requires Travis to `terraform plan/apply` — no creds here.)

resource "google_firestore_index" "actions_scope_due" {
  provider    = google-beta
  project     = var.project_id
  database    = google_firestore_database.default.name
  collection  = "actions"
  query_scope = "COLLECTION"

  fields {
    field_path = "scope"
    order      = "ASCENDING"
  }
  fields {
    field_path = "status"
    order      = "ASCENDING"
  }
  fields {
    field_path = "eta"
    order      = "ASCENDING"
  }
}

resource "google_firestore_index" "actions_actor_due" {
  provider    = google-beta
  project     = var.project_id
  database    = google_firestore_database.default.name
  collection  = "actions"
  query_scope = "COLLECTION"

  fields {
    field_path = "actor"
    order      = "ASCENDING"
  }
  fields {
    field_path = "status"
    order      = "ASCENDING"
  }
  fields {
    field_path = "eta"
    order      = "ASCENDING"
  }
}

resource "google_firestore_index" "actions_status_due" {
  provider    = google-beta
  project     = var.project_id
  database    = google_firestore_database.default.name
  collection  = "actions"
  query_scope = "COLLECTION"

  fields {
    field_path = "status"
    order      = "ASCENDING"
  }
  fields {
    field_path = "eta"
    order      = "ASCENDING"
  }
}
