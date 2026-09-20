# Testing tiers

The single place that names every test suite in this repo, what it costs, and
when it runs. Agents and delegation prompts cite this file instead of carrying
commands — a command pasted into a prompt is never re-derived by the agent that
follows it, and the two worst hexaverse incidents were an inherited command that
could not pass and a prohibition that outlived its cause.

If a command here stops working, fix it **here** and nowhere else.

## The tiers

| Tier | What it proves | Command | Cost | When it runs |
| --- | --- | --- | --- | --- |
| 0 | Changed-file conventions (test files exist, testids, param helpers, colors) | `python3 .claude/skills/code-quality-checks/check.py --files-only` | seconds | every commit |
| 1 | Unit behaviour, types, lint | `bash .claude/scripts/check.sh` (go vet, `go test -short ./...`, tsc, eslint, vitest) | seconds | every task, every commit |
| 2 | One package against the Firestore emulator | `cd backend && go test ./<pkg>/...` with the test emulator up | seconds to a minute | before the tasks in that package are checked off |
| 3 | Whole backend against the emulator | `npm run test:backend:all` | minutes, grows with every test | **once per change, at archive time** |
| 4 | The player/user journey through the real UI | `cd frontend && npm run e2e` | minutes plus stack boot | **once per change, at archive time** |

Tiers 0 and 1 are the **per-commit gate**. Nothing in the gate boots a stack.
Tier 2 is the **per-task gate** for backend work that touches persistence.
Tiers 3 and 4 are the **archive gate**. They are never a per-task check, never a
"confirming rerun", and never run while anything else edits the tree.

## Rules that keep the tiers cheap

- **Emulator tests never run by accident.** Integration tests call
  `common.SetupFirestoreTestDAO(t)`, which skips under `-short`. The root
  `hexaverse` package's router-level e2e suite (`backend/e2e_main_test.go`)
  also skips without `ENV=TEST` and loopback emulator hosts.
- **The root package's `TestMain` wipes and re-seeds the shared emulator
  project.** That is why tier 3 runs with `-p 1` (the whole module serialised)
  and carries a 90m budget rather than Volt's 30m; it is also why tier 3 and
  tier 4 must never run at the same time. Do not add a second wiping
  `TestMain`: every other package seeds documents under names unique to its
  test file and cleans only those.
- **Fixtures are shared per spec file, not provisioned per test.** Most tests
  need *a* record with *a* related entity, not a uniquely-seeded one. Provision
  once per spec file (Go: a package-level helper guarded by `sync.Once`;
  Playwright: `test.beforeAll`) and reuse it for every test that only reads.
  Provision fresh only in tests that mutate ownership or delete. Per-test
  provisioning is what took hexaverse's backend e2e package from under two
  minutes to over forty in three changes.
- **Never raise a timeout to make a suite pass.** The `-timeout` on
  `test:backend:all` and the Playwright per-test timeout are budgets. A suite
  that overruns is a growing suite; report the overrun and stop. The banner the
  backend command prints on timeout exists so nobody reads a timeout as an
  assertion failure.
- **One emulator project, one suite at a time.** Tier 3 and tier 4 share the
  `hexaverse-emulator` project. Never run them concurrently.
- **Long runs go in the background.** The Claude Code Bash tool kills a
  foreground command at its timeout, and an agent that sees a killed run tends
  to run it again. `.claude/settings.json` raises the default; anything
  expected to exceed five minutes still runs with `run_in_background` and a
  log file.
- **Playwright retries are zero locally.** A hung test fails in one minute,
  not three. CI keeps two retries for dev-server flake.

## The journey spec

Tier 4 is **one journey spec per change**, not one spec per scenario. It walks
the whole slice in order and asserts at every step. Per-scenario and per-edge
coverage lives in tier 1 tests against the component or handler; the journey
exists because the real bugs (a stale list after a state change, a race between
two invalidations) only appear when several steps run in sequence against the
real stack.

- It is written **after every task in the change is checked**, against a UI
  that exists — never in the red phase. Red-phase Playwright written blind was
  half of hexaverse's e2e reds: copy that didn't match, a button that didn't
  exist, a helper that couldn't tell "empty" from "never captured".
- It runs **once**. If it goes red, every finding from that run goes into one
  batched revision round (writer, adversary spot-check, SDET, dev), then it
  runs once more. Never a revision loop per red leg.
- **The tree is locked while it runs.** No developer edits, no `/check`, no hot
  reload. Hot reload during a run produced false reds that cost a full cycle.
- A scenario that can only be proven end to end is recorded in the SDET's
  coverage table as `Playwright, deferred` until the journey covers it, and in
  QA's matrix as `BLOCKED` until the journey runs. Neither is a failure.

## Running a chain

For a sequence of changes, keep a persistent test stack up for the whole chain
so tier 4 skips the boot:

```bash
npm run firebase:emulators:test        # once; auth :10109, firestore :9100
E2E_REUSE_SERVER=1                     # attach Playwright to a long-lived test backend/frontend
```

The per-run wipe still isolates data. Record the wall time of tiers 3 and 4 in
the change's handoff record when it closes (`docs/handoffs/`); an overrun
becomes a task in the next change, not a surprise at link eight.

## Local development

- `npm run firebase:emulators:test` keeps a test emulator up so tier 2 and
  tier 4 attach instead of cold-starting one.
- `/check` runs tiers 0 and 1. Tier 3 is `/check --backend-tests`; tier 4 is
  `/check --e2e`. Neither runs by default, even when an emulator is listening.
