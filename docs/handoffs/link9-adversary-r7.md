# Link 9 `delete-the-lattice` — adversary round 7 (scoped verdict-currency re-attack)

**Why.** The last verdict was issued at `67769ec`. Since then `1bc5e46` (link 8b's
implementation), `73c3f51`, `3088748` (the archive of `add-scan-and-sightings-surface`)
and `c74766f` landed — 124 files, including two capability specs link 9 has MODIFIED
deltas against and several files link 9 cites by `file:line`. A spec edit — or a tree
edit under a spec's citations — expires the verdict. This round attacks exactly four
questions and re-verifies round 5's six rulings; it does **not** re-attack requirement
quality, testability, capability boundaries or the deletion strategy (rounds 1–4 ruled
on those and round 4 was CLEAR on the spec text).

Verdict: **NOT CLEAR** — 0 blockers, 3 majors, 0 minors. The change folder itself is
byte-identical to the verdict commit; every finding is drift the tree introduced
underneath it.

---

## Orchestrator rulings — ALL THREE ACCEPTED, apply each paste-ready fix exactly

Ruled 2026-09-04 by the link-9 orchestrator at HEAD `c74766f`.

| # | Ruling |
| --- | --- |
| MAJOR-1 | **Accepted in full.** Repoint all eight citations to the paste-ready values (`design.md:278,280,282,283,285,419`; `tasks.md:159,921`). **Also add the re-derive-by-symbol sentence** under design.md's site list, verbatim as proposed — it is the finding's only durable half; the numbers will go stale again the next time `check.py` moves. |
| MAJOR-2 | **Accepted in full.** Extend task 10.2's clause with the three named exemptions exactly as pasted. The reasoning is correct on both structural causes: a change id containing the swept word puts the RED-manifest convention and the sweep in unavoidable conflict, and `sub-lattice` in `phase_reachability_test.go` is a lattice of real numbers — renaming it would make the test's own failure message false. **Do not** weaken the sweep beyond these three exclusions; the remainder must still be required empty, because a wholesale waiver of 10.2 is exactly how the silently-inert residue Goal 2 exists to kill would reach the archive. The parallel edit to `link9-acceptance-greps.sh`'s 10.1 and 10.2 legs is the **SDET's**, not the writer's — the writer owns `tasks.md`, the SDET owns its harness, and they must agree. |
| MAJOR-3 | **Accepted in full.** Replace `tasks.md:1061-1069` with the paste-ready 12.1. Keep the proposed conditional tail ("if either fails, archive whatever is outstanding **in the copy**") rather than deleting the pre-archiving instruction outright — it preserves the rehearsal's guarantee for any future resume where the predecessors are not yet archived. |

Also applied from the *Notes recorded* section, since the writer is editing nearby and
neither costs a round: **tasks.md:20**'s "all four predecessors" → "all five" (it names
five), and **task 1.4** gains one clause noting that
`backend/action/commit_params_validator_continuous_test.go` is a RED-phase file of this
change and is therefore an expected `hexaverse/board` importer that sections 2–5 do not
name, removed by its own GREEN rewrite.

Round 8, if one is needed, re-verifies these three plus the two notes and nothing else.

### Addendum — MAJOR-2's fix REVISED after the SDET measured it

The SDET applied MAJOR-2's three exemptions to `link9-acceptance-greps.sh` and measured
the result. **The finding's proposed fix does not achieve what it claims**, and the
mechanism it proposed is too broad in one place and too narrow in another. Superseding
ruling, 2026-09-04:

**What the measurement showed.**

1. **Five RED-artifact hits survive the three exemptions** — `phase_reachability_test.go:4,20,22,103` and `commit_params_validator_continuous_test.go:10` — all bare-word `lattice` in comment prose. Lines 20, 22 and 103 are *continuation lines* of the very sub-lattice sentences cause (2) protects: the sentence begins with `sub-lattice` on the line above and wraps. A line-oriented filter cannot reach them. So both task 10.2 as written and the harness remain unsatisfiable.
2. **`grep -v 'delete-the-lattice'` on leg 10.1 removes 79 lines, every one a path match on the change's own folder** and none by content — a far larger effect than a "RED header" exemption implies.
3. **On leg 10.2 the same filter hides six prose lines in *tracked* files** that cite the change by id — `backend/system/{fog.go:22, model.go:130, interior_wire_lattice_removal_test.go:209, generator_continuous_test.go:327,339,383}`. These sit on code this change deletes outright, so they *should* vanish with the implementation — but under a blanket id filter the gate can no longer confirm that. That is the sweep going blind on exactly the class of residue Goal 2 exists to kill.
4. **`frontend/.next/` and `.next-e2e/`** (gitignored Next.js build output) contribute 17 hits to 10.1 and 42 to 10.2. No source edit can ever clear them.

**Ruling — five parts, superseding MAJOR-2's paste-ready text:**

| # | Ruling |
| --- | --- |
| A | **Reword, do not exempt, wherever a comment can carry its meaning without the bare word.** `phase_reachability_test.go:4,20,22,103` become `sub-lattice` or drop the word (`the retired lattice scenario` → `the retired ring-slot scenario`; `the underlying lattice` → `the underlying sub-lattice`; `the lattice's true spacing` → `the sub-lattice's true spacing`; `nearest a lattice node` → `nearest a sub-lattice node`). `commit_params_validator_continuous_test.go:10`'s `all lattice vocabulary` → `all board-package vocabulary`. **Comment-only: no assertion, no test name, and no failure-message string changes** — the `t.Errorf` already says `sub-lattice`, which stays. This is an SDET-owned edit under the test-immutability rule (comment prose, no behaviour), logged with cause, and the red manifest is re-recorded after it. |
| B | **NO blanket `delete-the-lattice` exclusion on leg 10.2.** The six tracked prose lines in finding-3 above stay under the gate and must genuinely vanish with the implementation. Exempt only the red-manifest **header form** — a phrase narrow enough to match manifest headers and nothing else — and only for RED files that survive their own GREEN step. |
| C | **Leg 10.1's change-folder exclusion becomes a PATH exclusion**, `^./openspec/changes/delete-the-lattice/`, not a content match on the id. A change folder cannot describe a deletion without naming the deleted paths, so the exemption is legitimate — but it must be visibly an exemption of *that folder*, not an invisible content filter with a 79-line reach. Record that it is **pre-archive only**: after `openspec archive`, the folder moves under `openspec/changes/archive/`, which the allow-list already covers. |
| D | **`--exclude-dir=.next --exclude-dir=.next-e2e` on both legs.** Compiled bundles are not source; the sweep's subject is source residue. This is not a weakening — it is the sweep declining to grade its own build output. |
| E | **The SDET derives the exact final filter set mechanically and reports it; the writer then records that exact text in tasks 10.1 and 10.2.** Harness and task must be byte-consistent, and the derivation belongs to whoever can measure it. The remainder of both sweeps stays required-empty — the do-not-widen ruling stands unchanged. |

The SDET's own deviation — declining to add the `TestInteriorRead_…` filter to leg 10.1
because `tasks.md` 10.1 does not grant it and it removes 0 lines — is **correct and
upheld**. Exact textual agreement with the task at zero behavioural cost is the right
trade.

### Two follow-on rulings after the SDET executed the addendum

**F — `phase_reachability_test.go:25` (`post-delete-the-lattice` → `post-deletion`) is
APPROVED as made.** The SDET flagged it as an addition to part A's list rather than
making it silently, which is the right instinct. Its first measurement was taken *with
the blanket id filter still installed*, so `:25` was hidden; ruling B removed that
filter and exposed it. The line is neither a manifest header nor `sub-lattice`, so no
ruled exemption reaches it — it is precisely the case ruling A governs, and without the
edit leg 10.2 stays unsatisfiable and part E's filter set is fiction. No fourth
exemption is granted.

**G — `generator_continuous_test.go:327,339,383` are pre-authorized for a comment-only
SDET pass at the acceptance gate.** Three of the six tracked prose lines ruling B keeps
visible sit inside a **manifest-recorded RED file** (task 2.10b's SDET-owned revision).
Clearing them is therefore a post-handoff test edit, and a developer must **not** make
it — the same seam that produced this repo's *integrity check finds altered tests*
BLOCKER. Standing authorization, on the same terms as part A: **comment prose only, no
assertion, test name, or failure-message string changed**, manifest re-recorded, cause
logged in `link9-red-coverage.md`. If clearing a line would require touching anything
but a comment, the SDET halts and reports instead.

**The general rule this makes explicit, for both developers:** every file in
`red-manifest-delete-the-lattice.txt` is SDET-owned. Task 2.10's sweep names
`generator_continuous_test.go` among its 21 files, and task 2.10b has already revised
it — a developer who finds a manifest-recorded file in their own task's file list
**halts that leg and reports it to the orchestrator**; the SDET makes the edit. This is
the one place in section 2 where a developer's mechanically-derived file list and the
red manifest overlap.

---

## Verification table

| # | Question | Result | Evidence |
|---|---|---|---|
| 1 | MODIFIED-block fidelity, all nine delta capabilities | **CLEAR** | 15 MODIFIED requirement headers, all present verbatim in `openspec/specs/<cap>/spec.md` at HEAD; **every** scenario heading reproduced verbatim, in the same order, with the same count (4/14/7/3/4/3/3/5/5/2/10/15/2/3/8/2). No duplicates. 11 REMOVED headers all resolve to a live requirement. Machine-diffed, not eyeballed. |
| 1a | `action-dispatch` › *Commit Rejects Non-Primitive Action Parameters* | **CLEAR** | The 8b archive (`3088748`) added +89 lines to this spec but **did not touch this requirement**: `diff` of the requirement block at `67769ec` vs HEAD is empty. The delta's only differences from live text are its two sanctioned edits (`board coordinate` → `space.Vec3 position`; the ring/slot map scenario → `space.EncodeVec`/`space.DecodeVec`). |
| 1b | `system-space-view` › *System Space View Route and Data Fan-In* | **CLEAR** | +859 lines archived into this spec; the target requirement block is **byte-identical** at `67769ec` and HEAD. The delta's only difference is the sanctioned station-`orbit` sentence rewrite. The new 8b requirements' three "lattice-derived" mentions (`:1305,:1382,:1620`) all *assert the absence* of lattice-derived fields — consistent with link 9, not residue. |
| 2 | Line-citation currency across `67769ec..HEAD` | **FAIL** | 8 stale `check.py` citations. See MAJOR-1. All other citations into changed files verified current: `frontend/components/space/SystemSpaceView.tsx:28,29`, `frontend/lib/types/action.ts:5`, `backend/fleet/resolver.go:26`, `backend/fleet/model.go:162`, `frontend/hooks/use-fleets.ts:32,140`, `check.py:250`, `check.py:258-259`. Files not touched in the range keep their citations valid (`.gitlab-ci.yml:342,371`, `check-frontend-tests.sh:114,118,126`, `check-mirror-map.sh`, `infra/docker/test-runner.Dockerfile:5` — all re-read and confirmed). |
| 3 | New residue from `1bc5e46` (10.1 / 10.1b / 10.1c / 10.2 sweeps) | **FAIL (own artifacts only)** | Diffed every sweep's hit set at `67769ec` against HEAD. **No production or test file that `1bc5e46` shipped introduces a single new lattice/`board`/`polar` hit.** The board/polar importer set is unchanged (six production importers, all named by sections 2–5). Every new hit comes from this change's own uncommitted RED-phase files. See MAJOR-2. |
| 3a | Orchestrator's candidate list | **all covered** | `backend/fleet/handler.go` (tasks.md:879, `rewrite`), `backend/fleet/resolver.go:26` (tasks.md:845, line verified), `backend/system/bodies.go` (tasks.md:890, `rewrite`), `SystemSpaceView.tsx:28` (tasks.md:942, line verified), `frontend/e2e/tests/space-journey.spec.ts` (tasks.md:937, `rewrite` — the `board-overlay`/`board-lattice` testids at `:120,125` fall under it), `frontend/lib/types/action.ts:5` (tasks.md:918, line verified), `check.py` (tasks 8.4–8.8, 8.14 — but see MAJOR-1), `CLAUDE.md` (task 9.5; note it is **outside** 10.2's `backend frontend .claude fixtures` scope, so 9.5 is its only owner — correct as written). |
| 4 | Round-6 closure of r5's six rulings | **ALL SIX LANDED** | BLOCKER-1 → tasks.md:521-525 (the `backend/space/table.go:47` bullet, verified `turnTableMeta`'s comment is at `:47`) + tasks.md:527-537 (clause rewritten to 10.1's five-directory allow-list, `--exclude-dir=archive` dropped with the reason recorded). MAJOR-2 → tasks.md:682-686 (`:126` predicate, `:118` comment, "stays unedited" range now `:115-117,119-125`). MAJOR-3 → tasks.md:691-694 (`:114`'s `createLattice` → `SpaceWorld`; verified `SpaceWorld` is the only symbol `frontend/components/space/webgl/` exports). MAJOR-4 → tasks.md:906-927 (the thirteen-file addendum, verbatim as ruled, plus the `check-frontend-tests.sh` cross-reference to 8.10). MINOR-1 → tasks.md:257-261 (dependency noted; its "17 further `angle0` hits across four files" is **exact** at HEAD). MINOR-2 → tasks.md:511-517 (the `0008:380` entry annotated as 10.1's site). |
| 4a | Task 7.1's acceptance grep, run at HEAD | **satisfiable** | With the five allow-list directories, this change's own folder, the sections 5–6 deletions and the two `openspec/specs/` files 7.1 itself excepts removed, every remaining hit is named by 7.1's own bullets or by tasks 8.3 / 8.9 / 8.14 / 9.5. BLOCKER-1's kill is closed. |
| 5 | `board-tactical-math` retirement mechanism | **SOUND — not a blocker** | There is deliberately no `specs/board-tactical-math/` delta. Retirement is a **post-archive hand-delete** at task 13.3 (`tasks.md:1156-1158`), sequenced *after* `openspec archive` succeeds and after 13.1–13.2's `## Purpose` edits, with `polar-lattice-math` / `observation-fog-and-scan` / `board-view` named as the confirmed precedents. It is rehearsed first: 12.2 archives in a scratch copy and confirms success **with no delta directory present**, and 12.4 deletes the directory in that copy and greps for dangling citations. This is exactly the mechanism Lesson four prescribes, and the ordering (archive → hand-delete) is the one that survives. `openspec archive` never sees a REMOVED-only capability. |
| 6 | Gates | **pass** | `openspec validate delete-the-lattice --strict` → `Change 'delete-the-lattice' is valid`. `python3 .claude/scripts/openspec-reconcile.py delete-the-lattice` → `delete-the-lattice: OK`. |

---

## Findings

### MAJOR-1 — eight `check.py` line citations went stale in `1bc5e46`, and sites 8 and 9 now point at each other's territory

**Files:** `openspec/changes/delete-the-lattice/design.md:278,280,282,283,285,419` and
`openspec/changes/delete-the-lattice/tasks.md:159,921`

`1bc5e46` inserted `run_backend_unit_tests()` and rewrote `run_frontend_e2e`'s docstring
in `.claude/skills/code-quality-checks/check.py`, shifting everything below line ~790 by
**+29 lines**, and everything in `main()` by **+35**. Verified by grepping the same
anchors in `git show 67769ec:` and at HEAD:

| Citation | Cited as | Actually at HEAD |
|---|---|---|
| design.md:278 — site 8, `run_determinism_cross_target`'s docstring | `:1052–1055` | `:1081–1084` |
| design.md:280 — site 9, the two `go test ./board/ ./polar/ …` command strings + four result messages | `:1078–1102` | `:1107–1131` |
| design.md:282 — site 10, `run_mirror_map_check`'s docstring | `:1161–1162` | `:1190–1191` |
| design.md:283 — site 11, `determinism_trigger` | `:1484–1492` | `:1519–1527` |
| design.md:285 — site 12, `mirror_trigger` | `:1502–1514` | `:1537–1549` |
| design.md:419 (C14's recorded-not-fixed note) | `check.py:1502-1514` | `:1537-1549` |
| tasks.md:159 (task 2.10c, "the standing `./system/` cross-target leg") | `check.py:1078-1102` | `:1107-1131` |
| tasks.md:921 (the MAJOR-4 addendum, "already covered, task 8.6") | `check.py:1055` | `:1084` |

**Exploit.** Task 8.6 reads: "remove `./board/ ./polar/` from both
`run_determinism_cross_target` command strings and from the four result messages
(site 9), and rewrite its docstring, which cites the retired `polar-lattice-math`
capability (site 8)". A developer resolving sites 8 and 9 by their line numbers opens
`:1052–1055` (now inside `check_transcendental`'s seam-file predicate region — nothing
to do with the cross-target matrix) and `:1078–1102`, which at HEAD **is the docstring
site 8 was supposed to be**. The two `go test ./board/ ./polar/ ./space/ ./system/
./galaxy/` invocations at `:1109` and `:1123` — the only edit that actually de-enrols
the deleted packages — are outside every cited range. The failure surfaces at task 10.4
(`check.py` fully green) as `go test ./board/` against a directory that no longer
exists, with nothing pointing back at the cause. Worse, tasks.md:921 tells the developer
`:1055` is "already covered by task 8.6"; at HEAD `:1055` is
`violation_details.append(f"  Line {v['line']}: …")` in the colour-compliance printer,
so a re-run of the C12 sweep sees a `polar-lattice-math` hit at an uncited line and
concludes it is new work.

Two mitigations keep this out of BLOCKER: every citation is paired with a symbol name
(`run_determinism_cross_target`, `mirror_trigger`, `run_mirror_map_check`), and task
10.1b's bare-token sweep would eventually catch a surviving `"board"` / `./board/`.
Neither removes the wrong-edit-then-debug loop.

**Smallest fix** — repoint the eight numbers. Paste-ready for design.md:276–286:

```markdown
7. `:258–259` — the seam-file predicate matching `frontend/lib/board` and
   `frontend/lib/polar`.
8. `:1081–1084` — `run_determinism_cross_target`'s docstring, which cites
   `polar-lattice-math` (a capability retired two changes ago).
9. `:1107–1131` — the two `go test ./board/ ./polar/ ./space/ ./system/
   ./galaxy/` command strings and the four result messages naming them.
10. `:1190–1191` — `run_mirror_map_check`'s docstring.
11. `:1519–1527` — `determinism_trigger`, the changed-file predicate gating
    site 9.
12. `:1537–1549` — `mirror_trigger`, the changed-file predicate gating the
    mirror-map check.
```

design.md:419 → `` (`check.py:1537-1549`) ``.
tasks.md:159 → `` leg (`check.py:1107-1131`, `.gitlab-ci.yml:342`), which this task's ``.
tasks.md:921 → `` `.claude/skills/code-quality-checks/check.py:1084` (task 8.6, design ``.

Add one sentence under design.md's site list so the next tree edit does not silently
repeat this: *"These line numbers were derived at `1bc5e46`; re-derive them by symbol
(`grep -n 'run_determinism_cross_target\|mirror_trigger\|determinism_trigger' check.py`)
rather than trusting them if `check.py` has changed since."*

---

### MAJOR-2 — the change's own RED-phase files fail task 10.2's acceptance sweep, and the change id itself contains the forbidden word

**File:** `openspec/changes/delete-the-lattice/tasks.md:847-853` (task 10.2) and
`docs/plans/continous_space/handoffs/link9-acceptance-greps.sh:238-241` (its 10.2 leg)

> `grep -rni 'lattice' backend frontend .claude fixtures --exclude-dir=node_modules`
> SHALL return only the deliberate wire-contract guard … and its implementing test
> function, `TestInteriorRead_LatticeOnlyFieldsAreAbsentFromTheResponse` **alone**

The acceptance script's 10.2 leg implements exactly that — one `grep -v` for that test
name. Re-running the sweep at HEAD and diffing against `67769ec` shows **no new hit from
`1bc5e46`** — the sweep is clean with respect to link 8b. Every new hit comes from four
**untracked RED-phase files this change itself authored after the verdict**:

```
backend/system/phase_reachability_test.go            9 hits (task 2.11's RED)
backend/action/commit_params_validator_continuous_test.go  2 hits (+2 `backend/board` hits, task 10.1's sweep)
backend/fleet/jump_parked_at_target_gate_not_attached_test.go   1 hit (task 3.5's RED)
backend/refuel/parked_at_station_not_attached_test.go           1 hit (task 3.5's RED)
```

Two distinct causes, both structural rather than sloppy:

1. **The change id contains "lattice".** The RED-manifest convention is to head each
   red test with the openspec change it belongs to — `// RED-phase test for openspec
   change delete-the-lattice, task 3.5 —`. Every file that follows the convention fails
   10.2 by following it. This is not fixable by "drop the word".
2. **`phase_reachability_test.go` uses `sub-lattice` as mathematics, not as vocabulary.**
   Its assertion is that the continuous phase draw is not confined to a coarse
   sub-lattice of the turn — the gcd-of-pairwise-differences property that is the whole
   replacement coverage for the retired *Placement reaches every ring* scenario. The
   word is load-bearing in a domain that has nothing to do with the deleted board:
   `t.Errorf("… the draw is confined to a sub-lattice of spacing %d, at some offset")`.
   Renaming it to satisfy a grep would make the test's own failure message lie.

**Exploit.** Task 10.2 is the change's Goal-1 acceptance gate and admits exactly one
exemption. At the end of implementation an implementer runs it, gets thirteen hits in
four files the change itself created, and must either improvise an exemption the spec
never granted or rewrite a mathematical term into something false. The same species as
round 5's MAJOR-3 (10.2 vs 8.10), one level out: this time 10.2 conflicts with the
change's own RED phase rather than with a sibling task. Left unruled, the likely outcome
is that 10.2 is waived wholesale — which is precisely how the silently-inert residue
Goal 2 exists to kill survives into the archive.

**Smallest fix** — extend 10.2's exemption clause (tasks.md, after `:853`):

```markdown
      **Three exemptions beyond that test function, and no others.** (a) The
      mathematical term `sub-lattice` in `backend/system/phase_reachability_test.go`
      — task 2.11's replacement coverage asserts the continuous phase draw is not
      confined to a coarse sub-lattice of the turn; the word names a lattice of
      real numbers, not the deleted board, and rewriting it would make the test's
      own failure message false. (b) RED-phase test headers citing this change by
      id — `delete-the-lattice` contains the swept word, so the manifest convention
      and this sweep are in unavoidable conflict; the headers stay and the sweep
      excludes them. (c) `backend/action/commit_params_validator_continuous_test.go`'s
      two `backend/board` prose hits, which task 10.1's sweep also returns: they
      describe the deletion this change performs and are removed with the file's
      GREEN rewrite, not before. Run the sweep as
      `grep -rni 'lattice' backend frontend .claude fixtures --exclude-dir=node_modules
      | grep -v 'TestInteriorRead_LatticeOnlyFieldsAreAbsentFromTheResponse'
      | grep -v 'sub-lattice' | grep -v 'delete-the-lattice'` and require the
      remainder to be empty. Apply the same three exclusions to task 10.1's sweep
      and to `link9-acceptance-greps.sh`'s 10.1 and 10.2 legs, so the harness and
      the task agree.
```

---

### MAJOR-3 — task 12.1's archive rehearsal is unexecutable: all four predecessors it tells you to archive are already archived

**File:** `openspec/changes/delete-the-lattice/tasks.md:1061-1069`

> 12.1 Copy `openspec/` to a scratch directory and, **in that copy, archive the
> predecessors first, in order** — `add-stationkeep-hold-verb`, then
> `serve-orbital-elements-and-burn-preview`, then `build-production-space-view`, then
> `add-scan-and-sightings-surface` — applying `build-production-space-view`'s own
> post-archive hand-steps (its tasks 13.1–13.5, including the `board-view` directory
> deletion) so the rehearsal runs against the tree this change will actually meet.
> Against an unarchived tree it rehearses a shape that never ships

`3088748` archived the last of the four. At HEAD `openspec/changes/` contains exactly
`archive/` and `delete-the-lattice/`; `openspec/changes/archive/` holds
`2026-09-02-add-stationkeep-hold-verb`, `2026-09-03-serve-orbital-elements-and-burn-preview`,
`2026-09-03-build-production-space-view` and `2026-09-04-add-scan-and-sightings-surface`;
`openspec/specs/board-view/` is gone and `grep -rn 'board-view' openspec/specs/` returns
nothing. Running 12.1 as written means running `openspec archive
add-stationkeep-hold-verb` against a scratch copy that has no such change — four
consecutive failures.

**Exploit.** 12.1 is the first step of the only rehearsal that guards the
`board-tactical-math` retirement — this repo's Lesson four, and the reason section 12
exists at all. An implementer who hits four "change not found" errors at the very first
archive-gate step is being invited to conclude that section 12 is stale and skip to
section 13's hand-delete, which is the one path that reaches `openspec archive` with no
rehearsal at all. (Task 1.2 and proposal.md:38-42 already state the precondition
correctly and are now simply *satisfied* — the contradiction is confined to 12.1's
imperative.)

**Smallest fix** — replace tasks.md:1061-1069:

```markdown
- [ ] 12.1 Copy `openspec/` to a scratch directory. **All four predecessors —
      `add-stationkeep-hold-verb`, `serve-orbital-elements-and-burn-preview`,
      `build-production-space-view`, `add-scan-and-sightings-surface` — are
      already archived as of `3088748`, and `build-production-space-view`'s
      post-archive hand-steps (its tasks 13.1–13.5, including the `board-view`
      directory deletion) are already applied**, so the live tree is the tree
      this change will meet and the copy needs no pre-archiving. Confirm that
      before rehearsing, by task 1.2's listing and task 1.3's `board-view`
      grep; if either fails, archive whatever is outstanding **in the copy**,
      in the order above, before running 12.2. Rehearsing against an
      unarchived tree rehearses a shape that never ships.
```

---

## Notes recorded, not filed as findings

- **tasks.md:20** says "all four predecessors" and then names five (`add-fuel-as-cargo`
  through `add-scan-and-sightings-surface`). Pre-dates the verdict; cosmetic; listed so
  a future round does not re-derive it as new.
- **Five `system` test files carry the word `lattice` and are named by no task**:
  `backend/system/{gates_test.go, interior_decode_guard_test.go,
  interior_endpoint_contract_test.go, splice_completeness_test.go,
  station_splice_test.go}`. All five were already in this state at `67769ec` — they are
  round 5 MAJOR-4 territory, not verdict-expiry, and all five are among the 21 files
  task 2.10's own grep owns. Out of this round's scope; recorded only so the next 10.2
  run is not surprised by them.
- **`backend/action/commit_params_validator_continuous_test.go` is the only new
  `hexaverse/board` importer** since the verdict. Task 1.4's baseline ("SHALL list
  exactly the files sections 2–5 remove") therefore has one entry sections 2–5 do not
  name — but it is the change's own RED file, deleted/rewritten by its own GREEN step.
  Worth one clause in 1.4 if the writer is editing nearby; not worth a round on its own.

---

**VERDICT: NOT CLEAR** — 0 blockers, 3 majors, 0 minors. Spec text and MODIFIED-block
fidelity survive the archive intact (question 1 CLEAR, machine-verified on every
scenario heading); round 6's six rulings all landed as ruled (question 4 CLEAR); the
`board-tactical-math` retirement mechanism is the correct post-archive hand-delete and
is rehearsed. What expired is the worklist's grip on the tree: eight stale `check.py`
citations that mis-route the one edit that de-enrols the deleted packages (MAJOR-1), an
acceptance sweep the change's own RED phase cannot pass (MAJOR-2), and an archive
rehearsal whose first step is now a no-op that reads as a failure (MAJOR-3). All three
are mechanical repairs to `tasks.md`/`design.md`; none touches a requirement.
