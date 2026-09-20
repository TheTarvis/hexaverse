#!/bin/bash
# Check that Python files in claude-agent have corresponding test files

# Read JSON input from stdin
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

INPUT=$(cat)

# Extract file path from JSON
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# Exit if no file path
if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Only check claude-agent Python source files
if [[ ! "$FILE_PATH" =~ ^$REPO_ROOT/claude-agent/src/.*\.py$ ]]; then
  exit 0
fi

# Skip __init__.py files
if [[ "$(basename "$FILE_PATH")" == "__init__.py" ]]; then
  exit 0
fi

# Skip conftest.py files
if [[ "$(basename "$FILE_PATH")" == "conftest.py" ]]; then
  exit 0
fi

# Get the directory and base filename
FILENAME=$(basename "$FILE_PATH" .py)

# Get the relative path within src/
SRC_DIR="$REPO_ROOT/claude-agent/src"
REL_PATH=${FILE_PATH#$SRC_DIR/}
REL_DIR=$(dirname "$REL_PATH")

# Calculate the test directory and expected test file
TESTS_DIR="$REPO_ROOT/claude-agent/tests"

# For model files (api.py, context.py, etc.), only require tests if they contain functions
# Skip if file only has class definitions, type aliases, or constants
if [[ "$REL_DIR" == "models" ]] || [[ "$FILE_PATH" =~ models/.*\.py$ ]]; then
  # Check if file has any function definitions that aren't methods (standalone functions)
  if ! grep -qE '^def [a-zA-Z_][a-zA-Z0-9_]*\(' "$FILE_PATH" 2>/dev/null; then
    # No standalone functions found, skip test requirement
    exit 0
  fi
fi

# For config.py, skip (environment configuration)
if [[ "$FILENAME" == "config" ]]; then
  exit 0
fi

# Build expected test file paths
# Pattern 1: tests/test_<filename>.py (flat structure)
TEST_FILE_FLAT="${TESTS_DIR}/test_${FILENAME}.py"

# Pattern 2: tests/<subdir>/test_<filename>.py (mirrored structure)
if [[ "$REL_DIR" != "." ]]; then
  TEST_FILE_NESTED="${TESTS_DIR}/${REL_DIR}/test_${FILENAME}.py"
else
  TEST_FILE_NESTED=""
fi

# Pattern 3: tests/test_<subdir>_<filename>.py (combined naming, e.g., test_mcp_tools.py)
if [[ "$REL_DIR" != "." ]]; then
  TEST_FILE_COMBINED="${TESTS_DIR}/test_${REL_DIR}_${FILENAME}.py"
else
  TEST_FILE_COMBINED=""
fi

# Check if any test file pattern exists
if [ -f "$TEST_FILE_FLAT" ]; then
  exit 0
fi

if [ -n "$TEST_FILE_NESTED" ] && [ -f "$TEST_FILE_NESTED" ]; then
  exit 0
fi

if [ -n "$TEST_FILE_COMBINED" ] && [ -f "$TEST_FILE_COMBINED" ]; then
  exit 0
fi

# Determine the file type for better error message
FILE_TYPE="Python file"
if [[ "$REL_DIR" == "clients" ]]; then
  FILE_TYPE="API client"
elif [[ "$REL_DIR" == "middleware" ]]; then
  FILE_TYPE="middleware"
elif [[ "$REL_DIR" == "agents" ]]; then
  FILE_TYPE="agent"
elif [[ "$REL_DIR" == "mcp" ]]; then
  FILE_TYPE="MCP tool"
elif [[ "$REL_DIR" == "prompts" ]]; then
  FILE_TYPE="prompt"
elif [[ "$REL_DIR" == "models" ]]; then
  FILE_TYPE="model"
elif [[ "$FILENAME" == "main" ]]; then
  FILE_TYPE="main module"
fi

# Get base filenames for JSON (avoiding quote issues)
BASE_FILE=$(basename "$FILE_PATH")

# Build the expected test file suggestion
if [[ "$REL_DIR" != "." ]]; then
  EXPECTED_TEST="tests/test_${FILENAME}.py or tests/${REL_DIR}/test_${FILENAME}.py"
else
  EXPECTED_TEST="tests/test_${FILENAME}.py"
fi

# Return blocking feedback
cat <<EOF
{
  "decision": "block",
  "reason": "Missing test file\\n\\n File: ${BASE_FILE}\\n Type: ${FILE_TYPE}\\n\\n Expected test file: ${EXPECTED_TEST}\\n\\nEvery Python ${FILE_TYPE} should have corresponding tests to ensure:\\n  Functionality works as expected\\n  Edge cases are handled\\n  Regressions are caught early\\n\\n Create test_${FILENAME}.py in the tests/ directory with test cases.",
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "checkType": "python-test-validation",
    "filePath": "$FILE_PATH",
    "expectedTestFile": "$EXPECTED_TEST"
  }
}
EOF
exit 2  # Exit code 2 blocks Claude's processing