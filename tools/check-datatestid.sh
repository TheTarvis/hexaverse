#!/bin/bash
# PostToolUse hook: ensure new React components include data-testid attributes
# on their interactive elements (buttons, inputs, selects, textareas, and the
# Catalyst wrappers around them).
#
# Policy (deliberately narrow to avoid false positives on a largely-uncovered
# codebase): block ONLY when a component renders interactive elements but has
# *zero* data-testid attributes anywhere. Files that already have partial
# coverage pass — improving them is encouraged but not enforced on every edit.

# Read JSON input from stdin
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Resolved from git, never from a hardcoded depth: this file is reachable both
# as tools/<name> and through the .claude/scripts symlink older references use.
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null || { cd "$SCRIPT_DIR/.." && pwd; })"

INPUT=$(cat)

# Extract file path from JSON
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# Exit if no file path (not an Edit/Write operation we care about)
if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Only check frontend component files (.tsx / .jsx). Plain .ts/.js are almost
# never components and caused the old check to scan logic files.
if [[ ! "$FILE_PATH" =~ ^$REPO_ROOT/frontend/.*\.(tsx|jsx)$ ]]; then
  exit 0
fi

# Skip test/spec/story files
if [[ "$FILE_PATH" =~ \.(test|spec|stories)\.(tsx|jsx)$ ]]; then
  exit 0
fi

# Skip non-component locations (utils, hooks, services, etc.)
if [[ "$FILE_PATH" =~ (utils|hooks|services|types|constants|lib|config)/ ]]; then
  exit 0
fi

# The file must still exist (e.g. not a delete)
if [ ! -f "$FILE_PATH" ]; then
  exit 0
fi

# Enumerate interactive elements missing data-testid (brace/string-aware).
# Pin to system python3 so the venv on PATH doesn't matter.
MISSING=$(/usr/bin/python3 "$SCRIPT_DIR/find-missing-testids.py" "$FILE_PATH")

# Nothing missing => no interactive elements, or all already covered. Pass.
if [ -z "$MISSING" ]; then
  exit 0
fi

# Partial coverage (some data-testid present) is allowed — don't block.
if grep -q "data-testid=" "$FILE_PATH"; then
  exit 0
fi

# Zero coverage on a component with interactive elements => block with the list.
ELEMENTS=$(echo "$MISSING" | head -10)
REASON=$(printf '⚠️ Missing data-testid attributes\n\n📝 File: %s\n\nThis component renders interactive elements but has no data-testid attributes. Add them so the element is targetable from Playwright/unit tests:\n\n%s\n\nExample:\n  <button data-testid="submit-button">Submit</button>\n  <input data-testid="email-input" type="email" />' \
  "$(basename "$FILE_PATH")" "$ELEMENTS")

jq -n \
  --arg reason "$REASON" \
  --arg filePath "$FILE_PATH" \
  '{
    decision: "block",
    reason: $reason,
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      checkType: "data-testid-validation",
      filePath: $filePath
    }
  }'

exit 2  # Exit code 2 blocks Claude's processing
