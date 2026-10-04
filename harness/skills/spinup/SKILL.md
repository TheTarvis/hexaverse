---
name: spinup
description: Clean-restart this checkout's dev stack (Firebase emulators, backend, frontend, agent, and test emulators) in GoLand Run tabs. Use for /spinup, $spinup, or a request to start or restart the local dev environment.
---

# Spinup — restart the dev stack in GoLand

Run this workflow from the target repository root. `$startup` uses this same
workflow through `harness/skills/startup/SKILL.md`. Keep the procedure here so
Claude Code and Codex share one implementation.

## Preflight

1. Read the project's root `CLAUDE.md` and resolve its absolute repository root.
   Pass that root as `projectPath` on every GoLand MCP call.
2. Discover the available GoLand `get_run_configurations` and
   `execute_run_configuration` tools. Claude Code can use ToolSearch when
   deferred; Codex uses its available tool discovery or exposed MCP tools.
   These are MCP capabilities, not shell commands. Claude settings do not
   configure Codex's MCP connections.
3. Call `get_run_configurations` for this project before stopping processes.
   Confirm these configurations exist: `firebase:emulators`, `dev:backend`,
   `dev:frontend`, `dev:agent`, and `firebase:emulators:test`.
   If the MCP is unavailable, the project is not open in GoLand, or a required
   configuration is missing, report the specific blocker before killing
   anything. Preserve IDE Run tabs; do not silently switch to shell servers.
4. Read current ports with `python3 harness/ports.py show` and
   `python3 harness/ports.py env`. The latter provides shell assignments; use
   `eval "$(python3 harness/ports.py env)"` in an explicitly selected Bash shell
   when shell variables are needed. Do not use stale hardcoded ports or paths.
5. Read `package.json`, `firebase.json`, and `firebase.test.json` to identify
   the emulators actually launched by each configuration. A port in the lane
   table alone does not mean a service is enabled. Check only enabled
   emulators; Chartz uses Postgres and has no Firestore emulator.

## Stop the services being restarted

Build an exact port list from `$PORT_FRONTEND`, `$PORT_BACKEND`, `$PORT_AGENT`,
and both sets of enabled emulator ports, including their UI (when enabled),
hub, logging, and Firestore websocket ports (when Firestore is enabled).
The Firebase hub and logging ports come from the lane even if implicit in
the Firebase configuration. Verify every selected port belongs to this
checkout's lane. Do not sweep every allocated port: database containers,
Storybook, and test fixture servers are separate dependencies or workflows.

Survey listeners with `lsof -nP -iTCP:<port> -sTCP:LISTEN` and inspect the
holder's command and working directory. If a holder clearly belongs to
another project, stop and report the conflict. Never kill by process name.

Deduplicate listener PIDs, record them for the report, send SIGTERM, and wait
two seconds. Recheck the selected ports and send SIGKILL only to confirmed
remaining service listeners. Skip empty PID lists. Use Bash arrays with
`"${ports[@]}"` and `"${pids[@]}"` (or iterate individual lines); zsh does not
word-split a string containing ports. Recheck again and stop if any selected
port is still held. Do not launch over a surviving listener.

## Launch and verify

1. Ensure any database dependency required by the backend is ready. For a
   Postgres checkout, use its existing `Local Dev` GoLand configuration if
   needed and verify `$PORT_POSTGRES`; leave a healthy database running.
2. Launch `firebase:emulators` with `waitForExit: false`. Retain the returned
   `fullOutputPath` for diagnostics. Poll each enabled dev emulator's service
   port with `nc -z localhost <port>` for up to 60 seconds before launching
   dependent services. A failed dependency stops dependent launches.
3. Launch `dev:backend`, `dev:frontend`, `dev:agent`, and
   `firebase:emulators:test` in parallel using the current client's tools.
   Pass `waitForExit: false` and the same `projectPath` for each launch.
4. Poll `$PORT_BACKEND`, `$PORT_FRONTEND`, `$PORT_AGENT`, and every enabled
   test emulator's service port for up to 90 seconds. Use short polling calls
   so progress updates remain possible. A successful launch response alone
   does not prove readiness.
5. For a launch error or readiness timeout, read that configuration's
   `fullOutputPath` and report the actual error. Do not relaunch blindly.

Report a short service/port/status table, any killed PIDs, and failures with
their reasons. Include the resolved dev emulator UI URL when enabled, and
the test UI URL only when `firebase.test.json` enables it.
