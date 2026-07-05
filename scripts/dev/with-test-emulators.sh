#!/usr/bin/env bash
#
# with-test-emulators.sh "<command>"
#
# Runs <command> (a shell string) with the isolated test Firebase emulators
# (firebase.test.json) available, so you never have to remember to start them
# before an e2e/integration run.
#
#   - If a test emulator is already running (the `npm run firebase:emulators:test`
#     leave-it-up workflow), reuse it — <command> runs directly, emulator is left
#     alone.
#   - Otherwise start a throwaway set via `firebase emulators:exec`, run <command>,
#     and tear them down afterwards (fresh each time, like CI).
#
# Exports the emulator host vars either way so backend Go tests connect to the
# emulator regardless of which path we took. Resolves the repo root from its own
# location, so it works no matter the caller's cwd.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

CMD="${*:-}"
if [ -z "$CMD" ]; then
  echo "usage: with-test-emulators.sh \"<command>\"" >&2
  exit 2
fi

# Ports from firebase.test.json. Backend Go tests read these; the frontend uses
# NEXT_PUBLIC_* instead and ignores them.
export FIRESTORE_EMULATOR_HOST=127.0.0.1:9100
export FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:10109
export PUBSUB_EMULATOR_HOST=127.0.0.1:9106

# firebase-tools lives in the root node_modules; fall back to PATH if absent.
FIREBASE="$ROOT/node_modules/.bin/firebase"
[ -x "$FIREBASE" ] || FIREBASE="firebase"

# A listening Firestore emulator port means one is already up — reuse it. Use `nc`
# rather than bash's /dev/tcp: the emulator binds an IPv6 socket on 127.0.0.1, which
# /dev/tcp misreads (false "down"), which would make us start a second emulator and
# collide on the port.
if nc -z 127.0.0.1 9100 2>/dev/null; then
  echo "[emulators] reusing the test emulator already running on :9100"
  exec bash -c "$CMD"
fi

echo "[emulators] no test emulator detected — starting a throwaway set for this run"
exec "$FIREBASE" emulators:exec \
  --only firestore,auth,pubsub \
  --config firebase.test.json \
  --project hexaverse-emulator \
  "$CMD"
