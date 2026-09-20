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

hexaverse runs on Flywheel/Volt ports **+10** (agent is the exception: 20202).

| Run configuration | Readiness ports |
|---|---|
| `firebase:emulators` (dev) | 20212 Firestore (ws 20213), 20211 Auth, 20214 Pub/Sub, 20210 UI (hub 20216, logging 20217) |
| `dev:backend` | 20201 |
| `dev:frontend` | 20200 |
| `dev:agent` | 20202 |
| `firebase:emulators:test` | 20242 Firestore, 20241 Auth, 20244 Pub/Sub (hub 20246, storage 20245; UI disabled) |

## CRITICAL — kill by port, never by name

Flywheel and Volt run the same foundation on the -10 ports (3000, 9000, 8080, ...). A `pkill -f firebase`/`pkill -f uvicorn` would kill their stacks too. Only ever kill PIDs found listening on the **exact** hexaverse ports below. Never touch any other port.

## Procedure

1. **Kill everything on hexaverse ports** (clears orphans; SIGTERM, then SIGKILL stragglers):
   ```bash
   # NOTE: ports inlined in each loop on purpose — zsh does not word-split "$PORTS"
   for p in 20212 20211 20214 20210 20216 20217 20213 20201 20200 20202 20242 20241 20244 20240 20246 20245; do lsof -ti tcp:$p -sTCP:LISTEN; done | sort -u | xargs kill 2>/dev/null
   sleep 2
   for p in 20212 20211 20214 20210 20216 20217 20213 20201 20200 20202 20242 20241 20244 20240 20246 20245; do lsof -ti tcp:$p -sTCP:LISTEN; done | sort -u | xargs kill -9 2>/dev/null
   for p in 20212 20211 20214 20210 20216 20217 20213 20201 20200 20202 20242 20241 20244 20240 20246 20245; do lsof -ti tcp:$p -sTCP:LISTEN >/dev/null && echo "$p STILL HELD"; done; true
   ```
   If a port is STILL HELD after SIGKILL, stop and report it — do not launch on top of it.
2. **Start dev emulators first** (backend depends on them):
   `execute_run_configuration` with `configurationName: "firebase:emulators"`, `waitForExit: false`.
3. **Poll until ready** (typically <5s): loop `nc -z` on 20212 and 20211, ~60s budget.
4. **Start the rest in parallel** (one message, four tool calls, all `waitForExit: false`):
   `dev:backend`, `dev:frontend`, `dev:agent`, `firebase:emulators:test`.
5. **Poll until ready**: 20201, 20200, 20202, 20242 (~90s budget — frontend/agent cold starts are the slow ones).
6. **If a port never comes up**: tail the `fullOutputPath` log file returned by that config's launch and report the actual error. Do not relaunch blindly.

## Report

End with a short table: service, port, status (restarted / FAILED + reason), noting any PIDs that were killed in step 1. Include the dev emulator UI link: http://localhost:20210 (the test emulator UI is disabled).
