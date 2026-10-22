# Test commands

Run root commands from the repository root; commands beginning with `cd` select
the relevant package.

| Scope | Command | Dependencies |
| --- | --- | --- |
| Edited-file syntax/format | `bash harness/validate-file.sh <path>` | Language tooling when installed |
| Backend/frontend checks and Storybook interactions | `bash harness/check.sh` | Go, Node, installed frontend dependencies |
| Story catalog and reuse | `cd frontend && npm run check:stories` | Frontend dependencies; Audio excluded |
| Story rendering and interactions | `cd frontend && npm run test:stories` | Chromium installed with Playwright; desktop and phone; starts its own test server, no app/emulators |
| Frontend unit tests | `cd frontend && npx vitest run <test-file>` | Frontend dependencies |
| Frontend types | `cd frontend && npx tsc --noEmit` | Frontend dependencies |
| Production action interface | `node harness/utilities/check-hud-actions.cjs` | Frontend TypeScript dependency; `--inventory` also lists dev/unused findings |
| Go unit tests | `cd backend && go test -short ./...` | Go modules |
| Targeted Go integration test | `cd backend && go test -run '^TestName$' ./<package>/` | Test emulators |
| Full Go suite, including router e2e | `npm run test:backend:all` | Emulator wrapper starts/reuses the test emulators |
| Browser tests | `cd frontend && npm run e2e` | Wrapper starts/reuses emulators and boots the test app |
| Python tests | `npm run test:agent` | uv and agent dependencies |
| Python lint/types | `npm run lint:agent` | uv and agent dependencies |
| Imported skill integrity | `python3 harness/update-skills.py check` | Python |
| Optional legacy file conventions | `python3 harness/utilities/code-quality-checks/check.py --files-only` | Relevant language tooling |

`bash harness/check.sh` supports `--backend`, `--frontend`, `--lint`, `--test`
and `--keep-going`. It does not boot emulators. Go emulator helpers skip under
`-short`; the root router suite requires `ENV=TEST` and loopback emulator hosts.

Use the upstream skills to determine the implementation and review loop. These
commands document the available feedback; they do not impose an archive gate,
SDET handoff, or a fixed number of browser tests.

For emulator tests, keep fixtures isolated. `common.SetupFirestoreTestDAO`
uses the shared test project. Register new collections and subcollections in
`common/firestore_test_helpers.go`; the root suite checks for unregistered data.
The root `TestMain` wipes and reseeds the project, so the full backend suite
runs with `-p 1`. Other packages seed unique records and clean only those.
Run full backend and browser suites sequentially because their wrappers share emulator infrastructure.
Use `npm run firebase:emulators:test` to keep test emulators running locally.
See `frontend/e2e/README.md` for browser setup. A timeout is an incomplete run,
not proof of an assertion failure; diagnose it before changing test budgets.


Storybook verification is part of `harness/check.sh` frontend lint/test stages.
Its browser suite runs in-scope stories at 1440 × 960 and 390 × 844, including their
`play` functions; Audio is excluded. Install Chromium with
`cd frontend && npx playwright install chromium` if needed. Some graphics recovery
stories intentionally fail assets/renderers; expected fixture failures are not
production gameplay validation. See [catalog guidance](storybook.md). Do not run
frontend type discovery concurrently with the full unit suite: anti-mirror guards
create and remove temporary TypeScript probes during their test run.
