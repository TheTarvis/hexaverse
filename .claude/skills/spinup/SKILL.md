---
name: spinup
description: Clean-restart the full hexaverse dev stack (firebase emulators, backend, frontend, agent, test emulators). Kills anything on the hexaverse ports (orphans included), then launches everything as GoLand run configurations via the GoLand MCP. Use when the user asks to spin up, start, or restart the dev environment.
---

# Spinup — clean-restart the full dev stack

Kill whatever holds the hexaverse ports (orphaned or healthy — this is a clean restart), then launch every service as a **GoLand run configuration** so each lands in its own IDE Run tab with stop/restart buttons.

## Prerequisites

- GoLand must be open on the hexaverse project (the MCP tools fail otherwise — tell the user to open GoLand if calls error out).
- Load the tool first if deferred: `ToolSearch("select:mcp__goland__execute_run_configuration")`.
- Always pass `projectPath: /Users/travis/Projects/hexaverse`.

## Services and ports

hexaverse runs on Flywheel/Volt ports **+10** (agent is the exception: 8100).

| Run configuration | Readiness ports |
|---|---|
| `firebase:emulators` (dev) | 8090 Firestore (ws 9160), 9109 Auth, 8096 Pub/Sub, 4010 UI (hub 4410, logging 4510) |
| `dev:backend` | 9010 |
| `dev:frontend` | 3010 |
| `dev:agent` | 8100 |
| `firebase:emulators:test` | 9100 Firestore, 10109 Auth, 9106 Pub/Sub (hub 9410, storage 10209; UI disabled) |

## CRITICAL — kill by port, never by name

Flywheel and Volt run the same foundation on the -10 ports (3000, 9000, 8080, ...). A `pkill -f firebase`/`pkill -f uvicorn` would kill their stacks too. Only ever kill PIDs found listening on the **exact** hexaverse ports below. Never touch any other port.

## Procedure

1. **Kill everything on hexaverse ports** (clears orphans; SIGTERM, then SIGKILL stragglers):
   ```bash
   # NOTE: ports inlined in each loop on purpose — zsh does not word-split "$PORTS"
   for p in 8090 9109 8096 4010 4410 4510 9160 9010 3010 8100 9100 10109 9106 4011 9410 10209; do lsof -ti tcp:$p -sTCP:LISTEN; done | sort -u | xargs kill 2>/dev/null
   sleep 2
   for p in 8090 9109 8096 4010 4410 4510 9160 9010 3010 8100 9100 10109 9106 4011 9410 10209; do lsof -ti tcp:$p -sTCP:LISTEN; done | sort -u | xargs kill -9 2>/dev/null
   for p in 8090 9109 8096 4010 4410 4510 9160 9010 3010 8100 9100 10109 9106 4011 9410 10209; do lsof -ti tcp:$p -sTCP:LISTEN >/dev/null && echo "$p STILL HELD"; done; true
   ```
   If a port is STILL HELD after SIGKILL, stop and report it — do not launch on top of it.
2. **Start dev emulators first** (backend depends on them):
   `execute_run_configuration` with `configurationName: "firebase:emulators"`, `waitForExit: false`.
3. **Poll until ready** (typically <5s): loop `nc -z` on 8090 and 9109, ~60s budget.
4. **Start the rest in parallel** (one message, four tool calls, all `waitForExit: false`):
   `dev:backend`, `dev:frontend`, `dev:agent`, `firebase:emulators:test`.
5. **Poll until ready**: 9010, 3010, 8100, 9100 (~90s budget — frontend/agent cold starts are the slow ones).
6. **If a port never comes up**: tail the `fullOutputPath` log file returned by that config's launch and report the actual error. Do not relaunch blindly.

## Report

End with a short table: service, port, status (restarted / FAILED + reason), noting any PIDs that were killed in step 1. Include the dev emulator UI link: http://localhost:4010 (the test emulator UI is disabled).
