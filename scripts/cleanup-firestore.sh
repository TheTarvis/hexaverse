#!/bin/bash
# cleanup-firestore.sh [prod|dev]
# Safely deletes all user data from a Firestore database
# while preserving database infrastructure and indexes

set -e  # Exit on error

ENV="${1:-}"
case "$ENV" in
    prod|production)
        PROJECT="flywheel-etl-prod"
        ALIAS="production"
        LABEL="Production"
        ;;
    dev|development)
        PROJECT="flywheel-etl-dev"
        ALIAS="dev"
        LABEL="Dev"
        ;;
    *)
        echo "Usage: $0 [prod|dev]"
        echo ""
        echo "  prod  → flywheel-etl-prod (flywheeletl.com)"
        echo "  dev   → flywheel-etl-dev  (flywheeletl.dev)"
        exit 1
        ;;
esac

firebase use "$ALIAS"

echo "╔════════════════════════════════════════════════════════════════╗"
printf  "║        Firestore Database Cleanup - %-26s ║\n" "$LABEL"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "Project: $PROJECT"
echo "This will delete ALL user data from the database."
echo ""
echo "⚠️  WARNING: This action cannot be undone!"
echo ""
read -p "Type 'DELETE ALL DATA' to continue: " confirm

if [ "$confirm" != "DELETE ALL DATA" ]; then
    echo "❌ Cleanup cancelled."
    exit 1
fi

echo ""
echo "Starting cleanup..."
echo ""

# Array of collections to delete in order (most dependent first)
collections=(
    "datarecords"           # Delete records before entities
    "entities"              # Entities
    "failed_records"        # Failed records
    "pipeline_runs"         # Pipeline runs (before pipelines)
    "pipeline_versions"     # Pipeline versions (before pipelines)
    "pipeline_watermarks"   # Pipeline watermarks
    "pipeline_edge_counters" # Edge counters
    "collect_group_keys"    # Collect group keys
    "join_run_keys"         # Join run keys
    "pipelines"             # Pipeline configs
    "connections"           # User connections
    "oauth_states"          # OAuth states
    "oauthapps"             # OAuth apps
    "permissions"           # Permissions (before roles)
    "roles"                 # Roles (before memberships)
    "memberships"           # Memberships (before orgs)
    "invites"               # Pending invites
    "organizations"         # Organizations (before accounts)
    "accounts"              # User accounts
    "metrics"               # System metrics
    "metric_aggregates"     # Metric aggregates
    "llm_sessions"          # LLM sessions
    "schedules"             # Scheduled jobs
    "templates"             # Templates (org-scoped)
    "shared_templates"      # Marketplace templates
    "workflows"             # Workflows
    "pipeline_submissions"  # HITL submissions
    "agent_sessions"        # Claude agent sessions
    "custom_counters"       # Custom metric counters
    "email_quotas"          # Per-pipeline email quotas
    "user_events"           # User activity events
    "support_tickets"       # Support tickets
)

total=${#collections[@]}
current=0
success=0
skipped=0
failed=0

for collection in "${collections[@]}"; do
    current=$((current + 1))
    echo "[$current/$total] Deleting collection: $collection"

    # Try to delete, but don't fail if collection doesn't exist
    if firebase firestore:delete "$collection" --recursive --project "$PROJECT" --force 2>/dev/null; then
        echo "    ✓ Deleted $collection"
        success=$((success + 1))
    else
        # Check if it's just because collection doesn't exist
        echo "    ⊘ Collection '$collection' not found or already deleted"
        skipped=$((skipped + 1))
    fi
    echo ""
done

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                    Cleanup Summary                             ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo "Total collections processed: $total"
echo "Successfully deleted:        $success"
echo "Skipped (not found):         $skipped"
echo "Failed:                      $failed"
echo ""

if [ $failed -eq 0 ]; then
    echo "✓ Cleanup completed successfully!"
    echo ""
    echo "Next steps:"
    echo "1. Verify in Firebase Console: https://console.firebase.google.com/project/$PROJECT/firestore"
    echo "2. Test the application with clean database"
    echo "3. Create fresh test data if needed"
else
    echo "⚠️  Some collections failed to delete. Check errors above."
    exit 1
fi
