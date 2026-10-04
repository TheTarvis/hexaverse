# lift-burn-preview-to-view — red coverage (SDET, tasks 1-3)

> Integrity check 2026-10-04: every red status below is now GREEN (tier 1: 126 files / 1740 tests pass). Original red labels kept in parentheses. See lift-burn-preview-to-view-integrity-check.md.

Written against `53bcaf9`, before any production edit. Frontend only, tier 1
(vitest + tsc). No Playwright, no router-level e2e in this phase.

Statuses (docs/handoffs/README.md vocabulary): `assertion-red`, `compile-red`,
`already-green` (a regression guard or a hygiene edit, with why),
`Playwright, deferred`, `reasoned-not-automated`.

Test files (all under `frontend/`):

- **new** `hooks/use-burn-preview.call-site.test.ts` (1.1)
- **new** `components/space/SystemSpaceView.burn-preview.test.tsx` (3.1-3.16)
- **edited** `components/space/SpaceCommandPanel.test.tsx` (1.2-1.7)
- **edited** `hooks/use-burn-preview.test.tsx` (1.8-1.10: three added describes appended; the 12 existing tests untouched)
- **edited, one line each** (2.1): `components/space/SystemSpaceView.test.tsx`, `.render-loop`, `.scan-refetch`, `.scan-settle-announcement`, `.scan-targets-refetch-on-arrival`, `.sighting-log-mount-ordering`, `.sighting-log-no-ghost-reasons` (`.test.tsx`)

Commands (from `docs/testing-tiers.md` / `frontend/CLAUDE.md`), run from `frontend/`:

```bash
npx vitest run hooks/use-burn-preview.test.tsx                       # 1.8-1.10: 6 assertion-red
npx vitest run hooks/use-burn-preview.call-site.test.ts              # 1.1: 2 assertion-red
npx vitest run components/space/SystemSpaceView.burn-preview.test.tsx   # 3.x: 17 assertion-red, 10 guards green
npx vitest run components/space/SpaceCommandPanel.test.tsx           # 1.2-1.7: whole file red (compile + no provider)
npx tsc --noEmit                                                     # 2 errors, both SpaceCommandPanel.test.tsx (props absent)
```

## Observed state against today's code

`npx vitest run` (whole frontend suite): 68 failed | 1672 passed (126 files; 4 files red, all four are mine).
`npx tsc --noEmit`: 2 errors, both in `SpaceCommandPanel.test.tsx` (`preview`/`currentQuote`/... not on `SpaceCommandPanelProps`) — **the type check is red by design** (contract §5.2, §7). eslint on the four test files: clean.

## Proof the tests test something

Scratch worktree (`git worktree`, scratchpad `wt-lift`) with a reference lift applied exactly as contract §1-§3
(never in the shared tree):

- **Green with the lift:** hook + panel + all `SystemSpaceView*` files = 170 passed, 0 failed, tsc clean. So every red test is satisfiable by the contract's shape.
- **Each guard can fail** — a one-term mutation of the reference, run, restored:

| Guard | Mutation | Failed |
| --- | --- | --- |
| 3.6 | drop `!acting.jump` from the flag | 3.6 |
| 3.8 | any attachment withholds (`!!acting?.attachedTo`) | 3.8 (+ 9 others) |
| 3.9 | withholding sticks after the fleet has been docked at the target | 3.9, 3.16 fleet-leaves-host |
| 3.10 | `selection?.bodyId === acting.attachedTo` (absent equals absent) | 3.10 |
| 3.11a | `refetchInterval` doubled | 3.11a (+ existing hook cadence tests) |
| 3.11b | `currentQuote = burnPreview.preview` (stale becomes cap) | 3.11b |
| 3.12 | burning fleet withheld | 3.12 |
| 3.13 | `onRequote={() => {}}` | 3.13 |
| 3.15 | `setAnnouncement` on a new preview | both 3.15 arms |
| 1.6 | pre-lift label rule (`!currentQuote` only) | 4 panel arms + 3.1 |
| 1.7 | panel re-derives `preview && !stale` | 1.7 |

## Scenario → test → level → status

All tests are vitest, tier 1. "view" = `SystemSpaceView.burn-preview.test.tsx`, real view/panel/hook/mine/cancel with the service boundary mocked.
"panel" = `SpaceCommandPanel.test.tsx`; "hook" = `use-burn-preview.test.tsx`; "call-site" = `use-burn-preview.call-site.test.ts`.

### Burn Preview Reflects the Server-Solved Order, Without Committing

| Scenario | Test (file: name) | Level | Status |
| --- | --- | --- | --- |
| Selecting a target shows a preview curve and its figures | call-site: 3 tests (task 1.1) · panel: "Scenario: Selecting a target shows a preview curve and its figures" (migrated, + scale-less SDET-added) · view 3.10 "…(regression guard) parked, attached to nothing: a body, then a point" · hook existing | unit/integration | call-site: 2 GREEN (was assertion-red) (importer is the panel; view has 0 calls), 1 GREEN (guard, was already-green) arm (importer count is 1 today — pins "one", the other two pin "where"); panel: GREEN (was compile-red); view 3.10: GREEN (guard, was already-green) (guard, mutation M4) |
| A burning fleet's re-target is previewed | view 3.12 "…(regression guard)" · hook existing | integration | GREEN (guard, was already-green) (panel flag is `!fleet.jump` today; mutation M7) |
| Clearing the selection clears the preview | hook existing (untouched) · view 3.15a (withdraw by deselecting) | unit/integration | GREEN (guard, was already-green) |
| The preview refreshes on exactly one named interval while shown | view 3.11a (4 calls after 3 intervals, 1 between) · hook existing | integration | GREEN (guard, was already-green) (guard, mutation M5) |
| The refresh interval is defined in exactly one place | `lib/realtime.test.ts` (existing, unchanged) | static | GREEN (guard, was already-green); this change redeclares nothing |
| An unaffordable preview is shown as such | panel (migrated) | unit | GREEN (was compile-red) |
| No preview is requested while a mine holds the movement channel | view 3.1 · view 3.3 (GIVEN of both arms) · view 3.4 (GIVEN) · hook existing "No preview is requested…" | integration | GREEN (was assertion-red) (4 requests across the window today) |
| A mine that starts while a preview is shown withdraws it | view 3.2 (mine committed through the real `mine-button`; read answers) · view 3.5 (second half, read answers a mine) | integration | GREEN (was assertion-red) (figures stay) |
| A mine's completion restores the quote | view 3.3 arm "ETA passes" (asserts zero requests across the mine first) | integration | GREEN (was assertion-red) (on the GIVEN: a request is sent throughout today) |
| A cancelled mine restores the quote | view 3.3 arm "cancelled through the real control" | integration | GREEN (was assertion-red) (same GIVEN) |
| The mine suppression and the burn command's mine gate change together | view 3.4 (steps the coarse tick; at the render Burn enables the request is already sent, the read still reporting the mine) | integration | GREEN (was assertion-red) (a request exists before the ETA today) |
| A mine not yet read costs at most the requests until its read answers | view 3.5 (fleet_b read held pending from mount; ≤ 1 + one per elapsed interval; then answers a mine: figures go, no further request) | integration | GREEN (was assertion-red) (figures stay after the read answers) |
| A fleet in lane transit requests no preview | view 3.6 (roster-chosen fleet; own-fleets read serves `jump`; one hand-off `push('/')`) | integration | GREEN (guard, was already-green) (guard; mutation M1) |
| A fleet docked at its selected target requests no preview | view 3.7, 3 arms: station / lane-gate body / plain body — no request across several intervals, selection unchanged, Burn enabled | integration | GREEN (was assertion-red) ×3 (a request every interval today) |
| A fleet that has left its host previews that host like any other target | view 3.9 "…(regression guard)" (call for the station's body within one interval of the detachment, figures render) | integration | GREEN (guard, was already-green) (guard; mutation M3). Deliberately does not assert "no call before" nor "at the transition" (3.7 and 3.16 own those) |
| Another body or a point is previewed while the fleet is docked | view 3.8 "…(regression guard)" (different body, then a point) | integration | GREEN (guard, was already-green) (guard; mutation M2) |
| A resumed preview presents nothing from before the withholding | hook 1.9: "earlier answer cached" and "request still in flight when the withholding began (response lands while withheld)" · view 3.16: mine ends by ETA / by cancel through the real control / fleet leaves its host (each: request at the transition, no figure/ceiling/stale, Burn in the window sends no `maxFuelTons`) | unit + integration | GREEN (was assertion-red) ×5 (hook ×2: no request at transition; view ×3: figures from before are still shown) |
| A cap rejection landing while the preview is withheld re-quotes nothing | view 3.14 (order held in flight with a cap; selection moves to the host; rejection lands — captured `onRequote` from click time) | integration | GREEN (was assertion-red) (a request is sent for the host today; retry re-quotes) |
| No path sends a preview request while one is withheld | hook 1.8: "retry() sends nothing while commitWouldBeAccepted is false" · "retry captured while enabled, invoked after disabling, sends nothing" (SDET-added arm per contract §5.3) · "retry() sends one while true" · view 3.14 · view 3.1 | unit + integration | hook: 2 GREEN (was assertion-red) (`refetch()` runs on a disabled query), the enabled arm GREEN (guard, was already-green) (the positive control for the red arms); view as above |
| Quote changes are not announced | view 3.15 two arms: preview appears / refreshes / withdrawn by deselecting; withdrawn by a mine becoming known, then the existing "Mining run complete." fires | integration | GREEN (guard, was already-green) (guard; mutation M9) |

### A Failed or Stale Preview Is Never Presented as a Current Quote

| Scenario | Test | Level | Status |
| --- | --- | --- | --- |
| A failed first preview shows a no-quote state, not empty figures | panel (migrated arrange: `previewNoQuote`) · hook existing | unit | GREEN (was compile-red) |
| A failed first preview offers a retry | panel (migrated; asserts `onRequote`) · hook existing | unit | GREEN (was compile-red) |
| A failed refresh marks the shown figures stale | panel (migrated: `currentQuote: null, previewStale: true`) · view 3.11b · hook existing | unit/integration | panel GREEN (was compile-red); view 3.11b GREEN (guard, was already-green) (guard; mutation M6) |
| A later successful refresh clears the stale marking | panel (migrated to a `rerender` with new props) · hook existing | unit | GREEN (was compile-red) |
| The burn stays committable without a quote, labelled as uncapped | panel (migrated) + panel 1.6 available arms (withheld/loading shape, failed shape, stale shape) | unit | GREEN (was compile-red); GREEN (was assertion-red)-under-compile for none (these arms pass once it compiles — they pin 4.3's "must not over-hide" and are the positive control of 1.6) |
| A stale figure never becomes a cap | panel (migrated) · panel 1.7 (`preview` set, `currentQuote` null, `previewStale` false: no ceiling, label shown, no `maxFuelTons`) · view 3.11b | unit/integration | panel: GREEN (was compile-red); 1.7 is GREEN (was assertion-red) under GREEN (was compile-red) (mutation P2 proves it fails when the panel derives currency); view GREEN (guard, was already-green) |
| A failed restoring request is a no-quote state, not a stale one | hook 1.10 ×2 (earlier answer cached / in flight) · view 3.16 "restoring request rejected" | unit + integration | GREEN (was assertion-red) ×3 (no restoring request is sent; nothing is no-quote) |
| A withheld preview is never presented as a failed one | view 3.1 · 3.6 · 3.7 (second arms ×3: previewed body, then the read reports the fleet attached) · 3.14 | integration | 3.1, 3.7-b ×3, 3.14: GREEN (was assertion-red); 3.6: GREEN (guard, was already-green) |
| The uncapped-burn label is never shown beside an unavailable burn command | panel 1.6 ×4 (no selection / no fleet / no canvas / `mineRunning`) · view 3.1 | unit/integration | panel: GREEN (was assertion-red) under GREEN (was compile-red) (mutation P1: pre-lift rule fails 4 arms); view 3.1 GREEN (was assertion-red) |

### Unmodified requirements whose arrange steps were migrated (task 1.4; no assertion changed)

*A Burn Commit Is Quote-Locked…*, *Burn Commit Reports Its Outcome*, *A Commit's Actual Result Is Never Silently Swapped…*, plus the burn-uniformity, jump-commit and canvas describes of `SpaceCommandPanel.test.tsx` — `GREEN (was compile-red)` (whole file). Task 1.5 ("a cap rejection invokes `onRequote` and sends no second order") is the migrated test "A cap rejection re-quotes in flow…", which already asserts both (`onRequote` called; `order.mutate` called once); it is not duplicated. The real-wiring twin is view 3.13 (GREEN (guard, was already-green) guard; mutation M8).

### Task tally

| Task | Status | | Task | Status |
| --- | --- | --- | --- | --- |
| 1.1 | GREEN (was assertion-red) (2 of 3 tests) | | 3.6 | GREEN (guard, was already-green) (guard) |
| 1.2-1.5 | GREEN (was compile-red) | | 3.7 | GREEN (was assertion-red) (6 tests) |
| 1.6, 1.7 | GREEN (was assertion-red) under GREEN (was compile-red) | | 3.8-3.13 | GREEN (guard, was already-green) (guards) |
| 1.8 | GREEN (was assertion-red) (2 of 3) | | 3.14 | GREEN (was assertion-red) |
| 1.9, 1.10 | GREEN (was assertion-red) (4 tests) | | 3.15 | GREEN (guard, was already-green) (guard, 2 tests) |
| 2.1 | GREEN (guard, was already-green) (hygiene) | | 3.16 | GREEN (was assertion-red) (4 tests) |
| 3.1-3.5 | GREEN (was assertion-red) (6 tests) | | | |

Totals: 18 red tasks (1.1-1.10, 3.1-3.5, 3.7, 3.14, 3.16), 8 regression guards (3.6, 3.8-3.13, 3.15), 2.1 hygiene — the contract's §6 arithmetic exactly.
Test-level: view 27 tests = 17 GREEN (was assertion-red) + 10 GREEN (guard, was already-green) (guards; 3.11 and 3.15 have two arms each); hook 7 added = 6 GREEN (was assertion-red) + 1 GREEN (guard, was already-green); call-site 3 = 2 GREEN (was assertion-red) + 1 GREEN (guard, was already-green); panel 43 tests = 43 red today (GREEN (was compile-red) / no provider; 9 of them new in 1.6/1.7).

## Playwright, deferred / reasoned-not-automated

Nothing in the two MODIFIED blocks is un-automatable at tier 1. For the archive-gate journey (contract §8; task 5.3), not covered by tier 1 and
not written here: that the real browser sends one `orders/preview` POST per interval against the real backend, the no-request-and-no-console-error
observation on the docked fleet's own host, and the quote going when a real mine starts. These are `Playwright, deferred`.

## Notes and findings

1. **Test-side correction during red work, not a spec issue.** My first 3.4 asserted the mine countdown still renders after the ETA; `FleetActionsPanel` hides it at the ETA. Removed; the "read still reports the mine" arrangement is by construction (the mocked read keeps answering the mine).
2. **3.15 second arm.** The existing landing announcement ("Mining run complete.") is raised when the view sees a changed own-fleets read (the effect's deps are `[allFleets, runningMine, clock]`), not at the ETA tick itself; the test hands the view a fresh fleets array after the ETA. Existing behaviour, untouched by this change.
3. **Hook identity.** Tests assert no `retry` identity either way (contract §3.1). The 2.1 mocks use `retry: vi.fn()` created per call; they are used only as props.
4. **`SpaceCommandPanel.test.tsx` is wholly red** (43/43), as the contract warned: props do not exist, and the unmocked hook has no provider.
5. **Tier-1 tree state for the developer:** red (68 failing tests in four files, tsc red with 2 errors in the panel test). Nothing between this handoff and tasks 4.1-4.6 is committable (contract §7).
