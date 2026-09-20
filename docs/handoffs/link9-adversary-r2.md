# Link 9 `delete-the-lattice` — adversary round 2 + orchestrator rulings

**Why a second round.** Round 1 (repairs in `873e14d`) was followed by edits (`92deb33`,
`04dcccc`) and by 8a-2's archive, which changed the live `system-interior` and
`cross-stack-determinism` specs this change targets and created `system-space-view`.
Verdict on the current content: **NOT CLEAR** — 3 blockers, 5 majors, 6 minors.

## Orchestrator rulings — ALL ACCEPTED, apply each fix as pasted

| # | Ruling |
| --- | --- |
| B1 | ADD `specs/system-space-view/spec.md` with the MODIFIED *System Space View Route and Data Fan-In* block (every live scenario heading verbatim), replacing the station clause as pasted; add `system-space-view` to the proposal's modified table and Impact. NOTE: 8b (`add-scan-and-sightings-surface`) archives before this change and ADDS requirements to `system-space-view` but does not MODIFY this one, so no cross-change scenario drift — say so in task 11.4. |
| B2 | Add task 2.1b (delete `SystemInterior.Radius`) and amend 2.7 to both `LaneGates` callers, as pasted. |
| B3 | Replace 1.1's grep with the import-only form; the two prose hits are rewritten by 6.3. |
| M1 | Add task 10.1c (symbol-citation sweep), as pasted. |
| M2 | Fix 4.2's grep pattern and add the two sites to 4.2b. |
| M3 | Append the `queryKeys.systemBoard` → `queryKeys.systemSpace` rename to 6.3, as pasted. |
| M4 | Replace the gcd leg with gcd-of-pairwise-differences in both the scenario and 2.11(b). |
| M5 | 3.4 deletes `TestInteriorRead_NoLatticeFieldTypeSurvivesOnTheWireDTOs` (keeps its sibling); narrow 10.2's allow-list to that one test function. |
| N1–N6 | Apply as stated (drop 4.5's second half; correct the importer count to six; fix the check-mirror-map.sh line citations; "Six of its seven"; repoint 11.4 at the 8b check; name `UPDATE_FIXTURES=1` in 7.5 and record both architectures in 7.6's `_meta`). |
| O1 (orchestrator) | Task 6.3b's `space-3d` comment rewrite also covers the two stale references to the deleted `webgl-board` bench — `frontend/app/spike/space-3d/page.tsx:13` and `page.test.tsx:7` — left behind by 8a-2's deletion of that spike. Same file, same species (a comment naming a thing that no longer exists); add them by line to 6.3b. |

## The adversary's report, verbatim

## BLOCKER

### B1 — A live requirement in an untouched capability forbids reading a wire field this change deletes; `system-space-view` is not in Impact

`openspec/specs/system-space-view/spec.md:51-57` (*System Space View Route and Data Fan-In*, added by 8a-2, **not** modified by 8b — that delta is `## ADDED Requirements` only):

> "This view SHALL consume only the station's identity — its system id and its board feature id — and **SHALL NOT read, render, or scale anything from the station response's lattice `orbit` object**; the station's drawn position comes from the interior read's body for it"

Task 3.2b (`tasks.md:146-167`) deletes `Station.Orbit` from `GET /v1/systems/:systemId/station`, calling it "a WIRE removal". After this change archives, that SHALL NOT governs a field the API does not serve — permanently unfailable, the exact species Decision 6 (`design.md:218-227`) says to retire, and a live spec still describing a served `orbit` object. `system-space-view` appears nowhere in `proposal.md`'s "Modified (eight)" table (`:111-123`), its "Deliberately untouched, with reasons" list (`:139-149`), or Impact › Affected specs (`:153-156`). No sweep reaches it: task 10.2 (`tasks.md:574`) greps `backend frontend .claude fixtures` — not `openspec/`; tasks 12.4/12.5 sweep only for `board-tactical-math` and retired requirement *titles*.

This is the same defect class `92deb33` repaired for *Lane-Gate Bodies Carry Their Lane Id* (which is now correctly repaired — `openspec/specs/system-interior/spec.md:955-958`), recurring on a capability 8a-2 created afterwards.

**Fix** — add `openspec/changes/delete-the-lattice/specs/system-space-view/spec.md` with a MODIFIED block reproducing all of that requirement's live scenarios verbatim and replacing the clause with:

```
- **The open system's station**, read through
  `GET /v1/systems/:systemId/station` (`trading-station`'s *Home Station
  Visible On the Direct Station Read, No Scan Required*). This view SHALL
  consume only the station's identity — its system id and its feature id —
  and SHALL NOT derive its drawn position from the station response at all;
  the station's drawn position comes from the interior read's body for it,
  exactly as every other body's does.
```

and add `system-space-view` to `proposal.md`'s modified table and Impact.

---

### B2 — `SystemInterior.Radius` was handed to this change by name and no task deletes it

`backend/system/model.go:190,196-200`:

```go
Radius    int                `json:"radius" firestore:"radius"`
...
// Extent is the continuous upper bound over every generated body's
// star-frame radius (`= ContinuousRadius(Radius)`), persisted at
// generation time (design.md Decision 2). It is what a gate anchors on
// (Decision 7) and what survives link 9, when the lattice-only `Radius`
// above is deleted.
```

Corroborated a second time by `frontend/components/space/space-camera.ts:16` — "never the lattice `radius`, **whose producer link 9 deletes**".

`grep -n 'SystemInterior\|GenerationParams' tasks.md design.md proposal.md` returns only the four hits about `Extent`/`GenerationParams.Radius` (which correctly survive per Decision 5). **The stored, lattice-only `SystemInterior.Radius` is named in no task.** Its sole surviving consumer is `backend/system/handler.go:115`:

```go
gates, err := h.svc.LaneGates(ctx, systemID, gen.Interior.Radius)
```

— which is a **second production caller** of `LaneGates`, while task 2.7 (`tasks.md:74-77`) says "Update the **one** production caller, `fleet/fuel.go`'s `gs.LaneGates(ctx, systemID, s.params.BoardRadius)`".

Exploit: the implementer removes the `radius` parameter (2.7), hits a compile error at `handler.go:115`, drops the argument, and `SystemInterior.Radius` becomes an orphaned lattice field still persisted with `firestore:"radius"` after a change whose Goal 1 (`design.md:26-29`) is that nothing in the tree describes the lattice. Task 10.2's `lattice` sweep flags only the *comment* at `model.go:198` — whose cheapest resolution is deleting the comment, not the field.

**Fix** — add to §2:

```
- [ ] 2.1b Delete `SystemInterior.Radius` (`system/model.go:190`, tagged
      `json:"radius" firestore:"radius"`) — the top-level lattice cell radius
      8a-2's own comment at `model.go:196-200` defers to this change by name.
      `SystemInterior.Extent` is its continuous successor and is already
      persisted. Verified by `grep -rn 'Interior\.Radius\|si\.Radius'
      backend/` returning nothing.
```

and amend 2.7 to: "Update **both** production callers — `fleet/fuel.go:126` and `system/handler.go:115` (`h.svc.LaneGates(ctx, systemID, gen.Interior.Radius)`), the latter of which is the last reader of `SystemInterior.Radius` (task 2.1b)."

---

### B3 — Task 1.1's precondition is dirty today, and its stated remedy is unreachable

`tasks.md:7-13` and `proposal.md:24-28`:

> "It SHALL return nothing." … "**If that grep is dirty, this change cannot proceed.** … the correct response is to finish it there — not to widen this change"

Run against the current tree:

```
$ grep -rn "@/lib/board\|@/lib/polar" frontend --include='*.ts' --include='*.tsx' | grep -v node_modules | grep -v '^frontend/lib/board/' | grep -v '^frontend/lib/polar/'
frontend/components/space/SystemSpaceView.tsx:29:// (`lib/types/market.ts`), and task 10.11's grep looks for `@/lib/board`
frontend/lib/types/action.ts:5:// `params.origin`/`params.target` were typed by `@/lib/board`'s lattice
```

Both are comments, not imports. But `build-production-space-view` is archived (`7a2e837`), so "finish it there" is impossible, and §1's preamble (`tasks.md:3-5`) says **stop**. The implementer must either halt the change or silently narrow a gate the proposal declares non-negotiable.

**Fix** — replace 1.1's grep with an import-only form and record the two prose hits as expected:

```
- [ ] 1.1 Re-run `build-production-space-view` task 10.11's grep against the
      real tree, restricted to IMPORTS, since two surviving hits are prose
      about the deletion rather than dependencies on it:
      `grep -rnE "from '@/lib/(board|polar)'|require\('@/lib/(board|polar)'\)" frontend --include='*.ts' --include='*.tsx' | grep -v node_modules`.
      It SHALL return nothing. The two prose hits —
      `frontend/components/space/SystemSpaceView.tsx:29` and
      `frontend/lib/types/action.ts:5` — are rewritten by task 6.3, not by
      the predecessor. Record the output in the commit message.
```

---

## MAJOR

### M1 — "Code comments that outlive their package" is enumerated once; ~25 instances exist, and no sweep finds any of them

`design.md:312-315` lists the whole category as **one** site:

> "**Code comments that outlive their package**
> 26. `backend/common/tuning.go:143` — cites `board.Schedule` and `board-tactical-math`."

`grep -rn '\bboard\.[A-Za-z]\|\bpolar\.[A-Za-z]' backend --include='*.go'`, excluding `board/`, `polar/` and the packages §§2-5 rewrite, surfaces sites in packages **no task touches**:

- `backend/space/params.go:41` — "mirroring `board.decodeInt`'s"
- `backend/space/burn.go:11` — "mirroring `board.Target`'s exactly-one-of-two-fields idiom"
- `backend/space/helpers_test.go:79`, `space/params_test.go:28,63` — "substituting `space.Vec3` for `board.Cell`", "mirroring `board.DecodeCell`'s own reasoning"
- `backend/action/params_validator.go:7,15` — **production code**: "a domain struct (`board.Cell`, `board.Target`, or …)" and "domain structs like `board.MovementState`". Task 4.4/4.4b repoint this validator's *test* and never its own doc.
- `backend/fleet/resolver.go:26`, `fleet/model.go:162`, plus ~10 test headers.

None is reachable by task 5.2 (`hexaverse/board` import paths), 10.1 (path patterns — `board.Cell` does not match `backend/board`), 10.1b (scoped to `.claude .gitlab-ci.yml infra`) or 10.2 (`lattice`). An implementer completes all 93 tasks with every grep green and Goal 1 (`design.md:26-29`) measurably false.

**Fix** — add to §10:

```
- [ ] 10.1c Sweep for SYMBOL citations of the deleted packages, which 10.1's
      path patterns and 10.1b's `.claude` scope both miss:
      `grep -rnE '\b(board|polar)\.[A-Za-z]' backend --include='*.go'` and
      `grep -rnE '\b(board|polar)\.[A-Za-z]' frontend --include='*.ts' --include='*.tsx' | grep -v node_modules`.
      Hits in `backend/market` naming the market price board (`board.Venues`,
      `board.RefreshCadenceMs`) are the price board, not the lattice, and
      stay. Every other hit names a symbol of a package that no longer
      exists: rewrite it. Confirmed sites at authoring:
      `backend/action/params_validator.go:7,15` (production),
      `backend/space/{params.go:41,burn.go:11,helpers_test.go:79,params_test.go:28,63}`
      (a package no other task touches), `backend/fleet/resolver.go:26`,
      `backend/fleet/model.go:162`.
```

### M2 — Task 4.2's verification grep cannot detect two surviving citations of the knob it deletes

`tasks.md:208-211`:

> "Verified by `grep -rn 'OrbitBasePeriod\|OrbitPeriod(' backend/` returning nothing"

The `(` is load-bearing and wrong. Surviving after the change, matched by neither 4.2's grep nor 4.2b's four-comment enumeration (`tasks.md:224-232`) nor any §10 sweep:

- `backend/fleet/params.go:13` — "the world's shared orbital law (`common.GameTuning.OrbitPeriod`), read live at settle time by coastState"
- `backend/fleet/resolver_test.go:23` — "the same period a body on that ring has (`common.Tuning().OrbitPeriod`)"

**Fix** — in 4.2 change the pattern to `grep -rn 'OrbitBasePeriod\|OrbitPeriod' backend/`, and add to 4.2b's repoint list: "`fleet/params.go:11-14` (its `MovementParams` doc cites `common.GameTuning.OrbitPeriod` as the live coast-period source) and `fleet/resolver_test.go:23`."

### M3 — `queryKeys.systemBoard` has no stated disposition, and it is threaded through 8a-2's own space-view hooks

`tasks.md:293-298` (task 6.3) directs "Rename or remove each hit" and names exactly one exception, `queryKeys.market.board()`. Running its grep now:

```
frontend/hooks/use-system-space.ts:21:    queryKey: queryKeys.systemBoard.detail(systemId),
frontend/hooks/use-fleets.ts:32,115
frontend/lib/query-keys.test.ts:19-30 (5 hits)
frontend/hooks/use-system-space.test.tsx:47, use-fleets.test.tsx:99,172
```

`systemBoard` is the query-key namespace of the *continuous* space view 8a-2 shipped. "Rename or remove each hit" mandates a cross-file rename of a query-key factory entry with no task, no new name, and no acceptance criterion — while an implementer reading "the market price board is not lattice" can equally rule `systemBoard` non-lattice and leave it. Two engineers build different trees.

**Fix** — append to 6.3:

```
      `queryKeys.systemBoard` (the per-system interior read's key namespace —
      `lib/query-keys.ts`, `hooks/use-system-space.ts:21`,
      `hooks/use-fleets.ts:32,115`, and their three test files) IS lattice
      vocabulary on the continuous view: rename it to `queryKeys.systemSpace`
      in the factory and every reader, and update
      `lib/query-keys.test.ts`'s five assertions. It is a pure rename with no
      wire or cache-shape consequence beyond the key string itself.
```

### M4 — The relocated reachability scenario is satisfied by an offset coarse sub-lattice

`specs/system-interior/spec.md:48-58` and `tasks.md:115-128`:

> "**AND** the greatest common divisor of the collected phases is `1`, so the draw is not confined to a coarse sub-lattice of the turn"

`gcd` of a *shifted* lattice is not the step. A generator drawing `phase = 1 + r.Intn(16)*65536` occupies every quadrant of `[0, SubTurn)` and has gcd 1 (the set contains 1), while leaving 99.998% of phases unreachable — the same coarse sub-lattice the clause names. The task's own named counterexample (`r.Intn(16)/16`, unshifted) is caught; its offset sibling is not.

**Fix** — replace the AND leg in both the scenario and task 2.11(b):

```
- **AND** the greatest common divisor of the pairwise differences of the
  collected phases is `1`, so the draw is not confined to a coarse
  sub-lattice of the turn at any offset — a generator drawing
  `c + k·(SubTurn/16)` covers every quadrant and has gcd `1` whenever `c` is
  odd, while leaving almost every phase unreachable, which is the continuous
  restatement of the very defect the retired every-slot-is-reached scenario
  existed to catch
```

### M5 — A guard Decision 6 says to retire survives unnamed, protected by task 10.2's own allow-list

`backend/system/interior_wire_lattice_removal_test.go:192-210`:

```go
func TestInteriorRead_NoLatticeFieldTypeSurvivesOnTheWireDTOs(t *testing.T) {
    ...
    if pkg := ft.PkgPath(); strings.HasSuffix(pkg, "hexaverse/board") || strings.HasSuffix(pkg, "hexaverse/polar") {
        t.Errorf("%s.%s is a %s type — the interior wire DTOs must carry no lattice type once "+
            "this change lands, or `delete-the-lattice` is not a pure deletion",
```

This is verbatim Decision 6's retire branch (`design.md:220-223`): "a guard whose only expression is 'package X is not imported' where X no longer exists — the compiler is a strictly stronger guarantee". Yet 3.4 (`tasks.md:182-188`) names only the three `lattice_symbols_absent_test.go` files; task 2.10's mechanical grep (`tasks.md:96`) does not match this file (it names no `Footprint`/`clampRing`/etc.); and task 10.2 (`tasks.md:574-586`) allow-lists "the deliberate wire-contract guard … **and its implementing test**" — i.e. the whole file, including the dead half. Its sibling `TestInteriorRead_LatticeOnlyFieldsAreAbsentFromTheResponse` is correctly kept.

Note this file is also the only entry on task 1.4's grep output that no §2-5 task names — under 1.4's own rule (`tasks.md:26-28`) that "must be reported before proceeding".

**Fix** — append to 3.4: "Delete `TestInteriorRead_NoLatticeFieldTypeSurvivesOnTheWireDTOs` (`system/interior_wire_lattice_removal_test.go:192-223`) and the `"hexaverse/board"`/`"hexaverse/polar"` string literals it matches on — a reflection guard that no DTO field is a `board`/`polar` type, unfailable once those packages are gone (Decision 6). **Keep `TestInteriorRead_LatticeOnlyFieldsAreAbsentFromTheResponse` in the same file**: it asserts json tag names on the wire, which remains falsifiable." Then narrow 10.2's allow-list from "its implementing test" to that one test function.

---

## MINOR

- **N1 — `tasks.md:275-277` names a file that no longer exists.** "Repoint `backend/mine/integration_test.go` and `backend/interior_additive_wire_e2e_test.go` off `board`" — 8a-2 removed the latter; `find backend -name 'interior_additive*'` returns nothing, and no backend-root e2e test imports `board`. Drop the second half of 4.5.

- **N2 — `proposal.md:33-38` overcounts the backend importers.** It names eight for `board`, including `system/gates.go` and `system/fog.go`; `grep -rln '"hexaverse/board"' backend --include='*.go'` shows neither imports it after 8a-2's rewrites. The real production set is six: `system/{fog_source,generator,model,service}.go`, `stations/{placement,service}.go`. Correct the count so task 1.4's baseline comparison is honest.

- **N3 — `design.md:295-297` line numbers drifted 30 lines.** Site 19 says `check-mirror-map.sh:335-345` for `check_mirror board`/`check_mirror polar`; they are at **:365 and :371**. Site 20 says `:376` for the `PASS:` message; it is at **:406**. (Sites 17 `:5-11`, 18 `:181`, and `tasks.md:381`'s extractor `:75-78` all still verify exactly, as does every `check.py`, `.gitlab-ci.yml`, Dockerfile, `check-transcendental.sh`, `check-frontend-tests.sh`, `fixtures/system/mirror-map.json:59,60,71` and `fixtures/determinism-register.json:24` citation.)

- **N4 — `specs/system-interior/spec.md:348` miscounts the retrograde survivors.** "Five of its six scenarios survive in the ADDED requirement." The live requirement has **seven** scenarios and **six** survive. Task 11.2's audit reads this Migration note; a count that under-states the denominator is how a real drop passes an audit. Change to "Six of its seven scenarios survive."

- **N5 — `tasks.md:645-651` (11.4) is stale in premise and silent on the one live predecessor.** It requires cross-stack-determinism's *Shared Board Math* to carry "all fourteen scenarios `build-production-space-view` leaves behind, three of which are not in the live spec today." 8a-2 archived at `7a2e837`; all fourteen are live, and `openspec-reconcile.py delete-the-lattice` now exits 0. I verified the remaining unarchived predecessor is safe — `add-scan-and-sightings-surface` MODIFIES `action-dispatch`'s *Exactly-Once Resolution* and *Inbox by Actor Query Param*, while link 9's `action-dispatch` delta MODIFIES only *Commit Rejects Non-Primitive Action Parameters*, and 8b's `system-space-view` delta is `## ADDED` only. Repoint 11.4 at that check rather than leaving a satisfied-but-misleading instruction.

- **N6 — `tasks.md:401-409` (7.5) names no recording mechanism and leaves no artifact.** The family is regenerated by `UPDATE_FIXTURES=1` (`system/fixtures_test.go:711`); the task says "re-record" without naming it, and task 7.6 records only *one* architecture in `_meta.generatedOn`, so a one-architecture recording is indistinguishable afterwards. The standing `./system/` cross-target leg (`check.py:1078-1102`, `.gitlab-ci.yml:342`) would catch a divergence on the next run, so this is a documentation gap rather than a hole — name the command and point 7.5 at that leg as the durable check.

---

Verified clean and worth recording: all round-1 repairs hold (the market mirror-map census is exactly 28 Go funcs / 25 `goOnly`, `family:fold` + `family:firstTonPrice` match `fixtures/market/cases.json`'s two non-empty top-level keys, `check_mirror`'s arg order and `exit 2` match 7.3/7.4, the `commit_params_validator_test.go` acceptance half at `:98-116` and `ActorState` case at `:122-155` are exactly as described, `corporations/params_test.go`'s fleet legs are at `:56-58`/`:76-78` with the `system.DefaultParams().Radius` leg intact, task 2.10's grep still returns exactly 21 files including all nine named, and `\blattice\b` is correctly unanchored). Task 10.3b's grep returns exactly `space/vec.go:10` and no call site. All requirement titles cross-referenced by the deltas resolve against the live tree. The six REMOVED+ADDED body/scenario diffs are clean lattice re-sourcing with no unstated substance loss. `openspec validate --strict` and `openspec-reconcile.py` both pass.

**Verdict: NOT CLEAR**