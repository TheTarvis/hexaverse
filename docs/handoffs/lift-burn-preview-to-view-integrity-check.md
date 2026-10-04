# lift-burn-preview-to-view - suite integrity check (SDET, post-development)

Verdict: CLEAN

- Manifest: `lift-burn-preview-to-view: all 11 test file(s) unchanged since handoff`
- Tier 0 (`check.py --files-only`): 20/20 passed, 0.5s.
- Tier 1 (`bash harness/check.sh`): exit 0; eslint/tsc clean; vitest 126 files / 1740 tests passed.
- No `.skip/.only/.todo/xit` in the 11 test files (one grep hit is prose inside a message string).
- Production diff: only SystemSpaceView.tsx, SpaceCommandPanel.tsx, use-burn-preview.ts (all in proposal Impact); tasks.md also edited. No NODE_ENV or test-only exports.
- View calls useBurnPreview once, flag = design.md `previewWanted` expression verbatim (with `dockedAtTarget`). Panel no longer imports the hook; takes preview/currentQuote/previewStale/previewNoQuote/onRequote props; `burnAvailable &&` gates the uncapped label.
- Hook implements retry guard (enabledRef) and discard/cancel on disable (cancelQueries + removeQueries in effect) in production code.
- Coverage table statuses flipped red -> GREEN in place. Findings: none. Post-handoff test changes: none.
