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
