# Link 9 `delete-the-lattice` — adversary round 5 (post-kickoff) + rulings

**Why.** Round 4 was CLEAR on the spec text. The implementation-kickoff architect then walked
the 100+ task worklist against the tree and found fifteen task-level gaps (C1–C15 in
`link9-impl-contract.md` §8) — the species an adversary pass on requirements does not
reach. The writer applied all fifteen; this round re-verified them. Verdict: **NOT CLEAR** —
1 blocker, 3 majors, 2 minors, all bred inside those repairs.

## Orchestrator rulings — ALL SIX ACCEPTED, apply each paste-ready fix exactly

| # | Ruling |
| --- | --- |
| BLOCKER-1 | 7.1: add the `backend/space/table.go:47` bullet and rewrite the verification clause to task 10.1's allow-list (docs/plans, docs/handoffs, docs/defects, openspec/changes/archive, this change's folder), dropping `--exclude-dir=archive`. |
| MAJOR-2 | 8.10: `:126` is the predicate, `:118` the comment; the "stays unedited" range becomes `:115-117,119-125`. |
| MAJOR-3 | 8.10: `:114`'s `createLattice` example is rewritten to a `components/space/webgl/` symbol. |
| MAJOR-4 | 10.2's list gains the thirteen files as pasted (two rewrites, five covered production files with their surviving comment lines, `backend/system/service.go:227` rewrite, and the already-covered-but-unlisted set). |
| MINOR-1 | 3.2c's grep clause notes it passes only once section 6 deletes `frontend/lib/board`; at task time it returns only `frontend/lib/board/` paths. |
| MINOR-2 | 7.1's `docs/specs/0008-movement-galaxy.md:380` entry annotated as 10.1's site. |

Round 6 re-verifies these six only.

## The adversary's report, verbatim

I have everything I need. Here is the round-5 re-verification.

---

## Verification of C1–C15 (all fifteen checked against the current tree, greps run)

| # | Present? | Evidence |
|---|---|---|
| C1 | **yes** | tasks.md:245 names all five `Station`-literal sites; `grep -rn 'angle0' frontend --include='*.ts' --include='*.tsx' \| grep -v node_modules` confirms `FleetActionsPanel.test.tsx:91`, `SystemSpaceView.test.tsx:81`, `use-market.test.tsx:41`, `market-service.test.ts:37`, and `lib/types/market.ts:67` (`orbit: {`) — every line number correct. See MINOR-1. |
| C2 | **yes** | 3.4 now names `backend/fleet/lattice_symbols_absent_test.go` and `stations/no_lattice_dock_predicate_test.go`; 12.5b's leg rewritten to "confirm the deletion landed". `components/fleet/`'s three `board.MovementState` comments fall under 10.1c's "every other hit… rewrite it". |
| C3 | **yes** | The refined grep in 2.8 executes clean: `grep -rn 'occlusionRadius2(' backend/ \| grep -v _test.go \| grep -v '^backend/system/fog_source.go:25'` → **empty**. `system/fog_source_test.go:44` (`if occlusionRadius2(FeatureStation) != 0`) is now named. |
| C4 | **yes** | 3.1 names `stations/service_test.go:90` (`want := DeriveOrbit(testGalaxySeed, sysID, svc.gateRing)` — verified), `system/generator.go:135`, `system/station_continuous.go:6-9` (verified `:6-9`, contract said `:6-7`; the task is the more accurate). |
| C5 | **half-applied** | 15 sites repointed and every line number verified — but the exclusion clause was never widened. **BLOCKER-1.** |
| C6 | **yes** | 2.10c (tasks.md:143) and 2.10d (:162) sit before 2.11 (:169); 7.5/7.6 survive as forwarding stubs (:557, :563) so design.md's three "task 7.5" citations (:147, :397, :449) still resolve; 2.12, 3.6, 4.6, 5.3 all carry the new dependency note. **No dangling forward reference.** |
| C7 | **applied, but mis-transcribed** | Ruled repoint landed — **MAJOR-2, MAJOR-3.** |
| C8 | **yes** | 2.4 states `orbitFor` "ceases to exist entirely"; 8.15 now says "re-derive the whole `coverage` array" and adds `orbitFor`. Verified `fixtures/system/mirror-map.json:63` is the `orbitFor` entry. |
| C9 | **yes, and safe** | 8.5 repoints `check.py:258-259` and `check-transcendental.sh:88` to `frontend/lib/market`; 8.14 repoints `check.py:250`. All four line citations verified exact. Checked the repoint does not arm a failing lint: `frontend/lib/market/fold.ts` has zero `Math.*` transcendental calls. |
| C10 | **yes** | design.md:213-219, recorded-not-fixed. |
| C11 | **yes, byte-exact** | `diff` of live `openspec/specs/system-interior/spec.md:1040-1156` against delta `specs/system-interior/spec.md:259-373` returns exactly two deleted lines — the `backend/board`/`backend/polar` sentence — and nothing else. All **ten** scenario headings diff clean. Block is under `## MODIFIED Requirements`; proposal.md:144-157 updated; 11.4 gained the confirmation leg. No other in-flight change modifies this requirement. |
| C12 | **applied, incomplete** | **MAJOR-4.** |
| C13 | **yes** | 9.3 now pre-authorizes the new defect entry with the reasoning. |
| C14 | **yes** | design.md:416-429. |
| C15 | **yes** | Ran the pattern: 25 hits, and neither `.gitlab-ci.yml:371` (`(cd board && "$QEMU" …`) nor `infra/docker/test-runner.Dockerfile:5` (bare `board`) is among them. Both verified present in the tree at exactly those lines. |

`openspec validate delete-the-lattice --strict` → `Change 'delete-the-lattice' is valid`.
`python3 .claude/scripts/openspec-reconcile.py delete-the-lattice` → `delete-the-lattice: OK`.

---

## Findings

### BLOCKER-1 — C5 was repaired on only one of its two branches; task 7.1's acceptance grep is now unpassable and contradicts task 10.1

**File:** `/Users/travis/Projects/hexaverse/openspec/changes/delete-the-lattice/tasks.md:514-517`

> Verified by `grep -rn 'fixtures/board\|fixtures/polar' . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=archive` returning nothing outside `docs/plans/` and `openspec/changes/archive/`, which are historical record and stay

C5 offered two branches: "Either the exclusion list widens or the sixteen sites get repointed." The writer took the repoint branch for 15 sites and left the clause byte-identical. But C5's own text named `docs/handoffs/` among the unexcluded directories, and no site there was repointed. Run today, after every one of the fifteen repairs lands, the stated grep still returns **14 live hits in 8 files** that no task touches:

```
docs/defects/2026-08-25-lanegate-near-tie-divergence.md:68
docs/defects/2026-08-25-line-fma-arch-divergence.md:14,83,129
docs/handoffs/2026-08-25-determinism-seam-remaining-work.md:98
docs/handoffs/2026-07-10-m8-board-depart.md:137
docs/handoffs/2026-08-11-webgl-board-renderer.md:115
docs/handoffs/2026-08-24-polar-lattice-migration.md:252,382
docs/handoffs/2026-07-10-m7-hex-board-view.md:22,123
docs/handoffs/2026-08-25-polar-board-rewrite-kickoff.md:26,106,111
```

Task 10.1 (`tasks.md:763-766`) explicitly declares those two directories permanent historical record — "SHALL return hits only under `openspec/changes/archive/`, `docs/plans/`, `docs/handoffs/` and `docs/defects/` — all historical record, which stays." Two tasks in the same file now disagree about the same directories.

Compounding it, the enumeration is short by one live site the grep returns and no task names anywhere:

- `/Users/travis/Projects/hexaverse/backend/space/table.go:47` — `// fixtures/polar/cases.json's `_meta.generatedOn` shape as closely as this`

(Verified: `grep -n "table\.go" tasks.md design.md` → no hits.)

**Exploit:** the criterion cannot be satisfied as written, so an implementer either stalls on 7.1 or waives the grep wholesale — and waiving is exactly what lets `backend/space/table.go:47` survive into the archive: a Go doc comment naming a fixture family that no longer exists, in `anti_mirror`-adjacent territory where nothing can ever fail on it. That is the silently-inert record Goal 2 exists to kill, reintroduced by the check meant to catch it.

**Smallest fix** — add one bullet and rewrite the clause:

```markdown
      - `backend/space/table.go:47` — `turnTableMeta`'s doc comment citing
        `fixtures/polar/cases.json`'s `_meta.generatedOn` shape as the
        provenance envelope it matches. Same species as the four Go doc
        comments above; repoint at `fixtures/space/turn-table.json`'s own
        `_meta` shape, which is what it actually describes.

      Verified by `grep -rn 'fixtures/board\|fixtures/polar' . --exclude-dir=node_modules
      --exclude-dir=.git` returning hits only under `docs/plans/`,
      `docs/handoffs/`, `docs/defects/`, `openspec/changes/archive/` and this
      change's own folder — the same allow-list task 10.1 uses, because those
      four directories are historical record and this change's own text
      necessarily names what it deletes
```

(The `--exclude-dir=archive` flag is also redundant with the `openspec/changes/archive/` clause and misleadingly excludes any directory named `archive` anywhere; dropping it makes the allow-list the single source of truth.)

---

### MAJOR-2 — the C7 repair swaps the roles of the two lines it edits, and freezes a range containing one of them

**File:** `/Users/travis/Projects/hexaverse/openspec/changes/delete-the-lattice/tasks.md:656-668`

> `:118` (predicate: `/components/board/webgl/.*\.(ts|tsx)$` → `/components/space/webgl/.*\.(ts|tsx)$`) and `:126` (the same path in the exemption comment's example). The rest of the comment block (`:112-125` — the tautology rationale and the pairing rule: "GL PLUMBING ONLY... anything that DECIDES lives outside") is policy, not lattice vocabulary, and **stays unedited**

In the actual file the assignment is inverted:

```
118:# docs/plans/webgl-board-port.md): components/board/webgl/ holds GL PLUMBING
126:if [[ "$FILE_PATH" =~ /components/board/webgl/.*\.(ts|tsx)$ ]]; then
```

`:126` is the predicate; `:118` is the comment. Worse, `:118` is inside `:112-125`, so the same sentence instructs the implementer to edit line 118 and to leave lines 112-125 unedited.

**Exploit:** an implementer who resolves the contradiction toward "stays unedited" leaves `components/board/webgl/` at `:118`; the task's own verification `grep -rn 'components/board' .claude/` then returns it and the task cannot close. An implementer who resolves it the other way believes they have edited a regex when they edited prose, and may not re-read `:126`. (design.md site 21, `:118,126`, correctly declines to assign roles — the role assignment is an invention of the repair.)

**Smallest fix:**

```markdown
- [ ] 8.10 `check-frontend-tests.sh`: **REPOINT, do not delete, the
      `components/board/webgl/` GL-plumbing carve-out (C7 ruling)** —
      `:126` (the predicate: `/components/board/webgl/.*\.(ts|tsx)$` →
      `/components/space/webgl/.*\.(ts|tsx)$`), `:118` (the same path inside
      the exemption comment's pairing rule), and `:114` (see below). The
      rest of the comment block (`:115-117,119-125` — the tautology rationale
      and the pairing rule's substance) is policy, not lattice vocabulary,
      and stays unedited.
```

---

### MAJOR-3 — the C7 repair strands `createLattice` in a file task 10.2 sweeps, and 8.10 forbids editing it

**File:** `/Users/travis/Projects/hexaverse/.claude/scripts/check-frontend-tests.sh:114`

```
114:# test for them degrades to `expect(typeof createLattice).toBe('function')` — a
```

Before the repair, 8.10 read "delete the `components/board/webgl/` GL-plumbing carve-out **and its comment**" — line 114 went with the block. The repair now declares `:112-125` policy that "stays unedited", so `createLattice` survives. Task 10.2's criterion (`tasks.md:817-825`) is that `grep -rni 'lattice' backend frontend .claude fixtures --exclude-dir=node_modules` return `TestInteriorRead_LatticeOnlyFieldsAreAbsentFromTheResponse` **alone**; I ran it, and `.claude/scripts/check-frontend-tests.sh` is in the result set. C12's hit list does not name the file, so nothing directs the implementer to it either.

**Exploit:** two tasks in direct conflict — 10.2 requires the word gone, 8.10 requires the line untouched. The change cannot reach its own acceptance without an implementer improvising a resolution the spec never granted. `createLattice` is also a symbol from the deleted lattice renderer, so it is Goal 1 vocabulary, not policy.

**Smallest fix** — append to 8.10 (paired with MAJOR-2's rewrite):

```markdown
      `:114`'s example symbol `createLattice` is lattice vocabulary from the
      deleted renderer, not policy: rewrite it to `createStarfield` (or any
      symbol from `components/space/webgl/`), because task 10.2's
      `grep -rni 'lattice' … .claude` sweep returns this line and admits no
      exemption for it.
```

---

### MAJOR-4 — C12's "derived mechanically, not enumerated by hand" list is short by 13 files, five of them production

**File:** `/Users/travis/Projects/hexaverse/openspec/changes/delete-the-lattice/tasks.md:835-841`

> **C12 — the hit list, derived mechanically, not enumerated by hand.** Running the sweep now (excluding `backend/board`, `backend/polar`, `frontend/lib/board`, `frontend/lib/polar`, deleted outright by sections 5–6, and the 21 files task 2.10's own grep already owns) returns the files below. **No new exemptions beyond the one wire-contract guard named above** — every one of these gets a one-word disposition…

I reproduced the derivation exactly (task 2.10's grep returns 21 files, confirmed; `grep -rli 'lattice' backend frontend .claude fixtures --exclude-dir=node_modules` returns 97; residue after both exclusions = **63 files**). The list names ~39. Uncovered by C12's list *and* by every other task:

- `backend/common/tuning_test.go:39,74` — `"the retired hex lattice"`. Section 4 names `:22-26,43-44` and `:52` only.
- `frontend/components/fleet/FleetRoster.test.tsx:131` — `"its wording retires the retired lattice view's \"board\""`. No task names this file (10.1c reaches `:9`'s `board.MovementState`, not `:131`'s word).
- `.claude/scripts/check-frontend-tests.sh:114` — MAJOR-3.
- `backend/system/fog.go:16,19,22,23,55`, `generator.go:44,46,47,71,72,120,121,124`, `handler.go:165,167,170`, `model.go:126,130,198`, `service.go:227` — five **production** files. Section 2 edits specific lines in four of them (2.1b→`model.go:190`, 2.4→`generator.go`, 2.7→`handler.go:115`, 2.9→`fog.go`'s DTO); `service.go` is named by no task at all. None of the surviving comment hits is at a line any task cites.

The list *does* give exactly the right treatment to three sibling files — e.g. `backend/system/gates.go` — **covered** (task 2.7 deletes `LaneGate.Cell`; four surviving comments at `:14,23,62,141` still need the word dropped, confirm they land in the same commit)" — so the omission is an inconsistency in the list's own convention, not a disagreement about what the convention should be.

**Exploit:** C12 was raised precisely so the volume is "budgeted before the developers start rather than discovered at task 10.2". A list that presents itself as a mechanical derivation, is relied on as complete, and is short by 13 files reinstates the discovery-at-10.2 failure it was filed to prevent — and `backend/system/service.go` in particular is production code no task reaches at all.

**Smallest fix** — extend the backend list and add a frontend entry:

```markdown
      `backend/common/tuning_test.go` (`:39,74`) and
      `frontend/components/fleet/FleetRoster.test.tsx` (`:131`) — **rewrite**;
      neither is reached by any other task's line citations.
      `backend/system/fog.go` — **covered** (task 2.9; surviving comments at
      `:16,19,22,23,55` still need the word dropped in the same commit);
      `backend/system/generator.go` — **covered** (task 2.4; `:44,46,47,71,72,
      120,121,124`); `backend/system/handler.go` — **covered** (task 2.7;
      `:165,167,170`); `backend/system/model.go` — **covered** (tasks 2.1/2.1b;
      `:126,130,198`); `backend/system/service.go` — **rewrite** (`:227`, named
      by no other task). Already-covered-but-unlisted, named here so a
      re-run of this sweep is not mistaken for new work:
      `frontend/lib/types/action.ts:5` (task 6.3),
      `fixtures/system/mirror-map.json:59,60,71` (task 8.15),
      `.claude/scripts/check-mirror-map.sh:9-10` (task 8.9, design site 17),
      `.claude/skills/code-quality-checks/check.py:1055` (task 8.6, design
      site 8), `backend/fleet/resolver_test.go:22` (adjacent to the `:23`
      citation task 4.2 already owns), and the `stations`/`mine`/`market`
      copies of `lattice_symbols_absent_test.go` plus
      `stations/{orbit_guard,no_lattice_dock_predicate}_test.go` and
      `stations/placement.go` (tasks 3.1/3.4).
```

---

### MINOR-1 — 3.2c's verification grep cannot pass at its own point in the sequence

**File:** `/Users/travis/Projects/hexaverse/openspec/changes/delete-the-lattice/tasks.md:257-260`

> Verified by `grep -rn 'angle0' frontend --include='*.ts' --include='*.tsx' | grep -v node_modules` returning **nothing**

`frontend/lib/board/` holds 12 further `angle0` hits (`orbit.ts:14,20,30,35,39`, `orbit.test.ts:9,14,15,16,17`, `intercept.test.ts:25,34,48`, `fixtures.test.ts:51,159,231,251`) and is not deleted until section 6. The C1 repair rewrote this sentence and strengthened the claim around it without noting the dependency — the same species of unpassable-as-written verification the C3 repair fixed for 2.8. Self-healing (section 6 lands it) and the lint backstop is real, so MINOR.

**Fix:** append to the verification clause — `returning nothing once section 6 deletes `frontend/lib/board` (which holds 12 further `angle0` hits until then); at task time the correct assertion is that the grep returns only `frontend/lib/board/` paths`.

---

### MINOR-2 — one entry in 7.1's list is not returned by 7.1's own grep

**File:** `tasks.md:508` — `docs/specs/0008-movement-galaxy.md:380`. That line reads `backend/board/ship.go` carries the `laneTransit`" and contains neither `fixtures/board` nor `fixtures/polar`; it is task 10.1's site, not 7.1's. Harmless over-inclusion, but it inflates 7.1's "fifteen" and would confuse anyone re-deriving the list. Move it to task 10.1's disposition list or annotate it as `(10.1's grep, listed here for the OQ-4 ruling only)`.

---

**VERDICT: NOT CLEAR** — one blocker (C5 half-applied, 7.1's acceptance grep unpassable and in direct conflict with 10.1) and three majors, all bred by or left standing inside the fifteen repairs. C1–C4, C6, C8–C11, C13–C15 verified correct against the tree; the C11 MODIFIED block in particular is byte-exact on all ten scenario headings and drops only the sanctioned sentence.