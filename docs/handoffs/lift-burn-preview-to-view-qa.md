# QA report: lift-burn-preview-to-view (evidence-based, no stack booted)

*Persisted by the orchestrator, verbatim, from QA's returned text (2026-10-04),
against commit `3802b92`. Orchestrator rulings on F1/F2 follow the report.*

Verdict: **SHIP-PENDING-JOURNEY**. 29 scenarios: 29 PASS, 0 FAIL, 0 BLOCKED. Three of the 29 carry a known-drift qualifier (F1 below). Two spec paragraphs with no scenario are INSPECTED.

I ran only tier 1, and all of it was green:
`npx vitest run` on SystemSpaceView.burn-preview, SpaceCommandPanel, use-burn-preview (hook) and use-burn-preview.call-site, plus lib/realtime.test.ts. Result: 5 files, 97 tests passed.

Abbreviations in the matrix:
- **view** = `frontend/components/space/SystemSpaceView.burn-preview.test.tsx` (real view, panel, hook, mine and cancel; only the service layer is mocked; the hook is never mocked).
- **panel** = `SpaceCommandPanel.test.tsx`.
- **hook** = `frontend/hooks/use-burn-preview.test.tsx`.
- **call-site** = `frontend/hooks/use-burn-preview.call-site.test.ts`.
- **ONE** = `expectNothingPresentedAsFailed()` (no no-quote, stale or retry testid).
- **NOFIG** = `expectNoFigures()` (no deltav, arrival, fuel or ceiling testid).

## Acceptance matrix: block 1, Burn Preview Reflects the Server-Solved Order

| # | Scenario | Closing assertion (read in the code) | Verdict |
|---|---|---|---|
| 1 | Selecting a target shows a preview curve and its figures | Request sent: view 3.10, `toHaveBeenCalledWith('fleet_1',{bodyId:OTHER})` then `{point:…}`. Raw values: panel "Selecting a target…" asserts arrival `data-raw='930373'`, `data-unit='world-ms-span-in'`, deltav `data-raw=3721.492`, fuel `data-raw=744.2984`. Served-not-recomputed: panel SDET-added test (lines 183-194) changes only the served numbers. One caller: call-site test, 3 tests, importers equal `[SystemSpaceView.tsx]` and exactly one `useBurnPreview(`. | PASS for the request and the figures. The "returned curve rendered" clause is not closed (F1). |
| 2 | A burning fleet's re-target is previewed | view 3.12: burning fleet, `toHaveBeenCalledWith(...OTHER)`, deltav shown, burn enabled, one call, then 2 calls after one interval. Would fail if `!acting.jump` were replaced by a burn check. | PASS for the request and figures. The "alongside the running burn's own curve" clause is not asserted (F1). |
| 3 | Clearing the selection clears the preview | view 3.15a: re-picking the selection deselects it, `has('preview-deltav')` is false. hook "Clearing…" and "SDET-added: replacing the selection…". | PASS |
| 4 | Refreshes on exactly one named interval while shown | view 3.11a: 1 call, still 1 call at interval minus 1s, exactly 4 after three intervals. "Newest response rendered": view 3.15 (`QUOTE_2` after a refresh) and the hook test. | PASS for cadence and figure update. The curve update is the F1 clause. |
| 5 | Interval defined in exactly one place | `lib/realtime.test.ts` (ran green). The hook imports `PREVIEW_REFRESH_MS`, and the diff adds no literal. | PASS |
| 6 | Unaffordable preview shown as such | panel: `preview-affordable data-affordable='false'` plus a distinct-state assertion. | PASS |
| 7 | No preview while a mine holds the channel | view 3.1: a running mine from the start, select, three intervals, `mocks.preview` not called. The lane-transit half of the WHEN is row 13 (view 3.6). | PASS |
| 8 | A mine that starts while a preview is shown withdraws it | view 3.2: the mine is committed through the real `mine-button`, the refreshed read shows `mine-countdown`, NOFIG, no new calls across three intervals (`toBe(before)`), selection unchanged. | PASS |
| 9 | A mine's completion restores the quote | view 3.3 "eta" arm: GIVEN asserts zero calls first; after the ETA with the read still reporting the mine, `toHaveBeenCalledWith('fleet_1',{bodyId:OTHER})`. | PASS |
| 10 | A cancelled mine restores the quote | view 3.3 "cancel" arm: GIVEN zero calls, click the real `mine-cancel`, the read answers `[]`, the request is sent. | PASS |
| 11 | Mine suppression and the burn gate change together | view 3.4: steps 1s ticks. While burn is disabled there are zero calls. At the first render with burn enabled, `toHaveBeenCalledTimes(1)`, with the read still reporting the mine. | PASS. Granularity is one 1s tick, but nothing else can fire a request there (F6). |
| 12 | A mine not yet read costs at most the requests until its read answers | view 3.5: `fleet_b`'s read is held pending. Calls are at least 1 and at most 1 plus `floor(elapsed/interval)`. Then the read answers a mine, NOFIG, no further calls. The upper bound alone would pass pre-change, but the second AND is red-to-green. | PASS |
| 13 | Fleet in lane transit requests no preview | view 3.6: figures shown, own-fleets read serves `jump`, NOFIG, call count unchanged over three intervals, ONE, `burn().disabled` false, `push('/')` once. | PASS. This is a guard that already passed before the change (mutation M1). In production the view hands off and unmounts. |
| 14 | Fleet docked at its selected target requests no preview | view 3.7, three arms (station, gate body, plain body): three intervals, `preview` not called, selection unchanged, NOFIG, ONE, burn enabled. | PASS |
| 15 | A fleet that has left its host previews that host | view 3.9: after detachment, STATION calls rise within one interval and `preview-deltav` is shown. Also view 3.16 "fleet leaves its host" asserts a request at the transition. | PASS |
| 16 | Another body or a point previewed while docked | view 3.8: docked at STATION, select OTHER and then a point, calls and figures for both. | PASS |
| 17 | A resumed preview presents nothing from before the withholding | view 3.16 ×3 (mine ETA, mine cancel, leaves host): calls equal before+1 at the transition (restoring request held pending), NOFIG, no `preview-stale`, burn enabled, then a Burn click and `'maxFuelTons' in orderRequest()` is false. hook ×2 ("earlier answer cached", "in flight when withholding began"). | PASS |
| 18 | Cap rejection while withheld re-quotes nothing | view 3.14: the commit carries a cap (asserted in the GIVEN), the selection moves to the host, the rejection lands, call count unchanged, NOFIG, ONE. Positive twin 3.13 proves the same rejection re-quotes when not withheld, so 3.14 cannot pass through a dead path. Only the own-host arm is exercised. | PASS |
| 19 | No path sends a preview request while withheld | hook: `retry()` while disabled sends nothing, and a retry captured while enabled then invoked after disabling sends nothing (the `enabledRef` guard). The enabled arm is the positive control. view 3.14 and 3.1 cover the view level. | PASS |
| 20 | Quote changes are not announced | view 3.15 two tests: `space-announcer` text equals baseline across appear, refresh and withdraw by deselect, and across withdraw by a mine. The latter then asserts exactly 'Mining run complete.' once. | PASS |

## Acceptance matrix: block 2, A Failed or Stale Preview Is Never Presented as a Current Quote

| # | Scenario | Closing assertion | Verdict |
|---|---|---|---|
| 21 | Failed first preview shows no-quote state | panel: `preview-no-quote` present; `preview-arrival`, `preview-deltav` and `preview-fuel` absent. hook "A failed first preview…". | PASS |
| 22 | Failed first preview offers a retry | panel: click `preview-retry` calls `onRequote`. hook retry test. | PASS |
| 23 | Failed refresh marks figures stale | panel: `preview-stale` present, `preview-deltav` still present, retry calls `onRequote`. view 3.11b (real refresh rejection). | PASS |
| 24 | Later successful refresh clears stale | panel uses `rerender`: stale present, then after fresh props stale is absent and deltav shows 4444. Both directions are asserted. hook test. | PASS |
| 25 | Burn stays committable without a quote, labelled uncapped | panel 1.6 ×3 available arms (loading, failed first, stale): burn enabled, label present. Plus the earlier migrated test, which asserts no `maxFuelTons` in the order. | PASS |
| 26 | A stale figure never becomes a cap | panel 1.7: `preview` is set, `currentQuote` is null, `previewStale` is false, so no `preview-fuel-ceiling`, label shown, no `maxFuelTons`. This fails if the panel derives currency itself. view 3.11b: stale, ceiling gone, `'maxFuelTons' in orderRequest()` is false. | PASS |
| 27 | Failed restoring request is no-quote, not stale | view 3.16 rejected arm: `preview-no-quote` and `preview-retry` present, `preview-stale` absent, NOFIG. hook ×2. | PASS |
| 28 | Withheld preview never presented as failed | view 3.1, 3.6, 3.7 (both arm sets), 3.14, all via ONE. The mine, lane-transit and own-host arms are each covered. | PASS |
| 29 | Uncapped label never beside an unavailable burn | panel 1.6 ×4 (no selection, no fleet, canvas unavailable, `mineRunning`): `burn-button.disabled` is true and `burn-uncapped-label` is null, with `currentQuote:null` supplied so the pre-lift rule would show the label. view 3.1 is the real mine arm. | PASS |

Unscenario'd paragraphs, INSPECTED:
- "Nothing is withheld merely because an already-answered read is refreshing" and "a later failed refresh leaves its earlier answer standing". Both rest on React Query keeping `data` through a refetch or its failure in `useRunningMine`. No test asserts either.
- The mine and lane-transit suppressions are client-only, not server enforcement. The diff states this in a comment.

## Production diff against the spec

- **Implemented and required:** `previewWanted = !!acting && !acting.jump && !mineRunning && !dockedAtTarget`; `dockedAtTarget` is a body-id comparison, so a point is never a host; a single call site; `currentQuote` derived once and not re-derived in the panel; `burnAvailable &&` on the uncapped label; the hook's `retry` guarded by a live `enabledRef`; discard on disable (`cancelQueries` plus `removeQueries`) plus fetch-at-transition; no new testids. All of this is required by a scenario.
- **Implemented but not required:** nothing. The impact stays within the proposal's three files.
- **Required but not implemented:** only F1.

The two filed records are closed by observable tier-1 tests, with the hook unmocked at the real call site:
- `drift-running-mine-preview-unsuppressed.md`: view 3.1 through 3.5 and 3.16. 3.1 asserts zero calls with the mine known. 3.3 asserts zero calls while mine-held and then a request at the ETA or the cancel.
- `defect-docked-selection-polls-zero-length-preview.md`: view 3.7 ×3 (no request across three intervals). The backend 500 is the one thing tier 1 cannot see, so journey step 4 closes it end to end.

Both records' text still says "open". Task 5.6 (unchecked) has to update them.

## Findings

- **F1 (spec text vs implementation, known drift, not a regression).** The spec's THEN says the "returned curve ... [is] rendered", and scenario 2 says "alongside the running burn's own curve". Nothing draws the preview curve. `drift-preview-curve-never-drawn.md` and design.md list it as a non-goal, and the view tests deliberately do not assert it. Rows 1, 2 and 4 are PASS only for the figures. The orchestrator should confirm the carried clause is accepted as deferred. If it is not, the change owns a FAIL it cannot fix inside its Impact.
- **F2 (carried requirement text, no scenario).** The requirement says the preview SHALL clear "when an order commits". The implementation does not clear it (`drift-preview-does-not-clear-on-commit.md`, design Decision 5, left untouched on purpose). No scenario asserts it. Same class as F1.
- **F3 (undefined state, resolved unsurprisingly).** With the canvas unavailable and a selection held, `previewWanted` ignores canvas availability. The view keeps requesting every interval while Burn is disabled and the uncapped label is hidden. This matches the spec's "only three withheld states", so it is not a violation. It does mean polling a priced endpoint with no consumer able to commit. No view-level test pins it either way.
- **F4 (undefined state).** Docked at the selected target, Burn stays enabled and the uncapped label shows beside it. A commit would be an own-host burn with no cap, which the server rejects with the zero-length 500. The spec says availability is unchanged, so this is as intended, and the label is truthful. It is still a user path to the same 500 and belongs to `followup-explain-withheld-burn-command.md`.
- **F5 (journey race, already J1 in the contract).** At a mine's ETA the restoring request can be refused (`ErrPreviewChannelHeld`), because the preview path settles due burns but not due mines. This is the spec's "failed restoring request" state. The journey must not assert that no-quote never appears there.
- **F6 (test granularity).** View 3.4 proves "at the ETA, same render as the burn gate" only to a 1s coarse tick. Nothing else can fire a request in that window, so this is not a gap.
- **F7 (acting-fleet switch, selection replaced in flight, retry captured then fleet switched).** Read from the code, no spec violation. The query key includes fleetId and selKey, `gcTime` is 0, and the discard effect runs per key. A rejection captured by `onRequote` and invoked after a switch goes through `enabledRef` live, so a switch to a mining fleet sends nothing. Only the own-host arm of the capped-rejection case is tested.
- **F8 (tasks.md).** Tasks 5.1 through 5.7 are unchecked, which is expected at this point. 33 boxes are checked. None of the checked tasks contradicts a failing test, and the integrity check reports CLEAN.

## Journey: steps that corroborate or close real-wire rows

Tier 1 closes every row above. The journey adds end-to-end observation of these, and each step names what it closes:
1. **Step 1**, select a lode and read `preview-arrival`, `preview-deltav`, `preview-fuel` and `preview-fuel-ceiling` `data-raw`. Corroborates row 1.
2. **Step 2**, at least 25s wall, consecutive `orders/preview` POSTs spaced no closer than the interval minus slack, with at least two after the first. Corroborates rows 4 and 5. Do it before any burn. Note J3: under dev StrictMode a first selection that produces two POSTs is a finding, not a tolerance.
3. **Step 3**, re-target mid-burn renders the quote. Corroborates row 2.
4. **Step 4**, docked, own host selected: over at least 2 intervals, zero preview POSTs, zero `orders/preview` responses at 500 or above, no figures, `burn-button` enabled. This is the only real-backend closure of the defect record (rows 14 and 28). Scope the "no 500" assertion to this window only (J2).
5. **Step 5**, start a mine with the station selected: figures go, `mine-countdown` visible, `burn-button` disabled, `burn-uncapped-label` absent, zero preview POSTs until the countdown hides. Corroborates rows 7, 8 and 29. After the countdown the figures may need up to two intervals to return (J1).

The following are tier-1 only and are not reachable in the journey: lane transit, cap rejection, failed or stale states, the pending resumed window, a mine not yet read, the ETA passing with the read still reporting the mine, the fleet leaving its host with the host selected, the announcer, the four non-mine unavailable arms of the uncapped label, and the static guard.

**SHIP-PENDING-JOURNEY**

---

## Orchestrator rulings (2026-10-04)

- **F1, F2 — accepted as deferred, not a FAIL of this change** (`lift-burn-preview-to-view-rulings.md` FULL-AUTO RULING 21). Both clauses are *carried live text* the code already contradicted before this change; neither is introduced or altered by it; each has a filed drift record with an owning link (`drift-preview-curve-never-drawn.md` → link 4; `drift-preview-does-not-clear-on-commit.md` → link 2a-iii).
- F3, F4 → recorded in `followup-explain-withheld-burn-command.md`. F5 → the journey brief. F6–F8 → no action.
