# surface-commit-stranding-warning — suite integrity check

Result: CLEAN.

Manifest: `bash harness/openspec-red-manifest.sh verify surface-commit-stranding-warning` ->
`all 2 test file(s) unchanged since handoff`.

Suite (tier 1, `cd frontend`): `npx vitest run components/space/SystemSpaceView components/space/SpaceCommandPanel components/space/FleetActionsPanel hooks`
-> 26 files, 355 tests passed, 0 failed. Grep of both handed-over files for `.skip/.only/.todo/xit/xdescribe`: none.
`npx tsc --noEmit`: 0 errors. `npx eslint components/space`: clean. Tier 2/3/4 not run (not applicable / archive gate).
Working tree: only the two production files, `tasks.md` (developer's checkboxes) and my two test files differ; no hook, service, type or backend file edited (diff of the two production files: +79/-2).

Production diff read against the tests:
- Matches contract §1-§2 line for line (record, handler `[qc]`, render-time derivation, no memo/effect/timer, props passed). `previewWanted`/`useBurnPreview` lines untouched.
- No scenario is green for a foreign reason: the mutation controls in the red-coverage table (run on the same logic) each kill the relevant tests.
- Coverage gap, deliberate and low value: the handler's `answered ? null` branch (query `idle`+`success` at acceptance) is unreachable in the harness because `useOrder`'s invalidation always starts a read first; the shipped code stores `null`, so the gap is closed and only the running-burn rule can show the notice. Unreachable in production too (contract §3 item 5), so no row added; a mutant deleting the branch would survive.
- Also untested by design: relative order of the success toast, warning toast and callback (contract §1.3), and the undefined-query-state case.
- Findings: none blocking.

## Baseline re-recorded (ruling 16)

After the CLEAN verdict above, the two test files were revised by the SDET under FULL-AUTO RULING 16 (one assertion added to each; see the red-coverage table's revision section) and `harness/openspec-red-manifest.sh record surface-commit-stranding-warning` was re-run, so the baseline now hashes the revised files. Tier 1 group: 357 passed.
