# Link 9 `delete-the-lattice` — adversary round 3 + orchestrator rulings

Re-verify of round 2's repairs (`link9-adversary-r2.md`): 11 of 12 land correctly. The
twelfth (B3, the 1.1 grep) was repaired into a NEW dirty state — the rewrite dropped the
predecessor's "from a non-deleted path" filters, so `lib/board` importing `lib/polar` now
trips the gate the change exists to delete. Verdict: **NOT CLEAR** — 1 blocker, 1 major,
3 minors, all in revised text.

## Orchestrator rulings — ALL FIVE ACCEPTED, apply each paste-ready fix exactly

| # | Ruling |
| --- | --- |
| B3-R | Replace task 1.1 with the pasted form (import-only AND excluding `frontend/lib/board/` and `frontend/lib/polar/`); 6.1 inherits it. |
| M1-R | Replace 10.1c's exemption sentence with the pasted form (backend + frontend price-board hits, the two filename matches, and `mock-system.ts:235`'s genuine `board.GateRing` citation to rewrite). |
| minor 1 | 2.1b cites `model.go:195-199`. |
| minor 2 | 6.3 also names the two `it()` titles at `lib/query-keys.test.ts:19,28`. |
| minor 3 | 10.3c records the two `docked-fleet-actions` "board feature id" residues (`:155`, `:316`) as accepted vocabulary residue. |

Round 4 is a re-verify of these five areas only.

## The adversary's report, verbatim

## Round-3 verification report — `delete-the-lattice`

`git status openspec/changes/delete-the-lattice` at start and at end were identical (`design.md`, `proposal.md`, `specs/system-interior/spec.md`, `tasks.md` modified; `specs/system-space-view/` untracked). **No change happened under me.**

### Repair verification — 11 of 12 rulings land correctly

| Ruling | Verdict |
| --- | --- |
| **B1** | **Correct.** `/Users/travis/Projects/hexaverse/openspec/changes/delete-the-lattice/specs/system-space-view/spec.md` lines 3–201 diffed byte-for-byte against live lines 33–231: the **only** delta is the 4-line station bullet, replaced with the ruling's paste verbatim. All 15 scenario headings identical (md5 `f7a1695d…` both sides). `system-space-view` is in the proposal's modified table (`proposal.md:122`) and in Impact (`:156`). 8b's `system-space-view` delta confirmed `## ADDED Requirements` only (14 ADDED requirements, none named *System Space View Route and Data Fan-In*), and 8b's `action-dispatch` delta MODIFIES *Exactly-Once Resolution* / *Inbox by Actor Query Param* while link 9's MODIFIES only *Commit Rejects Non-Primitive Action Parameters* — no drift, exactly as 11.4 now states. |
| **B2** | **Correct.** 2.1b present (`tasks.md:45-50`); `SystemInterior.Radius` is at `backend/system/model.go:190` as cited. 2.7 names both callers; `backend/fleet/fuel.go:126` is `gates, err := gs.LaneGates(ctx, systemID, s.params.BoardRadius)` and `backend/system/handler.go:115` is `gates, err := h.svc.LaneGates(ctx, systemID, gen.Interior.Radius)` — both exact. Bonus: 2.1b's grep pattern (`si\.Radius`) also catches the third reader I found, `backend/system/service.go:249` `sched := board.Schedule(si.Radius)`, which task 2.3 removes with `featureRingOK`. |
| **B3** | **FAILS — see BLOCKER below.** |
| **M1** | **Correct, with one gap (MAJOR below).** 10.1c present. All nine cited sites verified line-exact: `action/params_validator.go:7,15`; `space/params.go:41`, `space/burn.go:11`, `space/helpers_test.go:79`, `space/params_test.go:28,63`; `fleet/resolver.go:26`, `fleet/model.go:162`. The backend `market` exemption is **exactly right**: every `board.*` hit in `backend/market` is `board.Venues` (×7) or `board.RefreshCadenceMs` (×1), all in `market/board_integration_test.go` — no third symbol, no over-catch. |
| **M2** | Correct — 4.2 pattern is now `'OrbitBasePeriod\|OrbitPeriod'`, and 4.2b lists `fleet/params.go:11-14` and `fleet/resolver_test.go:23`. |
| **M3** | **Correct.** 6.3's appendix matches the paste; all cited sites verified (`use-system-space.ts:21`, `use-fleets.ts:32,115`, `query-keys.ts:33,37,38`, three test files). **No 8b collision**: 8b task 4.7 adds only `queryKeys.sightings` and `queryKeys.fleets.scanTargets(fleetId)`; `systemSpace` is unclaimed, and `queryKeys.system` (health probe) still differs from `['systemSpace']`. |
| **M4** | Correct in both places — `specs/system-interior/spec.md:53-59` and `tasks.md:132-138`, both on pairwise differences with the `c + k·(SubTurn/16)` counterexample. |
| **M5** | Correct. `TestInteriorRead_NoLatticeFieldTypeSurvivesOnTheWireDTOs` is at `backend/system/interior_wire_lattice_removal_test.go:192`, file is 223 lines (`192-223` exact); the sibling at `:71` is kept; 10.2's allow-list is narrowed to that one function name. |
| **N1–N6** | All applied. 4.5 drops the second file (`find backend -name 'interior_additive*'` — the file exists as an *untracked new* test at `backend/interior_additive_wire_e2e_test.go` per `git status`, but it does **not** import `board`, so 4.5's claim holds). Importer count six verified by census: `system/{fog_source,generator,model,service}.go`, `stations/{placement,service}.go`, with `system/generator.go`+`system/service.go` also importing `polar` — proposal text is exact. `check-mirror-map.sh` citations verified at `:365`, `:371`, `:406`. "Six of its seven" verified by parse (live retrograde requirement = 7 scenarios, ADDED = 6); the two neighbouring "Five of its six" notes also verify (6 live each). 11.4 repointed. 7.5 names `UPDATE_FIXTURES=1` (`system/fixtures_test.go:711`) and 7.6 names both targets. |
| **O1** | Correct. `frontend/app/spike/space-3d/page.tsx:13` = `// Like the webgl-board bench, the GL world only mounts once the stage`; `page.test.tsx:7` = `// exercised without a GL context, same trick as the webgl-board bench.` Both named by line in 6.3b. |

**Counts reconcile:** proposal "Modified (nine)" = 9 table rows = 9 delta directories; + retired `board-tactical-math` = the 10 in Impact › Affected specs and the "ten-capability change" in task 9.6. `design.md` carries no capability count to drift.

**Tooling:** `openspec validate delete-the-lattice --strict` → `Change 'delete-the-lattice' is valid` (exit 0). `python3 .claude/scripts/openspec-reconcile.py delete-the-lattice` → `delete-the-lattice: OK` (exit 0).

---

## BLOCKER

### B3-R — The repaired task 1.1 grep is dirty against the current tree: the predecessor's "non-deleted path" scoping was lost in the rewrite

`/Users/travis/Projects/hexaverse/openspec/changes/delete-the-lattice/tasks.md:7-14`:

> `grep -rnE "from '@/lib/(board|polar)'|require\('@/lib/(board|polar)'\)" frontend --include='*.ts' --include='*.tsx' | grep -v node_modules`.
> It SHALL return nothing.

Run verbatim against the tree right now, it returns **14 hits**:

```
frontend/lib/board/board.test.ts:2:import { isAdjacent, slotsForRing, validateSchedule } from '@/lib/polar'
frontend/lib/board/pixel.ts:12:import { type Schedule, ringRadius, slotsForRing } from '@/lib/polar'
frontend/lib/board/movement.ts:11:import { type Schedule, slotsForRing } from '@/lib/polar'
… (14 total, every one inside frontend/lib/board/)
```

All 14 are `frontend/lib/board/*` importing `@/lib/polar` — the two directories task 6.2 deletes together. The archived predecessor scoped its grep precisely to exclude them: `openspec/changes/archive/…build-production-space-view/tasks.md:735-738` — *"any surviving import of `@/lib/board` or `@/lib/polar` **from a non-deleted path**"* — and round 2's own evidence block ran it with `| grep -v '^frontend/lib/board/' | grep -v '^frontend/lib/polar/'`. The repair dropped both filters. With them restored the grep returns nothing (verified, exit 1).

**Exploit:** `tasks.md:3-5` — *"If 1.1 or 1.3 is dirty, **stop**: the predecessor is not complete, and the fix belongs there"* — and `proposal.md:24-28` — *"If that grep is dirty, this change cannot proceed."* The implementer's first action halts the entire change against a self-referential hit inside the directory the change exists to delete, and `build-production-space-view` is archived so "finish it there" is impossible. The only exits are abandoning the change or silently narrowing a gate the proposal calls non-negotiable — the *exact* failure round 2's B3 was raised to close, reintroduced by its own fix. Task 6.1 ("Re-run task 1.1's grep — it must still return nothing after sections 2–5") fails identically, since 6.1 runs before 6.2's `rm -rf`.

**Smallest fix** — replace 1.1 with:

```
- [ ] 1.1 Re-run `build-production-space-view` task 10.11's grep against the
      real tree, restricted to IMPORTS **from a non-deleted path** (the
      predecessor's own wording), since the only import hits today are the
      two doomed directories importing each other and two further surviving
      hits are prose about the deletion rather than dependencies on it:
      `grep -rnE "from '@/lib/(board|polar)'|require\('@/lib/(board|polar)'\)" frontend --include='*.ts' --include='*.tsx' | grep -v node_modules | grep -v '^frontend/lib/board/' | grep -v '^frontend/lib/polar/'`.
      It SHALL return nothing. The excluded hits are `frontend/lib/board/`'s
      own 14 imports of `@/lib/polar`; both directories are deleted together
      by task 6.2, so an importer inside them is not a surviving dependency.
      The two prose hits —
      `frontend/components/space/SystemSpaceView.tsx:29` and
      `frontend/lib/types/action.ts:5` — are rewritten by task 6.3, not by
      the predecessor. Record the output in the commit message.
```

(Task 6.1 then inherits the corrected form and passes at that point too.)

---

## MAJOR

### M1-R — 10.1c's price-board exemption is scoped to `backend/market`, but its **frontend** leg hits the live market price-board UI

`/Users/travis/Projects/hexaverse/openspec/changes/delete-the-lattice/tasks.md:627-638`:

> `grep -rnE '\b(board|polar)\.[A-Za-z]' frontend --include='*.ts' --include='*.tsx' | grep -v node_modules`.
> Hits in **`backend/market`** naming the market price board (`board.Venues`, `board.RefreshCadenceMs`) are the price board, not the lattice, and stay. **Every other hit names a symbol of a package that no longer exists: rewrite it.**

Running the frontend leg, the hits that survive after sections 5–6 delete `lib/board`/`lib/polar` include:

```
frontend/components/market/MarketBoardPanel.tsx:213:    ? (priceOf(board.venues.find((v) => v.systemId === homeSystemId) …
frontend/components/market/MarketBoardPanel.tsx:218:  for (const venue of board.venues) {
frontend/app/spike/hex-board/mock-system.ts:3:// docs/plans/hex-board.md) before the real generation/read API exists.
frontend/lib/types/system-space.ts:12:// replaces `lib/types/system-board.ts`.
```

`board.venues` is the **market price-board DTO** — the identical exemption the task grants on the backend, denied on the frontend because the exemption sentence names a backend path. The two `…board.md` / `system-board.ts` hits are the pattern matching a file extension after `board.`, not a symbol at all.

**Exploit:** an implementer following the sentence literally renames a live market component's price-board variable (or its type) on a lattice-deletion change — a rename in a capability this change's Impact does not claim to touch — or, reading the contradiction, rules the exemption ad hoc and leaves `mock-system.ts:235`'s genuine `board.GateRing` citation behind on the same judgement. Two engineers produce different trees, which is the failure 10.1c was added to prevent.

**Smallest fix** — replace 10.1c's exemption sentence with:

```
      Hits naming the **market price board** are the price board, not the
      lattice, and stay: `backend/market`'s `board.Venues` /
      `board.RefreshCadenceMs` (today only in
      `market/board_integration_test.go`, eight hits) and the frontend's
      `board.venues` on the price-board DTO
      (`frontend/components/market/MarketBoardPanel.tsx:213,218`). So do the
      incidental matches where `board.` is a filename rather than a package
      qualifier — `docs/plans/hex-board.md` (`app/spike/hex-board/mock-system.ts:3,6`)
      and `lib/types/system-board.ts` (`lib/types/system-space.ts:12`).
      Every other hit names a symbol of a package that no longer exists:
      rewrite it — including
      `frontend/app/spike/hex-board/mock-system.ts:235` ("mirrors
      board.GateRing"), which task 6.3b's space-3d comment sweep does not
      reach.
```

---

## MINOR

- **Line citation off by one in 2.1b.** `tasks.md:47` — "8a-2's own comment at `model.go:196-200`". The comment is `backend/system/model.go:195-199`; line 200 is the `Extent float64` field itself. Change to `model.go:195-199`.

- **6.3's "five assertions" under-counts the file's sites.** `tasks.md:334-336` — "update `lib/query-keys.test.ts`'s five assertions". There are five `expect(...)` lines (`:20,21,23,25,30`) but also two `it(...)` titles carrying the name — `:19` ("…under the systemBoard prefix") and `:28` ("keeps the system health probe separate from the systemBoard read") — which 6.3's own sweep grep (`systemBoard`) will still return after the five assertions are updated. Append: "…and the two `it()` titles at `:19` and `:28` that name the prefix."

- **Two unaccounted `board feature id` residues in a live spec the change never names.** `openspec/specs/docked-fleet-actions/spec.md:155` and `:316` both read "`attachedTo` is that station's **board** feature id". The change de-latticizes the identical phrase in `trading-station` (task 10.3c, verified landed — the delta reads "the station's **feature id**") and in the new `system-space-view` delta (B1's bullet), and design.md Decision 1 records three residual lattice-vocabulary titles as deliberate. These two are recorded nowhere, and no sweep in section 10 or 12 looks for lattice vocabulary inside `openspec/specs/`. Vocabulary only — the feature id still exists — so the cheapest fix is to record rather than modify: append to 10.3c, "Two further residual uses of 'board feature id' survive in `docked-fleet-actions`'s *Sell Offer on the Docked Fleet* (`:155`) and *Refuel Offer on the Docked Fleet* (`:316`); like the *board read serves the station* scenario heading they are recorded here as accepted vocabulary residue, not forgotten."

---

**Verdict: NOT CLEAR** (1 blocker, 1 major, 3 minors — all in text this round revised).