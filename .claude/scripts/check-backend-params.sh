#!/bin/bash
# Check that backend Go files use constants or helper functions for c.Param()
# and c.Query() calls instead of string literals.
#
# BAD:  c.Param("organizationId")  /  c.Query("redirectUri")
# GOOD: c.Param(orgIdParam)        /  common.OrganizationIdParam(c)

set -eo pipefail

# Read JSON input from stdin
INPUT=$(cat)

# Extract file path from JSON
FILE_PATH=$(echo "$INPUT" | python3 -c "import sys, json; print(json.load(sys.stdin)['tool_input']['file_path'])")

# Only check Go files in backend/ (excluding tests, mocks, and the params.go file itself)
if [[ ! "$FILE_PATH" =~ backend/.*\.go$ ]] || \
   [[ "$FILE_PATH" =~ _test\.go$ ]] || \
   [[ "$FILE_PATH" =~ _mock\.go$ ]] || \
   [[ "$FILE_PATH" =~ common/params\.go$ ]]; then
    exit 0
fi

# Check for any c.Param("...") or c.Query("...") calls with string literals
VIOLATIONS=""
LINE_NUM=0

while IFS= read -r line; do
    ((LINE_NUM++)) || true

    # Check for c.Param("stringLiteral")
    if [[ "$line" =~ c\.Param\(\"([^\"]+)\"\) ]]; then
        PARAM_NAME="${BASH_REMATCH[1]}"
        if [[ -z "$VIOLATIONS" ]]; then
            VIOLATIONS="String literals in c.Param()/c.Query() calls. Use constants or helper functions instead:\n\n"
        fi
        VIOLATIONS+="  Line $LINE_NUM: c.Param(\"$PARAM_NAME\") — use a constant or common.*Param(c) helper\n"
    fi

    # Check for c.Query("stringLiteral")
    if [[ "$line" =~ c\.Query\(\"([^\"]+)\"\) ]]; then
        QUERY_NAME="${BASH_REMATCH[1]}"
        if [[ -z "$VIOLATIONS" ]]; then
            VIOLATIONS="String literals in c.Param()/c.Query() calls. Use constants or helper functions instead:\n\n"
        fi
        VIOLATIONS+="  Line $LINE_NUM: c.Query(\"$QUERY_NAME\") — use a constant or common.*Query(c) helper\n"
    fi
done < "$FILE_PATH"

if [[ -n "$VIOLATIONS" ]]; then
    REASON="$VIOLATIONS"
    REASON+="\nSee backend/common/params.go for available helper functions."

    # Escape for JSON
    REASON_JSON=$(echo -e "$REASON" | python3 -c "import sys, json; print(json.dumps(sys.stdin.read()))")

    echo "{\"reason\": $REASON_JSON}"
    exit 2
fi

exit 0
