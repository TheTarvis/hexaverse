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

# Reuse only a COMPLETE set (firestore + auth + pubsub all listening). Probing
# only firestore is a trap: a stale partial set (e.g. `--only firestore`) holds
# :9100 without auth/pubsub, and the command below would then run against a
# broken emulator. Use `nc` rather than bash's /dev/tcp: the emulator binds an
# IPv6 socket on 127.0.0.1, which /dev/tcp misreads (false "down").
port_up() { nc -z 127.0.0.1 "$1" 2>/dev/null; }
if port_up 9100 && port_up 10109 && port_up 9106; then
  echo "[emulators] reusing the complete test set already running (firestore:9100 auth:10109 pubsub:9106)"
  exec bash -c "$CMD"
fi

# A partial/stale listener on any test port would make the throwaway start below
# collide. Reap it first (ports are unique per repo, so this never touches
# another project's emulator).
for port in 9100 10109 9106; do
  pids=$(lsof -ti tcp:"$port" 2>/dev/null || true)
  [ -n "$pids" ] && { echo "[emulators] clearing stale listener on :$port"; kill $pids 2>/dev/null || true; }
done

echo "[emulators] no complete test emulator detected — starting a throwaway set for this run"
exec "$FIREBASE" emulators:exec \
  --only firestore,auth,pubsub \
  --config firebase.test.json \
  --project hexaverse-emulator \
  "$CMD"
