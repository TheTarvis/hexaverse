# clear-burn-preview-on-commit — red coverage table

SDET, red phase, 2026-10-04. Frontend only, tier 1 (vitest). No Playwright, no router-level e2e, no stack. Governing text: the delta
(`openspec/changes/clear-burn-preview-on-commit/specs/system-space-view/spec.md`, 54 scenario headings: 21 ADDED, 20 + 9 + 4 MODIFIED),
`tasks.md`, and the impl contract (`clear-burn-preview-on-commit-impl-contract.md`, RULING 16) wherever it is more precise.

Test files (both edited in place; none created):

- `frontend/components/space/SpaceCommandPanel.test.tsx` — 65 tests (was 56): 9 new (tasks 2.1 x2, 2.2 x2 rows, 2.3 x5), 3 existing cases
  edited (the two exact-equality payload assertions gain `selectionKey: 'body:feat-body-3'`, nothing else: 1 + 2 cases).
- `frontend/components/space/SystemSpaceView.stranding-notice.test.tsx` — 62 tests (was 32): 1 harness smoke (task 1.1) + 29 new section-3 cases
  (3.1-3.19, 19 tasks; 3.6 x2, 3.7 x4, 3.11 x2, 3.12 x2, 3.14 x2, 3.15 x3, 3.18 x2 rows) + the 7 re-arranged predecessor tests (4.1, 4.2: 4+3 tests, 9 cases) in place.
  Header comment, harness additions as contract §7.1; `commit()` and `commitAndConfirm()` are not edited.

## Commands (tier 1 per `docs/testing-tiers.md`; per-task scope per `frontend/CLAUDE.md`)

```bash
cd frontend && npx vitest run components/space/SpaceCommandPanel.test.tsx components/space/SystemSpaceView.stranding-notice.test.tsx
cd frontend && npx tsc --noEmit        # clean (0 errors) on the red suite: new props go through the Record spread, nothing new is imported
cd frontend && npx vitest run components/space hooks   # the touched family + hooks: 35 failed (12 panel + 23 view, all listed below), 735 passed, no other file red
```

## State against today's code (the unimplemented tree)

| Group | Result today | Status |
| --- | --- | --- |
| `SpaceCommandPanel.test.tsx` | 12 red / 53 green. Red: 3 edited payload cases (`expected spy to be called with ... selectionKey`) + 9 new (statement null / `aria-describedby` absent / key absent) | assertion-red |
| `SystemSpaceView.stranding-notice.test.tsx` | 23 red / 39 green. Red: 3.1-3.14, 3.16, 3.19 (23 cases). Green: the pre-existing 24 predecessor tests incl. the seven re-arranged, both smoke tests, the guards 3.15 x3, 3.17, 3.18 x2 | assertion-red / already-green |
| Every other test under `components/space` and `hooks` | green, unchanged (35 red in total = 12 + 23) | — |

Every red failed at its first closing assertion on "the statement is shown: expected null not to be null" (view and panel) or on the missing
`selectionKey` in the exact-equality payload (panel 2.2) — i.e. behaviour missing, never a compile error or a harness fault. First-assertion
failures do not by themselves show the *later* assertions can pass, so the whole suite was also run against a scratch reference build (below).

## How the suite was proven (scratch `git worktree`, never this checkout)

A detached worktree of `987ba60` (`.../scratchpad/wt-cbp`, `node_modules` symlinked) with the two test files copied in, and the contract's §1 (panel) and §2
(view) implemented as written. Nothing in the real checkout was touched; no `checkout --`, `restore`, `stash`, `reset` or `clean`.

1. **Reference build:** `tsc --noEmit` clean; panel file 65/65 green, view file 62/62 green. So every red is satisfiable by the contract's build.
2. **The seven re-arranged tests need their re-arrangement:** the predecessor's file as at `987ba60` run against the reference build: 9 cases red,
   exactly the 7 tests of 4.1/4.2 (3.13; 3.14; 3.15 x2; 3.16 x2; 3.17; 3.18 no-quote; 3.18 stale). Repaired, all 9 cases are green on today's code and on the reference build.
3. **Wrong builds (mutants of the reference build)** — what each is killed by:

| Mutant | Killed by |
| --- | --- |
| M1 panel reports a rejected commit to the view (the contract's "reports from `onSettled`"), null instants | guard 3.15 **SDET-added row** (read in flight), 3.16, the predecessor's panel and view 3.15 tests. **Not** by the contract's two 3.15 rows alone — see Deviations 1 |
| M2 handler also calls `setAnnouncement` | guard 3.17, 3.8, predecessor 3.7 (body row) |
| M3 derivation matches the read's burn target instead of the record | guards 3.18 row one **and** row two, 3.6, 3.7 (two rows), 3.12 |
| M4 record outlives the view (a `WeakMap` keyed by the `QueryClient`, standing in for "kept in the query cache") | guard 3.18 row two, predecessor 3.20 |
| M5 record written only for warned commits | 23 cases: 3.1-3.14, 3.16, 3.19 (3.12's unwarned row, not its warned row) |
| M6 same-key bail-out in the handler | 3.5 (only) |
| M7 one shared record, not per fleet | 3.14 row one and row two |
| M8 handler drops every preview entry at acceptance | 3.14 row two, 3.13 |
| M9 clock term (`worldTime < arriveMs`) in the live test | 3.4 |
| M10 key read at response through a ref, not captured at click | panel 2.2 (both rows), 3.13 |
| M15 committed regardless of key equality | 3.11 x2, 3.12 x2, 3.13, 3.16, 3.19 |
| M16 `awaitingRead` dropped | 3.2, 3.3, 3.5, 3.9, 3.10, 3.11 points, 3.12 x2, 3.19 |
| M18 a failed read ends the committed selection | 3.10 |
| M19 stranding notice also tied to key equality | 3.19 |
| Panel: no `aria-describedby` / role=status on statement / Burn not natively disabled / label ignores the prop / figure in the copy / statement gated on selection+fleet+canvas / `aria-describedby` always set | 2.1 a, 2.3 a, 2.1 a, 2.1 a, 2.3 a+b, 2.1 b, 2.1 a |
| Harness (test-side) wrong builds: no `point-2` trigger; `previewCalls` ignores the fleet; `holdPreview` holds nothing; `data-selection-point` always empty | the 1.1 smoke test, each |

## Section 1 — harness (task 1.1)

| Task | Test | Level | Status |
| --- | --- | --- | --- |
| 1.1 | `harness smoke test (clear-burn-preview-on-commit 1.1) > SDET-added: point-2 selects a distinct point, preview requests are counted per fleet and per target, a held preview answers by index` (`stranding-notice.test.tsx`) | integration | already-green (hygiene); shown red against the four harness wrong builds in the table above |

Harness additions (contract §7.1): `mock-select-point-2` and `data-selection-point` on the stage mock; `POINT_2`, `STATEMENT_COPY`, `QUOTE_IDS`; readers
`statement()`, `burn()`, `quoteGone()`, `orderCalls()`, `selectedPoint()`; per-fleet/per-target `previewCalls()` and `P()`; `holdPreview()`, `answerPreview()`,
`rejectPreview()` (`pending.preview`, `Service` gains `'preview'`); `datedAt()`; `commitUnwarned()`, `commitUnwarnedAndConfirm()`; `resetHarness()`.
No `vi.mock('@/hooks/use-fleets')`; `useMyFleets` is the real hook; nothing hand-sets `selectionCommitted` or touches a preview key on the query client (rule 6).

## Section 2 — `SpaceCommandPanel.test.tsx`

| Task | Scenario | Test (describe > it) | Level | Status |
| --- | --- | --- | --- | --- |
| 2.1 a | A committed order removes the quote and withholds the burn command (panel arm) | `... — the panel arm (2.1 a) > ... selectionCommitted true, false and omitted` | unit | assertion-red |
| 2.1 b | same, canvas-unavailable clause | `... (2.1 a) > ... with the canvas unavailable the statement is still shown and the label absent` | unit | assertion-red |
| 2.2 new (x2) | A response that lands after the selection was replaced withholds nothing for the new selection | `... the click-time key (2.2) > ... the payload carries the selection the command was invoked for, a body / a point` | unit | assertion-red |
| 2.2 edits (x3 cases) | same (predecessor tests, `selectionKey` added) | `the commit report (surface-commit-stranding-warning 1.1) > Scenario: A response that lands after the acting fleet changed ...`; `an unwarned commit (... 1.2) > ... absent` and `... false` | unit | assertion-red until 5.1 |
| 2.3 a (x3) | The statement carries no figure and no wire text | `... the panel arm (2.3) > ... the static copy, placed between the selection line and Burn, outside any live region, for a body / a lane gate / a point` | unit | assertion-red |
| 2.3 b | same | `... identical across two different responses and fleets` | unit | assertion-red |
| 2.3 c | same | `... it precedes the stranding and drift notices when all show` | unit | assertion-red |

## Section 3 — `SystemSpaceView.stranding-notice.test.tsx`, `describe('the committed selection (clear-burn-preview-on-commit section 3)')`

Each test sits in a nested `describe('3.n')` and is titled `Scenario: <name verbatim> — <arm>`. Every row asserts its `settled` log.

| Task | Scenario (ADDED, in order) | Rows | Status |
| --- | --- | --- | --- |
| 3.1 | 1. A committed order removes the quote and withholds the burn command (view arm; canvas clause is 2.1 b) | 1 | assertion-red |
| 3.2 | 2. The committed selection holds before any read has answered after the acceptance | 1 | assertion-red |
| 3.3 | 3. A read begun before the commit and answered after it does not end the committed selection | 1 | assertion-red |
| 3.4 | 4. The projected clock passing the arrival does not end the committed selection | 1 | assertion-red |
| 3.5 | 5. Cutting the drive ends the committed selection | 1 | assertion-red |
| 3.6 | 6. A stop ends the committed selection, above or at the speed floor | 2 (different burn, point park) | assertion-red |
| 3.7 | 7. A read reporting the order gone ends the committed selection | 4 | assertion-red |
| 3.8 | 8. Arrival at the selected body hands over to the docked-at-target state | 1 (reference phase + `resetHarness()`) | assertion-red |
| 3.9 | 9. An order that settled inside the commit round trip never shows past the first read | 1 | assertion-red |
| 3.10 | 10. A failed read changes nothing for the quote and the burn command | 1 (five-step walk, all zero-time) | assertion-red |
| 3.11 | 11. Another target is previewed and committable while the committed target stays committed | 2 (bodies, points) | assertion-red |
| 3.12 | 12. A second commit by the same fleet moves the committed selection | 2 (warned, unwarned) | assertion-red |
| 3.13 | 13. A response that lands after the selection was replaced withholds nothing for the new selection | 1 | assertion-red |
| 3.14 | 14. The committed selection follows the fleet | 2 (row one, row two) | assertion-red |
| 3.15 | 15. A rejected or failed commit enters no committed state | 3 (cap, unmapped, SDET-added read-in-flight) | already-green (guard) |
| 3.16 | 16. A rejected commit leaves an earlier committed selection alone | 1 | assertion-red |
| 3.17 | 17. The committed selection is silent | 1 | already-green (guard) |
| 3.18 | 18. A burn this view did not commit is previewed | 2 (opened on a burn, remount) | already-green (guard) |
| 3.19 | 19. One order, two consumers | 1 | assertion-red |
| — | 20. The statement carries no figure and no wire text | panel 2.3 a/b/c (no view test: the copy, the DOM order and the live-region exclusion are the panel's) | assertion-red (panel) |
| — | 21. Keyboard focus survives the burn command becoming unavailable | none at tier 1 (jsdom cannot judge the browser's focus fix-up for a natively disabled control) | **Playwright, deferred** to the keyboard leg of the 7.3 journey |

The real-wire instants equality (the server's `DepartMs`/`ArriveMs` on the order response equalling those on the next read) is likewise
**Playwright, deferred** (7.3): at tier 1 the mocked service returns whatever instants the test writes.

Scenario numbers follow the delta's heading order (`spec.md:148-290`); every one of the 21 ADDED scenarios has a row above.

### Guards: how each was shown red (RULING 13; contract §12 item 3, §7.2 rule 9)

The three guards are green before section 5 by design and assert only absences and availability, so they were shown red against a named wrong build:

| Guard | Wrong build | Observed |
| --- | --- | --- |
| 3.15 | panel reports the rejection to the view (`onCommitAccepted` from `onError`, null instants) | **green** on the contract's two rows; red on the SDET-added third row (own-fleets read in flight); also red in the predecessor's two panel tests and view 3.15 and 3.16 |
| 3.17 | handler also calls `setAnnouncement` | red (the three live-region readings differ) |
| 3.18 row one | derivation matches the read's burn target | red (statement shown on a burn this view did not commit) |
| 3.18 row two | record outlives the view (kept outside component state, keyed by `QueryClient`) | red (statement shown after the remount) |

3.17's "statement present at the second reading" is carried by 3.5, which shares the arrangement.

## Section 4 — the seven re-arranged predecessor tests (4.1, 4.2); all `already-green` and stay green; each shown red un-repaired against the reference build

Titles, scenarios and every assertion are unchanged. Lines inserted or moved (file `SystemSpaceView.stranding-notice.test.tsx`; 1 line = one added statement):

| Task | Test (predecessor numbering) | Change |
| --- | --- | --- |
| 4.1 | 3.13 later unwarned commit | + `await click(\`mock-select-${HOST}\`)` before the second `click('burn-button')`; the second response fixture now names `HOST` |
| 4.1 | 3.14 second warned commit | same insertion; the second response and the second order's read fixture name `HOST` |
| 4.1 | 3.15 rejected commit, two rows | same insertion (the default preview mock quotes `HOST`, so the cap row's re-quote is reachable) |
| 4.1 | 3.16 control leg, two rows | same insertion before the control leg's `click('burn-button')` |
| 4.2 | 3.17 preview's own stranding line beside the notice | + `click(mock-select-HOST)` after the confirming read and before the `preview-stranding` assertions |
| 4.2 | 3.18 no-quote | + the same click after `commit()` and before `preview-no-quote` |
| 4.2 | 3.18 stale | **re-ordered, not inserted** (contract §8, §12 item 1): mount, answer, select `OTHER`, `preview-deltav` (GIVEN), Burn, `answerOrder(0, warned)`, select `HOST`, `preview-deltav` for it, then reject the mock, `flush(PREVIEW_REFRESH_MS)`, `preview-stale` (GIVEN), the notice, `preview-stale` again. All four original assertions survive |

## Every scenario of the MODIFIED blocks (33): carried by existing tests that stay green; none is edited

No MODIFIED scenario needed a new tier-1 test beyond the ADDED requirement's (tasks.md header). Tests named are pre-existing and are verified by 7.1 with no edit;
today they are green and `tsc` is clean, and the run above shows nothing outside the two touched files red.

| Requirement | Scenarios (delta headings) | Existing tests | Status |
| --- | --- | --- | --- |
| Burn Preview Reflects the Server-Solved Order, Without Committing (20) | Selecting a target shows a preview curve and its figures; A burning fleet's re-target is previewed; Clearing the selection clears the preview; The preview refreshes on exactly one named interval while shown; The refresh interval is defined in exactly one place; An unaffordable preview is shown as such; No preview is requested while a mine holds the movement channel; A mine that starts while a preview is shown withdraws it; A mine's completion restores the quote; A cancelled mine restores the quote; The mine suppression and the burn command's mine gate change together; A mine not yet read costs at most the requests until its read answers; A fleet in lane transit requests no preview; A fleet docked at its selected target requests no preview; A fleet that has left its host previews that host like any other target; Another body or a point is previewed while the fleet is docked; A resumed preview presents nothing from before the withholding; A cap rejection landing while the preview is withheld re-quotes nothing; No path sends a preview request while one is withheld; Quote changes are not announced | `SpaceCommandPanel.test.tsx`, `SystemSpaceView.burn-preview.test.tsx` (unedited; it mocks `useMyFleets`), `hooks/use-burn-preview.test.tsx`, `use-burn-preview.call-site.test.ts`, `lib/realtime.test.ts`. The "resume rule" and "no request while withheld" are inherited by construction (`use-burn-preview.ts` is generic over its flag) and are exercised for the committed flag by 3.1, 3.4, 3.5, 3.7, 3.10 | already-green (carried) |
| A Failed or Stale Preview Is Never Presented as a Current Quote (9) | A failed first preview shows a no-quote state, not empty figures; ... offers a retry; A failed refresh marks the shown figures stale; A later successful refresh clears the stale marking; The burn stays committable without a quote, labelled as uncapped; A stale figure never becomes a cap; A failed restoring request is a no-quote state, not a stale one; A withheld preview is never presented as a failed one; The uncapped-burn label is never shown beside an unavailable burn command | `SpaceCommandPanel.test.tsx`, `use-burn-preview.test.tsx`, `SystemSpaceView.burn-preview.test.tsx`, `fleet-service.space.test.ts`. For the edited clause (the label never beside a committed Burn): panel 2.1 a (label absent with the prop, present without), view 3.1 and 3.5 (label absent while committed, present while the post-cut request is pending), 3.8 (label as in the docked state) | already-green (carried) + assertion-red (new clauses, in 2.1/3.1/3.5/3.8) |
| Burn and Jump Commit Controls Guard Against Double-Submit (4) | A double-click yields exactly one burn order; Two activations in one tick submit one burn order; A double-click yields exactly one jump order; The guard releases when the request settles or fails | panel burn/jump double-click tests in `SpaceCommandPanel.test.tsx`, `use-scan-double-submit.test.tsx`; `e2e/tests/space-double-submit.spec.ts` (tier 4, not run here). The edited body of "The guard releases..." is carried by those plus 3.1 (Burn stays disabled after the request settled, sends no order) and 3.12 (a new command on another selection submits) | already-green (carried) |

## Deviations from the contract

1. **Guard 3.15 gains a third, SDET-added row** (own-fleets read in flight at the rejection). The contract's two rows (mount, answer, select, Burn, reject with the read idle) cannot fail the contract's named wrong
   build: a panel that reports a rejection stores `readsAtAcceptance: null` when the read is idle and null instants, so nothing is held. Observed: M1 leaves both contract rows green. The added row passes today and on
   the reference build and fails M1. The contract's two rows are unchanged. No spec conflict.
2. 3.14 row one: the asserted `P(b, OTHER)` is held equal to the snapshot `pb`; the test does not assert `pb` is 2 (the contract's by-reading claim that the entry is dropped when B stops acting) — it asserts only that the count does not move after B's commit.
3. 4.1's 3.14 and 3.13 fixtures: both the accepting response and the later read name `HOST` (the contract names the read fixture; the response was changed too for consistency; the record compares instants only, so either passes).
4. §12 items 1-6 were followed as the contract settles them; §12 item 7 (the two missing count-window cautions) was derived from the contract's §9.1/§9.2 as written. No spec conflict was found.

## Mutation controls — notes for the developer

- 3.5, 3.12 and 3.14 row one are where an unwarned-only record, a same-key bail-out and a single shared record fail (contract §15 item 1); this was observed (M5, M6, M7).
- The derivation must not be memoised and must not move below the `useBurnPreview` call (§15 item 2); a clock term fails 3.4 (M9).
- `use-fleets.ts` callback order is guarded by 3.3 (both the new call and the unchanged screen).
- `SystemSpaceView.burn-preview.test.tsx` is untouched and, in this tree, green.
