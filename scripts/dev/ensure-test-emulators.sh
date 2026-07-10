#!/usr/bin/env bash
#
# ensure-test-emulators.sh
#
# Makes sure the isolated test Firebase emulators (firebase.test.json) are up,
# then exits. Unlike with-test-emulators.sh it does not wrap a command, so it
# works as an IDE before-launch task or a Makefile prerequisite:
#
#   - If a COMPLETE test emulator set (firestore + auth + pubsub) is already
#     listening, reuse it and exit immediately.
#   - Otherwise start one detached with --project hexaverse-emulator (REQUIRED:
#     without it the auth emulator namespaces users under the firebase CLI's
#     active project alias and e2e auth setup fails), wait for all three ports,
#     and exit leaving it running so the next run reuses it.
#
# All three ports are probed, not just firestore: a stale partial set (e.g. one
# started with `--only firestore`) holds :9100 but no auth/pubsub, and e2e
# globalSetup checks every port — so a firestore-only listener must NOT count as
# "up". A partial set is reaped before a clean start.
#
# Stop it later with: cd backend && make stop-emulators
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

# Ports from firebase.test.json.
FIRESTORE_PORT=9100
AUTH_PORT=10109
PUBSUB_PORT=9106

# Use `nc` rather than bash's /dev/tcp: the emulator binds an IPv6 socket on
# 127.0.0.1, which /dev/tcp misreads as "down".
port_up() { nc -z 127.0.0.1 "$1" 2>/dev/null; }
all_up() { port_up "$FIRESTORE_PORT" && port_up "$AUTH_PORT" && port_up "$PUBSUB_PORT"; }
any_up() { port_up "$FIRESTORE_PORT" || port_up "$AUTH_PORT" || port_up "$PUBSUB_PORT"; }

# Kill whatever is holding the three test ports (repo-safe: ports are unique per
# repo, so this never touches another project's emulator). SIGTERM, wait, then
# SIGKILL any survivor.
reap_test_ports() {
  for port in "$FIRESTORE_PORT" "$AUTH_PORT" "$PUBSUB_PORT"; do
    pids=$(lsof -ti tcp:"$port" 2>/dev/null || true)
    [ -n "$pids" ] && kill $pids 2>/dev/null || true
  done
  for _ in $(seq 1 10); do any_up || return 0; sleep 1; done
  for port in "$FIRESTORE_PORT" "$AUTH_PORT" "$PUBSUB_PORT"; do
    pids=$(lsof -ti tcp:"$port" 2>/dev/null || true)
    [ -n "$pids" ] && kill -9 $pids 2>/dev/null || true
  done
}

if all_up; then
  echo "[emulators] reusing the complete test set already running (firestore:$FIRESTORE_PORT auth:$AUTH_PORT pubsub:$PUBSUB_PORT)"
  exit 0
fi

if any_up; then
  echo "[emulators] a partial/stale test emulator is holding some ports — clearing it before a clean start" >&2
  reap_test_ports
fi

# firebase-tools lives in the root node_modules; fall back to PATH if absent.
FIREBASE="$ROOT/node_modules/.bin/firebase"
[ -x "$FIREBASE" ] || FIREBASE="firebase"

LOG="$ROOT/backend/emulator.log"
echo "[emulators] no complete test emulator detected — starting a detached set (log: $LOG)"
nohup "$FIREBASE" emulators:start \
  --only firestore,auth,pubsub \
  --config firebase.test.json \
  --project hexaverse-emulator \
  >"$LOG" 2>&1 &

for _ in $(seq 1 60); do
  if all_up; then
    echo "[emulators] up — firestore:$FIRESTORE_PORT auth:$AUTH_PORT pubsub:$PUBSUB_PORT"
    exit 0
  fi
  sleep 1
done

echo "[emulators] timed out waiting for emulator ports; last log lines:" >&2
tail -n 40 "$LOG" >&2
exit 1
