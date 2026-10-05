# `add-burn-cost-overlay` — implementation-phase security audit

Audited at `261dc7e` against `a965554`. Code read; nothing run (no suite, no
stack, no `npm audit`: the commit changes no manifest or lockfile).

**Verdict: CLEAR.** No BLOCKER, no MAJOR, no MINOR. The built code matches the
spec-phase SECURITY-CLEAR review; the change adds no security surface.

## Checks, against the code

| Check | Result | Evidence |
| --- | --- | --- |
| Files touched | Three production files, four test files, docs and `tasks.md` only | `git diff --name-only a965554 261dc7e`; no path under `backend/`, `frontend/lib`, `frontend/hooks`, `frontend/app`, `claude-agent/`, `infra/`, no `package.json` or lockfile |
| The overlay's only input | The view's `currentQuote`, reduced to `{ tons, affordable }` | `SystemSpaceView.tsx:1082-1084`. `currentQuote` is `burnPreview.preview && !burnPreview.stale ? burnPreview.preview : null` (`:793`), the same value passed to the panel for the fuel ceiling (`:959`, `SpaceCommandPanel.tsx:148`). The raw `burnPreview.preview` is not read by the new hunk. The strip and gauge receive no `BurnPreview` object |
| Requester's own acting fleet only | Yes | The one `useBurnPreview` call site (`SystemSpaceView.tsx:788`) is keyed on `acting?.id`; `acting` is drawn from `useMyFleets()` only (`:258, :303-309`). The preview route stays own-gated before any solve (`backend/fleet/handler.go:252-256`), unchanged |
| No retained quote after fleet switch or selection replace | Yes | Query key is `(fleetId, selectionKey)` with `gcTime: 0` and no placeholder data (`use-burn-preview.ts:58-70`, `lib/query-keys.ts:60-61`); hook not edited |
| No retained quote after commit or other withholding | Yes | `previewWanted` goes false on `selectionCommitted`, a running mine, lane transit or docked-at-target (`SystemSpaceView.tsx:787`); the hook then returns `preview: null` and removes the query (`use-burn-preview.ts:84-93`) |
| No retained quote after a failed refresh | Yes | A failed refresh sets `stale`, so `currentQuote` is null and `burnCost` is omitted (`:793, :1082`) |
| What reaches the DOM | A two-valued token, two bare markers, clamped geometry | `Gauge.tsx:105` `data-gauge-cost-state` is `'affordable' \| 'unaffordable' \| undefined`, produced by a ternary, so no served string can reach it even if the flag is not a boolean. `:128, :135` markers are `""`. `:129, :136` styles are template strings over `costPct`, which is gated `Number.isFinite && >= 0` and clamped with `Math.min(..., 100)` (`:90-96`), written through React's style object. No text child, no `data-raw`, no numeric attribute, no `dangerouslySetInnerHTML`. All inside the existing `aria-hidden` root |
| No new request | Yes | `Gauge.tsx` and `VitalsStrip.tsx` import no hook, service or `apiClient`; `useBurnPreview(` has one production caller, as before |
| No new consumer of a foreign fleet's data; `acting: Fleet \| null` hole | No new reader | The diff adds no read of `acting` or of the roster. The overlay's denominator is the `capacity` the fuel cell already passed to the gauge; with no served capacity or no fuel entry the gauge is `no-data` and `costDrawn` is false (`Gauge.tsx:90-92`). `<Gauge cost>` is supplied at the fuel cell only; the hold gauge is unchanged (`VitalsStrip.tsx:150`) |
| Existing controls | Not weakened | `SpaceCommandPanel.tsx` and `use-burn-preview.ts` are not in the diff: the fuel ceiling (`maxFuelTons`, `SpaceCommandPanel.tsx:148-162`), the double-submit guard and stale-never-a-cap are as they were. The overlay cannot outlive the ceiling because both read `currentQuote` |

## Tests

The test diff adds no `vi.mock(`, no `.skip` / `.only`, and removes no existing
line. Its only new spy replaces `fetch` with a thrower in the strip test, which
tightens the no-request rule. The new stubs are `mocks.preview` return values on
the pre-existing `@/lib/services` mock; these are component tests in which auth
and ownership were never in play, so nothing masks a control.

Deny-path cover is present: failed refresh withdraws overlay and ceiling
together and a pending refresh after a failure draws neither (burn-preview test,
task 3.4); selection replace and clear (3.5); acting-fleet switch with fleet B's
response held pending (stranding-notice test, task 4.5); exact attribute
allow-lists on the extent and the mark, and no `data-raw` / `data-unit` /
`tabindex` / `role` / `aria-value*` (`Gauge.test.tsx:510-516`).

## Carried forward, not a finding here

The note for link 2b from the spec-phase review stands and is already in task
6.9(c): when 2b mounts the strip against an arbitrary selected entity, its
own-ness deny scenario should also assert no cost extent and no
`data-gauge-cost-state` for a fleet the requester does not own. Today that holds
by the no-data rule, not by an assertion.

## Not checked

No test was executed, so "tests exist" means read, not seen passing. The backend
own-gate was read at the handler, not traced through `commandedFleetId` or
`PreviewOrder`; it is existing behaviour outside this diff. Tasks 6.2 to 6.9
(journey, tiers 3 and 4, archive) are still open and are outside this audit.
