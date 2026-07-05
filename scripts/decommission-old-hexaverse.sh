#!/usr/bin/env bash
#
# Decommissions the OLD (pre-Volt) hexaverse implementation inside the
# `hexaverse` GCP project — which is also the NEW prod project, so this
# deletes only an explicit, inventoried list of legacy resources and never
# touches the Volt stack (hexaverse-backend, claude-agent-service,
# item-events, accounts, ...).
#
# Inventory taken 2026-07-02. If the console shows old resources not listed
# here, add them to the arrays below before running.
#
# Usage:
#   ./scripts/decommission-old-hexaverse.sh                # Dry run (default)
#   ./scripts/decommission-old-hexaverse.sh --execute      # Actually delete
#   ./scripts/decommission-old-hexaverse.sh --skip-firestore --execute
#
# Auth: uses the hexaverse gcloud configuration (wilson.travis.t@gmail.com):
#   CLOUDSDK_ACTIVE_CONFIG_NAME=hexaverse ./scripts/decommission-old-hexaverse.sh
# The Firebase CLI account is pinned to the repo directory via `firebase login:use`.
#
set -euo pipefail

PROJECT="hexaverse"
REGION="us-central1"
EXECUTE=false
SKIP_FIRESTORE=false

# --- Legacy inventory (2026-07-02) ---

# Gen-2 Cloud Functions — deleting a function also removes its Cloud Run service.
OLD_FUNCTIONS=(
  addColonyTile
  addRoadmapItem
  createColony
  deleteRoadmapItem
  fetchColonyTilesByIds
  fetchDrawingTilesAfterTimestamp
  sendDrawingTileUpdate
  ssrhexaverse
  submitSupportRequest
  updateRoadmapItem
)

# Plain Cloud Run services (the old realtime layer).
OLD_RUN_SERVICES=(
  websocket-server
  websocket-server-colony
  websocket-server-draw
)

# Legacy Pub/Sub topics; their subscriptions are discovered at runtime.
OLD_TOPICS=(
  colony-events
  drawing-events
  websocket-events
)

# Old game data. The Volt stack's collections (accounts, ...) are NOT listed.
OLD_COLLECTIONS=(
  colonies
  colony
  drawing
  metrics
  roadmapItems
  support_requests
  test
  tiles
)

# Function-source + build-log buckets. Only safe to delete AFTER the
# functions above are gone.
OLD_BUCKETS=(
  "gs://websocket-server-build-logs"
  "gs://gcf-sources-440067356194-us-central1"
  "gs://gcf-v2-sources-440067356194-us-central1"
  "gs://gcf-v2-uploads-440067356194.us-central1.cloudfunctions.appspot.com"
)

# --- Parse arguments ---

while [[ $# -gt 0 ]]; do
  case $1 in
    --execute)        EXECUTE=true; shift ;;
    --skip-firestore) SKIP_FIRESTORE=true; shift ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 [--execute] [--skip-firestore]"
      exit 1
      ;;
  esac
done

echo "Project: $PROJECT"
echo "Mode:    $( [[ "$EXECUTE" == true ]] && echo "EXECUTE (will delete)" || echo "DRY RUN" )"
echo ""

run() {
  if [[ "$EXECUTE" == true ]]; then
    "$@" || echo "    WARNING: command failed: $*"
  fi
}

# --- 1. Cloud Functions ---

echo "=== Cloud Functions ==="
for fn in "${OLD_FUNCTIONS[@]}"; do
  if gcloud functions describe "$fn" --project="$PROJECT" --region="$REGION" &>/dev/null; then
    echo "  $( [[ "$EXECUTE" == true ]] && echo DELETING || echo "WOULD DELETE" ) function: $fn"
    run gcloud functions delete "$fn" --project="$PROJECT" --region="$REGION" --quiet
  else
    echo "  SKIP (not found): $fn"
  fi
done
echo ""

# --- 2. Cloud Run services ---

echo "=== Cloud Run services ==="
for svc in "${OLD_RUN_SERVICES[@]}"; do
  if gcloud run services describe "$svc" --project="$PROJECT" --region="$REGION" &>/dev/null; then
    echo "  $( [[ "$EXECUTE" == true ]] && echo DELETING || echo "WOULD DELETE" ) service: $svc"
    run gcloud run services delete "$svc" --project="$PROJECT" --region="$REGION" --quiet
  else
    echo "  SKIP (not found): $svc"
  fi
done
echo ""

# --- 3. Pub/Sub subscriptions + topics ---

echo "=== Pub/Sub ==="
for topic in "${OLD_TOPICS[@]}"; do
  if ! gcloud pubsub topics describe "$topic" --project="$PROJECT" &>/dev/null; then
    echo "  SKIP (not found): topic $topic"
    continue
  fi
  # Delete subscriptions attached to this topic first.
  subs=$(gcloud pubsub topics list-subscriptions "$topic" --project="$PROJECT" --format='value(name)' 2>/dev/null || true)
  while IFS= read -r sub; do
    [[ -z "$sub" ]] && continue
    echo "  $( [[ "$EXECUTE" == true ]] && echo DELETING || echo "WOULD DELETE" ) subscription: $(basename "$sub")"
    run gcloud pubsub subscriptions delete "$sub" --quiet
  done <<< "$subs"
  echo "  $( [[ "$EXECUTE" == true ]] && echo DELETING || echo "WOULD DELETE" ) topic: $topic"
  run gcloud pubsub topics delete "$topic" --project="$PROJECT" --quiet
done
echo ""

# --- 4. Firestore collections (old game data) ---

if [[ "$SKIP_FIRESTORE" == true ]]; then
  echo "=== Firestore: skipped (--skip-firestore) ==="
else
  echo "=== Firestore collections ==="
  for c in "${OLD_COLLECTIONS[@]}"; do
    echo "  $( [[ "$EXECUTE" == true ]] && echo "WILL DELETE" || echo "WOULD DELETE" ) collection: $c"
  done
  if [[ "$EXECUTE" == true ]]; then
    echo ""
    echo "⚠️  This permanently deletes the old game's data from the (default)"
    echo "    Firestore database — the same database new prod data lives in."
    read -r -p "Type 'DELETE OLD GAME DATA' to continue (anything else skips): " confirm
    if [[ "$confirm" == "DELETE OLD GAME DATA" ]]; then
      for c in "${OLD_COLLECTIONS[@]}"; do
        echo "  Deleting collection: $c"
        firebase firestore:delete "$c" --recursive --project "$PROJECT" --force 2>/dev/null \
          && echo "    ✓ Deleted $c" \
          || echo "    ⊘ '$c' not found or already deleted"
      done
    else
      echo "  Firestore cleanup skipped."
    fi
  fi
fi
echo ""

# --- 5. Buckets ---

echo "=== GCS buckets ==="
for b in "${OLD_BUCKETS[@]}"; do
  if gcloud storage ls "$b" --project="$PROJECT" &>/dev/null; then
    echo "  $( [[ "$EXECUTE" == true ]] && echo DELETING || echo "WOULD DELETE" ) bucket: $b"
    run gcloud storage rm -r "$b" --project="$PROJECT"
  else
    echo "  SKIP (not found): $b"
  fi
done
echo ""

if [[ "$EXECUTE" == true ]]; then
  echo "Done. Review remaining resources: https://console.cloud.google.com/run?project=$PROJECT"
else
  echo "Dry run complete. Re-run with --execute to apply."
fi
