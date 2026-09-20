#!/bin/bash
# Check that backend Go files have corresponding test files

# Read JSON input from stdin
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Resolved from git, never from a hardcoded depth: this file is reachable both
# as harness/<name> and through the tools/ and .claude/scripts compat symlinks.
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null || { cd "$SCRIPT_DIR/.." && pwd; })"

INPUT=$(cat)

# Extract file path from JSON
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# Exit if no file path
if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Only check backend Go files (not test files)
if [[ ! "$FILE_PATH" =~ ^$REPO_ROOT/backend/.*\.go$ ]]; then
  exit 0
fi

# Skip test files themselves
if [[ "$FILE_PATH" =~ _test\.go$ ]]; then
  exit 0
fi

# Skip mock files
if [[ "$FILE_PATH" =~ _mock\.go$ ]]; then
  exit 0
fi

# Skip main.go and router.go (don't require tests)
if [[ "$FILE_PATH" =~ (main\.go|router\.go)$ ]]; then
  exit 0
fi

# Skip test helper files (fixtures, test_helpers, etc.)
if [[ "$FILE_PATH" =~ (test_helpers\.go|test_flow_helpers\.go|fixtures\.go)$ ]]; then
  exit 0
fi

# Skip firestore.go (thin wrapper tested via DAO integration tests)
if [[ "$FILE_PATH" =~ firestore\.go$ ]]; then
  exit 0
fi

# Skip params.go (simple parameter helper functions)
if [[ "$FILE_PATH" =~ common/params\.go$ ]]; then
  exit 0
fi

# Skip config.go (environment configuration, tested via integration)
if [[ "$FILE_PATH" =~ config/config\.go$ ]]; then
  exit 0
fi

# Skip docs/docs.go (auto-generated Swagger documentation)
if [[ "$FILE_PATH" =~ docs/docs\.go$ ]]; then
  exit 0
fi

# For model.go files, only require tests if they contain functions (not just structs/constants)
if [[ "$FILE_PATH" =~ model\.go$ ]]; then
  # Check if file has any function definitions (excluding method receivers on structs)
  # Look for "func " that's not a method (not "func (receiver Type)")
  if ! grep -qE '^func [A-Z][a-zA-Z0-9_]*\(' "$FILE_PATH"; then
    # No standalone functions found, skip test requirement
    exit 0
  fi
  # Has transformation functions, continue to test requirement check
fi

# Get the directory and base filename
DIR=$(dirname "$FILE_PATH")
FILENAME=$(basename "$FILE_PATH" .go)

# Expected test file path
TEST_FILE="${DIR}/${FILENAME}_test.go"

# Check if test file exists
if [ ! -f "$TEST_FILE" ]; then
  # Determine the file type for better error message
  FILE_TYPE="Go file"
  if [[ "$FILENAME" =~ handler$ ]]; then
    FILE_TYPE="handler"
  elif [[ "$FILENAME" =~ service$ ]]; then
    FILE_TYPE="service"
  elif [[ "$FILENAME" =~ dao$ ]]; then
    FILE_TYPE="DAO"
  elif [[ "$FILENAME" =~ subscriptions$ ]]; then
    FILE_TYPE="subscription handler"
  elif [[ "$FILENAME" =~ model$ ]]; then
    FILE_TYPE="model file"
  fi

  # Get base filenames for JSON (avoiding quote issues)
  BASE_FILE=$(basename "$FILE_PATH")
  BASE_TEST=$(basename "$TEST_FILE")

  # Return blocking feedback
  cat <<EOF
{
  "decision": "block",
  "reason": "⚠️ Missing test file\\n\\n📝 File: ${BASE_FILE}\\n🔍 Type: ${FILE_TYPE}\\n\\n🎯 Expected test file: ${BASE_TEST}\\n\\nEvery backend ${FILE_TYPE} should have corresponding tests to ensure:\\n• Functionality works as expected\\n• Edge cases are handled\\n• Regressions are caught early\\n• Code is maintainable\\n\\n💡 Create ${FILENAME}_test.go in the same directory with test cases.",
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "checkType": "backend-test-validation",
    "filePath": "$FILE_PATH",
    "expectedTestFile": "$TEST_FILE"
  }
}
EOF
  exit 2  # Exit code 2 blocks Claude's processing
fi

# All checks passed
exit 0
