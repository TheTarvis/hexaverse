#!/usr/bin/env bash
#
# Check for raw fetch() usage in frontend service files.
# Services should use apiClient for automatic token refresh and 401 retry.
#
# Input: JSON with file_path via stdin
# Output: JSON response with pass/fail status
# Exit codes:
#   0 = passed (no raw fetch found or not a service file)
#   2 = failed (raw fetch found in service file)

set -euo pipefail

# Read JSON input
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .file_path // empty')

if [[ -z "$FILE_PATH" ]]; then
    echo '{"status": "error", "reason": "No file_path provided"}'
    exit 1
fi

# Check if this is a service file in lib/services/
if [[ ! "$FILE_PATH" =~ frontend/lib/services/.*\.ts$ ]]; then
    echo '{"status": "pass", "reason": "Not a service file"}'
    exit 0
fi

# Skip test files
if [[ "$FILE_PATH" =~ \.test\.ts$ ]]; then
    echo '{"status": "pass", "reason": "Test file, skipping"}'
    exit 0
fi

# Check for raw fetch usage
if grep -qE 'await fetch\(|fetch\(`' "$FILE_PATH"; then
    # Found raw fetch - check if apiClient is being used
    if grep -qE 'import.*apiClient.*from' "$FILE_PATH"; then
        # Has both apiClient and fetch - this is suspicious but might be intentional
        echo '{"status": "pass", "reason": "apiClient is imported"}'
        exit 0
    fi

    # Raw fetch without apiClient import - this is a problem
    LINES=$(grep -nE 'await fetch\(|fetch\(`' "$FILE_PATH" | head -3 | sed 's/"/\\"/g' | tr '\n' ' ')
    echo "{\"status\": \"fail\", \"reason\": \"Raw fetch() found without apiClient. Use apiClient from @/lib/api-client for automatic token refresh and 401 retry. Lines: $LINES\"}"
    exit 2
fi

echo '{"status": "pass", "reason": "No raw fetch found"}'
exit 0