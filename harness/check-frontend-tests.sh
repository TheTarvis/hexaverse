#!/bin/bash
# Check that frontend TypeScript/TSX files have corresponding test files

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

# Only check frontend TypeScript/TSX files
if [[ ! "$FILE_PATH" =~ ^$REPO_ROOT/frontend/.*\.(ts|tsx)$ ]]; then
  exit 0
fi

# Skip test files themselves
if [[ "$FILE_PATH" =~ \.(test|spec)\.(ts|tsx)$ ]]; then
  exit 0
fi

# Skip story files
if [[ "$FILE_PATH" =~ \.stories\.(ts|tsx)$ ]]; then
  exit 0
fi

# Skip type definition files (lib/types/*.ts)
if [[ "$FILE_PATH" =~ /lib/types/.*\.ts$ ]]; then
  exit 0
fi

# Skip files named types.ts (type definitions, no logic to test)
if [[ "$FILE_PATH" =~ /types\.ts$ ]]; then
  exit 0
fi

# Skip index files (typically just exports)
if [[ "$FILE_PATH" =~ /index\.(ts|tsx)$ ]]; then
  exit 0
fi

# Skip layout files (Next.js layouts)
if [[ "$FILE_PATH" =~ layout\.(ts|tsx)$ ]]; then
  exit 0
fi

# Skip loading/error/not-found files (Next.js special files)
if [[ "$FILE_PATH" =~ (loading|error|not-found)\.(ts|tsx)$ ]]; then
  exit 0
fi

# Skip config files
if [[ "$FILE_PATH" =~ (config|constants)\.(ts|tsx)$ ]]; then
  exit 0
fi

# Skip provider files (typically thin wrappers)
if [[ "$FILE_PATH" =~ -provider\.(ts|tsx)$ ]]; then
  exit 0
fi

# Skip context files (React context definitions)
if [[ "$FILE_PATH" =~ -context\.(ts|tsx)$ ]]; then
  exit 0
fi

# Skip files in lib/api/ (API client utilities)
if [[ "$FILE_PATH" =~ /lib/api/[^/]+\.(ts|tsx)$ ]]; then
  exit 0
fi

# Skip middleware files
if [[ "$FILE_PATH" =~ middleware\.(ts|tsx)$ ]]; then
  exit 0
fi

# Skip Storybook config
if [[ "$FILE_PATH" =~ /\.storybook/ ]]; then
  exit 0
fi

# Skip tailwind and postcss config
if [[ "$FILE_PATH" =~ (tailwind|postcss)\.config\.(ts|js)$ ]]; then
  exit 0
fi

# Skip next.config files
if [[ "$FILE_PATH" =~ next\.config\.(ts|js|mjs)$ ]]; then
  exit 0
fi

# Skip vitest config
if [[ "$FILE_PATH" =~ vitest\.(config|setup)\.(ts|js)$ ]]; then
  exit 0
fi

# Skip example/demo files
if [[ "$FILE_PATH" =~ (example|demo)\.(ts|tsx)$ ]]; then
  exit 0
fi

# Skip Catalyst UI components (third-party design system)
if [[ "$FILE_PATH" =~ /components/catalyst/.*\.(ts|tsx)$ ]]; then
  exit 0
fi

# Skip the WebGL render layer. These modules need a live GL context, so any unit
# test for them degrades to `expect(typeof SpaceWorld).toBe('function')` — a
# tautology that hides the gap instead of covering it.
#
# The exemption is only safe because of the rule it is paired with (see
# docs/plans/webgl-board-port.md): components/space/webgl/ holds GL PLUMBING
# ONLY. Anything that DECIDES something — fog band → visual treatment, appearance
# selection, instance-buffer packing, projection math, formation offsets — is
# pure, lives OUTSIDE this directory, and is tested there. Fog treatment in
# particular is #0006 enforcement and must never be decided inside a shader.
#
# So: wanting a file exempt means moving it into webgl/, and moving it there is
# the claim that it contains no decisions. Review that claim.
if [[ "$FILE_PATH" =~ /components/space/webgl/.*\.(ts|tsx)$ ]]; then
  exit 0
fi

# Get the directory and base filename
DIR=$(dirname "$FILE_PATH")
FILENAME=$(basename "$FILE_PATH")
FILENAME_WITHOUT_EXT="${FILENAME%.*}"
EXT="${FILENAME##*.}"

# Expected test file paths (check multiple patterns)
# For .ts files, also check for .tsx test files (some tests use JSX for wrappers)
TEST_FILE_1="${DIR}/${FILENAME_WITHOUT_EXT}.test.${EXT}"
TEST_FILE_2="${DIR}/__tests__/${FILENAME_WITHOUT_EXT}.test.${EXT}"
TEST_FILE_3="${DIR}/${FILENAME_WITHOUT_EXT}.test.tsx"
TEST_FILE_4="${DIR}/__tests__/${FILENAME_WITHOUT_EXT}.test.tsx"

# Check if test file exists in any location
if [ -f "$TEST_FILE_1" ] || [ -f "$TEST_FILE_2" ] || [ -f "$TEST_FILE_3" ] || [ -f "$TEST_FILE_4" ]; then
  exit 0
fi

# Determine the file type for better error message
FILE_TYPE="TypeScript file"
if [[ "$FILE_PATH" =~ /components/.*\.tsx$ ]]; then
  FILE_TYPE="component"
elif [[ "$FILE_PATH" =~ /hooks/.*\.ts$ ]]; then
  FILE_TYPE="hook"
elif [[ "$FILE_PATH" =~ /lib/services/.*\.ts$ ]]; then
  FILE_TYPE="service"
elif [[ "$FILE_PATH" =~ /lib/.*\.ts$ ]]; then
  FILE_TYPE="utility"
elif [[ "$FILE_PATH" =~ /app/.*page\.tsx$ ]]; then
  FILE_TYPE="page component"
fi

# Get base filenames for JSON (avoiding quote issues)
BASE_FILE=$(basename "$FILE_PATH")
BASE_TEST="${FILENAME_WITHOUT_EXT}.test.${EXT}"

# Return blocking feedback
cat <<EOF
{
  "decision": "block",
  "reason": "⚠️ Missing test file\\n\\n📝 File: ${BASE_FILE}\\n🔍 Type: ${FILE_TYPE}\\n\\n🎯 Expected test file: ${BASE_TEST}\\n\\nEvery frontend ${FILE_TYPE} should have corresponding tests to ensure:\\n• Functionality works as expected\\n• Edge cases are handled\\n• Regressions are caught early\\n• Code is maintainable\\n\\n💡 Create ${BASE_TEST} in the same directory (or __tests__ subdirectory) with test cases.",
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "checkType": "frontend-test-validation",
    "filePath": "$FILE_PATH",
    "expectedTestFile": "$TEST_FILE_1"
  }
}
EOF
exit 2  # Exit code 2 blocks Claude's processing