#!/usr/bin/env bash
#
# Cleans up stale Pub/Sub subscriptions and legacy topics from GCP.
# Left behind by the import/export → pipeline refactor.
#
# Usage:
#   ./scripts/cleanup-pubsub.sh                    # Dry run (default)
#   ./scripts/cleanup-pubsub.sh --execute          # Actually delete resources
#   ./scripts/cleanup-pubsub.sh --project my-proj  # Override project ID
#
set -euo pipefail

# --- Configuration ---

EXECUTE=false
PROJECT=""

# Active subscriptions that should NOT be deleted
ACTIVE_SUBSCRIPTIONS=(
  "account-member-handler"
  "entity-schema-counter"
  "entity-record-counter"
  "connection-organization-handler"
  "connection-sync-handler"
  "connection-oauth-handler"
  "schedule-trigger-handler"
  "metrics-pipeline-handler"
  "sse-entity-broadcast"
  "sse-metric-broadcast"
  "sse-pipeline-broadcast"
  "pipeline-schedule-trigger-handler"
  "pipeline-source-data-available-handler"
  "pipeline-node-worker"
  "pipeline-node-work-dlq-handler"
)

# Legacy topics to delete (replaced or unused)
LEGACY_TOPICS=(
  "datatype-events"
  "composite-datatype-events"
  "template-events"
  "import-events"
  "export-events"
  "permission-events"
)

# --- Parse arguments ---

while [[ $# -gt 0 ]]; do
  case $1 in
    --execute)
      EXECUTE=true
      shift
      ;;
    --project)
      PROJECT="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 [--execute] [--project PROJECT_ID]"
      exit 1
      ;;
  esac
done

# Resolve project
if [[ -z "$PROJECT" ]]; then
  PROJECT=$(gcloud config get-value project 2>/dev/null)
fi

if [[ -z "$PROJECT" ]]; then
  echo "ERROR: No GCP project set. Use --project or 'gcloud config set project'."
  exit 1
fi

echo "Project: $PROJECT"
echo "Mode:    $( [[ "$EXECUTE" == true ]] && echo "EXECUTE (will delete)" || echo "DRY RUN" )"
echo ""

# --- Helper ---

is_active_subscription() {
  local name="$1"
  for active in "${ACTIVE_SUBSCRIPTIONS[@]}"; do
    if [[ "$name" == "$active" ]]; then
      return 0
    fi
  done
  return 1
}

# --- Stale subscriptions ---

echo "=== Subscriptions ==="
echo ""

ALL_SUBS=$(gcloud pubsub subscriptions list --project="$PROJECT" --format="value(name)" 2>/dev/null || true)
STALE_COUNT=0
ACTIVE_COUNT=0

while IFS= read -r full_path; do
  [[ -z "$full_path" ]] && continue
  sub_name=$(basename "$full_path")

  if is_active_subscription "$sub_name"; then
    ACTIVE_COUNT=$((ACTIVE_COUNT + 1))
  else
    STALE_COUNT=$((STALE_COUNT + 1))
    if [[ "$EXECUTE" == true ]]; then
      echo "  DELETING subscription: $sub_name"
      gcloud pubsub subscriptions delete "$sub_name" --project="$PROJECT" --quiet 2>/dev/null || \
        echo "    WARNING: Failed to delete $sub_name"
    else
      echo "  WOULD DELETE subscription: $sub_name"
    fi
  fi
done <<< "$ALL_SUBS"

echo ""
echo "Active: $ACTIVE_COUNT | Stale: $STALE_COUNT"
echo ""

# --- Legacy topics ---

echo "=== Legacy Topics ==="
echo ""

TOPIC_DELETE_COUNT=0

for topic in "${LEGACY_TOPICS[@]}"; do
  # Check if topic exists
  if gcloud pubsub topics describe "$topic" --project="$PROJECT" &>/dev/null; then
    TOPIC_DELETE_COUNT=$((TOPIC_DELETE_COUNT + 1))
    if [[ "$EXECUTE" == true ]]; then
      echo "  DELETING topic: $topic"
      gcloud pubsub topics delete "$topic" --project="$PROJECT" --quiet 2>/dev/null || \
        echo "    WARNING: Failed to delete $topic"
    else
      echo "  WOULD DELETE topic: $topic"
    fi
  else
    echo "  SKIP (not found): $topic"
  fi
done

echo ""
echo "Legacy topics to remove: $TOPIC_DELETE_COUNT"
echo ""

# --- Summary ---

if [[ "$EXECUTE" == true ]]; then
  echo "Done. Deleted $STALE_COUNT subscriptions and $TOPIC_DELETE_COUNT topics."
else
  echo "Dry run complete. Re-run with --execute to apply changes."
fi
