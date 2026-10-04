# clear-burn-preview-on-commit — suite integrity check

SDET, post-development, 2026-10-04. Tier 1 only (vitest); no stack, no Playwright, no tier 3/4.

Verdict: CLEAN

## 1. Manifest
`bash harness/openspec-red-manifest.sh verify clear-burn-preview-on-commit`
-> `clear-burn-preview-on-commit: all 2 test file(s) unchanged since handoff` (SpaceCommandPanel.test.tsx, SystemSpaceView.stranding-notice.test.tsx). No modified, deleted or added test file.

## 2. Counts
`npx vitest run` on the two files: 2 files, 127 passed (127), 0 failed. Panel 65, view 62, matching the handoff. No skipped/todo (verbose log has none); grep for `.only/.skip/.todo/xit/xdescribe` in both files: none.

## 3. Production diff (`git diff 987ba60 -- frontend`)
Production edits are SpaceCommandPanel.tsx and SystemSpaceView.tsx only; the other two changed frontend files are the manifest-covered tests. Nothing outside the contract §3 fence (use-fleets, use-burn-preview, space-selection, lib/**, backend, catalyst, FleetActionsPanel all untouched).
- Panel: matches §1.3/§1.4 exactly (click-time `selectionKey(selection)` captured beside `quoted`, added last in the payload; `useId`, prop default false, statement, disabled term, aria-describedby only when committed; copy constant at module scope).
- View: `WarnedOrder`/`warnedOrders`/`setWarnedOrders` fully replaced (no residue anywhere under components/hooks/lib/app); handler is branch-free and `[qc]`-only, now records every accepted commit; derivation block moved above `previewWanted` in the contract's exact shape, plain consts, no clock/memo/effect; `previewWanted` gains exactly one term; the `useBurnPreview` call, `currentQuote`, landed-resolution effect, wallMsUntil sites, scan block and refetch rules are not in the diff.
- Reached by wiring (lesson one): `selectionCommitted` is passed to the panel (`selectionCommitted={selectionCommitted}`) and used in the disabled term, burnAvailable, and the previewWanted flag; `commitStrandingNotice` still passed; `statementId` consumed by the aria-describedby; `selectionKey` payload field is consumed by the record. No dead derivation. No line exists solely for a test.
- Observation, not a defect: `burnAvailable` also gained the term (panel's own guard), consistent with the contract's disabled-term section.

## 4. Mutants against the built code (scratch copy under the scratchpad, node_modules symlinked; the checkout was not touched)
Baseline in the copy: 127 passed.
- M1 drop `!selectionCommitted` from `previewWanted`: 14 failed (3.1, 3.2, 3.4, 3.5, 3.6 ...). Killed.
- M2 `selectionCommitted = orderLive && !!order` (ignore key comparison): 16 failed (3.13-3.16 ...). Killed.
- M3 drop `|| selectionCommitted` from the Burn `disabled` term: 15 failed (panel 2.1 a, 3.1-3.6 ...). Killed.

## 5. Post-handoff test changes by SDET
None. Production defects found: none.
