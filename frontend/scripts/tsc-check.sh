#!/usr/bin/env bash
# Type-check without emitting. Referenced by `npm run lint` (package.json).
set -euo pipefail
cd "$(dirname "$0")/.."
npx --no-install tsc --noEmit
