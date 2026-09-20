# Link 9 `delete-the-lattice` — adversary round 8 (scoped verification of round 7's repairs)

**Why.** Round 7 returned NOT CLEAR with three majors; `5faa4fa` applied them plus the
addendum (parts A–E) and rulings F and G. This change's history is that repairs breed
residue — round 5 found six findings inside round 4's repairs, and round 7's MAJOR-2 fix
was proven unsatisfiable by measurement after it was ruled. This round verifies the five
scoped questions and hunts residue of the repairs themselves. It re-attacks nothing else:
requirement quality, testability, capability boundaries, spec delta text, MODIFIED-block
fidelity, the `board-tactical-math` retirement mechanism and the five OQ rulings are all
out of scope by the orchestrator's instruction.

Verdict: **NOT CLEAR** — 0 blockers, 2 majors, 2 minors. **All four in-scope repairs
verified correct.** Both majors are residue: one repair that was applied to two of the
three sweeps that needed it, and one pre-existing hole the repair's new
"do not widen" prohibition sharpened.

Everything below was **measured** under `bash` with `/usr/bin/grep`, at `5faa4fa`, clean
tree. The interactive-shell `grep`→`ugrep` alias strips `./` and honours `.gitignore`;
every number here was taken with the real binary.

---

## Orchestrator rulings — ALL FOUR ACCEPTED. This is the LAST round.

Ruled 2026-09-04 at commit `5faa4fa`. Round 8 was the last adversarial round on this
change; there is no round 9. The repairs below are mechanical, each has paste-ready
text, and I verify them myself against the tree rather than spending another round.

| # | Ruling |
| --- | --- |
| MAJOR-1 | **Accepted.** Add `-I` and `--exclude-dir=.next --exclude-dir=.next-e2e` to task 7.1's grep and to the harness's 7.1 leg, plus the clause making explicit that 7.1's exclusion set is 10.1's *plus* ruling D. Ruling D was a finding of fact about compiled bundles — it applies wherever the sweep's subject is source residue, and I under-scoped it to 10.1/10.2 when 7.1 sweeps two of the same eight patterns. |
| MAJOR-2 | **Accepted, and the refusal to add a filter is the right call.** Append the sequencing exception verbatim. It stays *documentation*, not a filter: the 24 `openspec/specs/` hits are the change's own not-yet-archived spec surface, they are confirmed by inspection and re-confirmed at 13.4, and the remainder outside `openspec/specs/` stays required-empty. Adding a filter would blind the gate to the one surface sections 12–13 exist to clear. My "do not widen" clause created this trap by converting a documentation gap into a prohibition; the exception is scoped so the prohibition still binds everywhere else. |
| MINOR-1 | **Accepted.** `proposal.md:38` "four" → "five"; reconcile 12.1's count with 1.2's. |
| MINOR-2 | **Accepted.** `tasks.md:1130-1131`'s stale "unarchived" framing for `add-scan-and-sightings-surface`. |

**Why these are repaired now rather than deferred as follow-ups.** My round-7 ruling said
non-BLOCKER residue at the cap becomes a follow-up change. That rule does not fit these
two majors: tasks 7.1 and 10.1 are acceptance gates *inside this change*, and both are
unsatisfiable as written. A follow-up change cannot rescue a gate that must pass before
this change archives — the implementer would hit them at section 7 and section 10 and be
left with the waive-or-stall choice that round 5's BLOCKER-1 identified as the path by
which inert residue reaches an archive. Deferring would be choosing the failure mode the
whole sweep exists to prevent.

**Closing the round.** No round 9. I verify these four repairs mechanically — the same
way I independently confirmed round 7's eight repointed citations — and proceed to
implementation. The adversary's own grading note is accepted: the compounding factor that
made round 5's version a BLOCKER (an enumeration also short by a live unnamed site) is
absent here, every file in both remainders is named, and no wrong implementation is
permitted by either finding.


## Verification table

| # | Question | Result | Evidence |
|---|---|---|---|
| 1 | MAJOR-1: eight repointed `check.py` citations resolve at HEAD | **CLEAR — independently confirmed, I agree with the orchestrator** | Symbol grep: `run_determinism_cross_target`=`:1077`, `run_mirror_map_check`=`:1188`, `determinism_trigger`=`:1525`, `mirror_trigger`=`:1544`. Site 8 `design.md:278`→`:1081–1084` = the docstring lines, `:1084` being `package, per openspec polar-lattice-math)`. Site 9 `:280`→`:1107–1131` = both `go test ./board/ ./polar/ ./space/ ./system/ ./galaxy/` strings (`:1109`, `:1123`) and all four result messages (`:1112,1114,1127,1129`). Site 10 `:282`→`:1190–1191` = `run_mirror_map_check`'s `backend/board`/`frontend/lib/board`/`fixtures/board/mirror-map.json` lines. Site 11 `:283`→`:1519–1527` = the comment naming `backend/board, backend/polar` (`:1519`) plus the predicate's board/polar clauses (`:1526–1527`). Site 12 `:285`→`:1537–1549` = the `frontend/lib/board`/`frontend/lib/polar` comment (`:1537–1538`), `backend/polar` (`:1541`) and all four predicate clauses (`:1545,1546,1548,1549`). `design.md:423`→`:1537-1549` same block. `tasks.md:179`→`:1107-1131` contains `./system/` in both commands. `tasks.md:1021`→`:1084` is the `polar-lattice-math` line. **8/8.** |
| 1a | The re-derive-by-symbol sentence landed | **CLEAR** | `design.md:355-357`, verbatim as ruled, closing the *32 sites, 15 files* section. Placed 70 lines below the check.py block rather than immediately under it — recorded, not filed (see Notes). |
| 2 | MAJOR-3: task 12.1 executable as written at HEAD | **CLEAR** | `openspec/changes/` = `archive/` + `delete-the-lattice/` only. All five predecessors present in `archive/` (`2026-09-02-add-fuel-as-cargo`, `-add-stationkeep-hold-verb`, `2026-09-03-serve-orbital-elements-and-burn-preview`, `-build-production-space-view`, `2026-09-04-add-scan-and-sightings-surface`). `openspec/specs/board-view/` absent; `grep -rn board-view openspec/specs/` empty. 12.1's confirm-then-proceed form runs with no scratch pre-archiving and its conditional tail survives. |
| 3 | Addendum E: tasks 10.1/10.2 pipelines vs `link9-acceptance-greps.sh` legs | **CLEAR** | Mechanical diff, not eyeball. `tasks.md:817-821` vs script `:302-306`, and `tasks.md:908-911` vs script `:326-329`: **identical after removing only the harness's `out="$(` … `)"` capture wrapper and its ` 2>/dev/null`**. Filter order, quoting, flags, patterns all match character-for-character. (The tasks' phrase "byte-identical" is therefore true of the pipeline and false of the literal line — see Notes.) |
| 3a | Each exemption carries its reason | **CLEAR** | 10.1: five allow-list dirs (`tasks.md:827-830`), `.next`/`.next-e2e` (`:831-834`, ruling D), the change-folder **path** exclusion with its pre-archive-only note and the 79-line-content-filter history (`:835-840`, ruling C), `commit_params_validator_continuous_test.go` (`:841-843`). 10.2: `.next` (`:932-934`), the wire-contract guard (`:935-936`), `sub-lattice` (`:937-941`), `-Ev 'RED-phase .*delete-the-lattice'` (`:942-945`). Matches the harness's exemption block (`:227-263`) item for item. |
| 3b | Deliberately-absent filters recorded as absent | **CLEAR** | 10.1 (`tasks.md:845-850`): no blanket id content filter, no `sub-lattice` (0 lines), no `TestInteriorRead_…` (0 lines). 10.2 (`:947-956`): no blanket id content filter (with the six lines named), no `commit_params…` filter (0 lines). Same four the harness records at `:265-283`. Both carry **Do not widen**. |
| 3c | Measured blast radii | **CLEAR, all exact but one** | `.next`+`.next-e2e`: **17** lines on 10.1, **42** on 10.2 = the 59 both tasks cite. `commit_params…` filter on 10.1: **exactly 2**, both prose (`:13`, `:20`). `sub-lattice` on 10.2: **7**, all in `phase_reachability_test.go`. RED-header filter: **exactly 4**, each a file's line 3. Totals **10.1 = 182**, **10.2 = 592** — both exactly as the harness records. Only the harness's "Removes 81 lines" for the path filter has drifted (measures **80** now); see Notes. |
| 3d | **The six tracked prose lines are still visible in leg 10.2's output** | **CLEAR — measured, all six present** | `backend/system/fog.go:22`, `model.go:130`, `interior_wire_lattice_removal_test.go:209`, `generator_continuous_test.go:327,339,383` each appear exactly once in the 592-line output. Ruling B holds: the gate can still prove they vanish. |
| 3e | Ruling A/F rewordings actually cleared the RED artifacts | **CLEAR** | The four RED files contribute **zero** surviving hits to leg 10.2 — their only `lattice` occurrences are the four line-3 headers (filtered) and `phase_reachability_test.go`'s seven `sub-lattice` uses (filtered). `:25`'s `post-delete-the-lattice` is gone; `t.Errorf`'s `sub-lattice` failure message at `:156` is intact, as ruling A required. `commit_params_validator_continuous_test.go:10`'s `all lattice vocabulary` is gone. |
| 3f | Ruling G's halt-and-report clause is where a developer reads it before acting | **CLEAR** | `tasks.md:137-152`, **inside task 2.10**, immediately after 2.10's mechanical file-list grep and before 2.10b. Task 10.2 cross-references it (`:958-963`). Its factual claim re-verified at HEAD: 2.10's grep returns **21 files** (unchanged after the RED suite landed) and **exactly one** of them — `generator_continuous_test.go` — is in `red-manifest-delete-the-lattice.txt`. `phase_reachability_test.go` is a new `backend/system/*_test.go` that does **not** match 2.10's pattern, so "one file in that 21-file list is not yours" is still exactly true. |
| 4 | Promoted note: task 1.2 "all five predecessors" | **CLEAR in tasks.md, missed in proposal.md** | `tasks.md:20` now says five and names five. `proposal.md:38` still says "the four predecessors" and names five. See MINOR-1. |
| 4a | Promoted note: task 1.4's RED-file exception clause | **CLEAR** | `tasks.md:31-38`. Re-derived the baseline at HEAD: 35 importers; the 10 not named literally are all inside task 2.10's 21-file query (correct — 2.10 owns by query, not enumeration); `commit_params_validator_continuous_test.go` is the **only** importer outside sections 2–5, exactly as 1.4 now says. The other three RED files import neither package. |
| 5 | Residue: is 7.1's "10.1's five-directory allow-list" a dangling reference? | **No — but the sentence is now materially incomplete** | 10.1 still expresses all five directories as filters and 7.1 restates them inline, so nothing dangles. What broke is the *equivalence claim*: 10.1 gained `-I` and `--exclude-dir=.next --exclude-dir=.next-e2e`; 7.1's grep did not. See MAJOR-1. |
| 5a | Residue: do the rewritten 10.1/10.2 leave unowned hits? | **CLEAR** | Every file in leg 10.1's 182-line remainder (29 files after removing the six deleted directories) and every file in leg 10.2's 592-line remainder (61 files after removing the deleted directories and 2.10's 21) is named somewhere in `tasks.md`. Zero unnamed. r5's "enumeration short by one live site" failure mode is not present. |
| 5b | Residue: `.next` leakage anywhere else in the harness | **exactly one leg** | Full harness run (`4 pass, 21 fail, 5 info` — the failures are the expected pre-implementation RED). All 16 `.next` lines in the entire run appear in **one** leg: 7.1. 12.5b, 6.3, 10.1b, 10.1c return none. |
| 6 | Residue: repaired tasks vs untouched tasks | **FAIL ×2** | Task 11.4 still asserts a predecessor is unarchived, contradicting the repaired 12.1 (MINOR-2). Task 10.1's rewritten "remainder SHALL be empty" + "do not widen" contradicts task 7.1's recorded `openspec/specs/` carve-out for the identical evidence (MAJOR-2). |

---

## Findings

### MAJOR-1 — ruling D was applied to 10.1 and 10.2 but not to task 7.1, whose grep sweeps the same subject; 7.1's acceptance criterion is unsatisfiable again, and its "same allow-list task 10.1 uses" sentence is now false

**Files:** `openspec/changes/delete-the-lattice/tasks.md:547-557` and
`docs/plans/continous_space/handoffs/link9-acceptance-greps.sh:199-204`

> Verified by `grep -rn 'fixtures/board\|fixtures/polar' . --exclude-dir=node_modules
> --exclude-dir=.git` returning hits only under `docs/plans/`, `docs/handoffs/`,
> `docs/defects/`, `docs/specs/` … `openspec/changes/archive/` and this
> change's own folder — **the same allow-list task 10.1 uses** …

`fixtures/board` and `fixtures/polar` are two of task 10.1's eight patterns, so 7.1 and
10.1 sweep overlapping evidence — which is why 7.1 was rewritten to cite 10.1 in the
first place (r5 BLOCKER-1). The repair gave 10.1 `grep -I` and
`--exclude-dir=.next --exclude-dir=.next-e2e` under ruling D. **7.1 got neither.**

Measured at HEAD, 7.1's grep as written, after subtracting its own allow-list, its two
`openspec/specs/` exceptions and the six directories sections 5–6 delete:

```
16  ./frontend/.next{,-e2e}/{server,static}/chunks/…   all one line:
    "// fixtures/market/cases.json — the same discipline fixtures/board/cases.json"
 1  Binary file ./.claude/skills/code-quality-checks/__pycache__/check.cpython-313.pyc matches
```

All 16 are compiled copies of `frontend/lib/market/fold.ts:6` — a comment **7.1's own
bullet at `:527` rewrites**. The stale bundles are not rebuilt by any task before 7.1,
and ruling D's finding of fact ("no source edit can ever clear a compiled bundle") applies
verbatim. The binary line survives only because 7.1's grep lacks the `-I` every harness
leg carries. The harness's 7.1 leg (`:199-204`) has `-I` but not the `.next` exclusions,
and states its expectation as "expect nothing once task 7.1's sixteen named repoints
land" — measured against the live tree it prints 16 lines it can never not print. This is
the only leg in the whole harness that leaks build output.

**Exploit.** An implementer finishing section 7 runs the stated verification, gets 17
hits outside the allow-list that no bullet of 7.1 names, and has three moves: hunt
residue that does not exist, stall, or waive the gate — and waiving is the move r5's
BLOCKER-1 identified as the one that lets a silently-inert record reach the archive. Two
tasks in the same file once again disagree about the same evidence, and 7.1's text
asserts they agree.

**Why MAJOR and not BLOCKER**, by r5's own standard: r5 graded this species BLOCKER
because the enumeration was *also* short by a live unnamed site (`backend/space/table.go:47`),
so a waiver shipped real residue. That compounding factor is absent now — I checked every
file in both sweeps' remainders and all are named — and 7.1's patterns are a strict
subset of 10.1's, which *is* correctly filtered. No wrong implementation is permitted;
a wasted debugging loop and a discredited gate are.

**Smallest fix** — two tokens plus a flag, in one line each. `tasks.md:547-548`:

```markdown
      Verified by `grep -I -rn 'fixtures/board\|fixtures/polar' . --exclude-dir=node_modules
      --exclude-dir=.git --exclude-dir=.next --exclude-dir=.next-e2e` returning hits only under `docs/plans/`,
```

and the same `-I`/`--exclude-dir` pair on `link9-acceptance-greps.sh:199` (SDET-owned).
Add one clause to `tasks.md:552-553`: *"— the same allow-list task 10.1 uses, plus ruling
D's `.next`/`.next-e2e` exclusion and `-I`, for the same reason: the sweep's subject is
source residue, and 16 stale bundle copies of `frontend/lib/market/fold.ts:6` sit under
this pattern until something rebuilds."*

---

### MAJOR-2 — task 10.1's remainder cannot be empty at its position in the sequence, and the repair's new "do not widen" now forbids the exemption task 7.1 grants for identical evidence

**File:** `openspec/changes/delete-the-lattice/tasks.md:811-850` (task 10.1)

> The remainder SHALL be **empty**. … **Do not widen** beyond the filters printed above.

10.1's pattern set includes `board-tactical-math`, `polar-lattice-math`, `backend/board`,
`backend/polar`, `fixtures/board`, `fixtures/polar`. Measured at HEAD, leg 10.1's
remainder contains **24 hits under `openspec/specs/`**:

```
openspec/specs/cross-stack-determinism/spec.md   13   (:26,29,34,35,38,39,52,53,147,198,204,213,244)
openspec/specs/board-tactical-math/spec.md        3   (:12,15,821)
openspec/specs/space-kinematics/spec.md           4   (:15,16,17,39)
openspec/specs/system-interior/spec.md            3   (:24,118,1085)
openspec/specs/trading-station/spec.md            1   (:79)
```

Every one of these is cleared **only** by sections 12–13: `openspec archive` applies the
MODIFIED deltas (12.x/13.x), task 13.1–13.2 hand-edit the `## Purpose` blocks, task 13.3
hand-deletes `board-tactical-math/`. Section 10 runs **before** all of it, and 13.3 re-runs
only 12.4's and 12.5's greps — never 10.1's. So the gate as written cannot pass at any
point in the sequence.

Task 7.1 handles exactly this and says so, at `tasks.md:558-561`: *"Run at this point in
the sequence it also returns `openspec/specs/cross-stack-determinism/spec.md` and
`openspec/specs/board-tactical-math/spec.md`, which sections 12–13 clear; those two are
expected here and are not residue."* 10.1 has no equivalent sentence and never did — but
before the repair it merely lacked one. The repair added **"Do not widen beyond the
filters printed above"**, which converts a documentation gap into a prohibition: the
implementer is now explicitly forbidden from doing what 7.1 authorizes for the same files.

**Exploit.** At the end of section 10 — the Goal-2 acceptance gate — the implementer gets
24 hits, recognises them as the change's own not-yet-archived spec surface, and is told
not to widen. Either section 10 is declared failed and the change stalls at its last gate,
or 10.1 is waived, which is the wholesale-waiver outcome ruling B and the do-not-widen
clause exist to prevent. The residue itself never escapes (12.3/12.4/12.5 and 13.4 verify
the archived shape), so this is a gate-credibility failure, not a shipped-residue one.

**Smallest fix** — one sentence, no filter change, appended to 10.1's reason list after
`tasks.md:843`:

```markdown
      - **Not a filter — a sequencing exception, recorded so it is not mistaken for
        residue.** Run at this point in the sequence this leg also returns the change's
        own not-yet-archived spec surface under `openspec/specs/`
        (`cross-stack-determinism`, `board-tactical-math`, `space-kinematics`,
        `system-interior`, `trading-station` — 24 hits at authoring time). Every one is
        cleared by `openspec archive` plus tasks 13.1–13.3, exactly as task 7.1 records
        for the same two files. They are expected here and are **not** residue; the
        remainder outside `openspec/specs/` SHALL be empty. Do not add a filter for them
        — confirm by inspection that every `openspec/specs/` hit is a line one of this
        change's deltas or tasks 13.1–13.2 removes, and re-confirm at task 13.4.
```

---

### MINOR-1 — the "four predecessors" repair landed in `tasks.md` but not in `proposal.md`, and task 12.1 now says four where task 1.2 says five

**Files:** `openspec/changes/delete-the-lattice/proposal.md:38`,
`openspec/changes/delete-the-lattice/tasks.md:20` (fixed), `tasks.md:1161` (says four)

`proposal.md:38` still reads "**the four predecessors are archived, in order** —
`add-fuel-as-cargo` (done), `add-stationkeep-hold-verb`, … `add-scan-and-sightings-surface`"
and then names five — the twin of the note the ruling promoted, applied to only one of its
two sites. Task 12.1's replacement independently says "**All four predecessors**" and names
four (correctly excluding `add-fuel-as-cargo`, archived long before), while task 1.2 says
five and names five, and 12.1 tells the reader to confirm *by task 1.2's listing*. Three
counts of "predecessors" across one change, in the three places a resuming agent reads
first. Nothing is factually wrong; the vocabulary is.

**Fix:** `proposal.md:38` → "**the five predecessors are archived, in order**".
`tasks.md:1161` → "**All four predecessors still ahead of this change at authoring time —
… (`add-fuel-as-cargo` archived earlier; task 1.2 lists all five)**".

---

### MINOR-2 — task 11.4 still says `add-scan-and-sightings-surface` is unarchived, contradicting the repaired task 12.1

**File:** `openspec/changes/delete-the-lattice/tasks.md:1130-1131`

> The one predecessor still unarchived is `add-scan-and-sightings-surface`, and it is
> confirmed safe: …

`3088748` archived it; `12.1` (repaired) says so by SHA. 11.4 is one of the tasks
MAJOR-3's repair did not touch, and it is the same species MAJOR-3 was: a task asserting a
tree state that no longer holds. Unlike 12.1 it stays **executable** — "every predecessor
still ahead of this change" is now the empty set, so the check degenerates to the live
spec, which is simpler rather than broken — and its substantive safety argument was
machine-verified CLEAR in r7 question 1a. Only the framing is stale.

**Fix:** `tasks.md:1130-1131` → "`add-scan-and-sightings-surface` was the last predecessor
and archived at `3088748`; its deltas are confirmed non-overlapping: it MODIFIES …".

---

## Notes recorded, not filed as findings

- **"Byte-identical" is true of the pipeline, not of the line.** Tasks 10.1/10.2 differ
  from the harness legs by exactly the harness's `out="$(` … `)"` capture wrapper and its
  ` 2>/dev/null`. Ruling E is satisfied in substance; a future reader "restoring"
  byte-identity in either direction would be making a no-op edit.
- **`-I` and `--exclude-dir=node_modules --exclude-dir=.git` carry no reason** in either
  task's "Every filter above carries its reason" list. The last two are self-evident; `-I`
  is not, and it does suppress one real match (`__pycache__/check.cpython-313.pyc`, a
  compiled copy of `check.py`'s `fixtures/board/mirror-map.json` docstring). Correct
  behaviour, undocumented rationale.
- **`link9-acceptance-greps.sh:234` records the change-folder path filter as "Removes 81
  lines"; it removes 80 at HEAD** — the repair commit edited the change folder the filter
  measures. The two numbers the harness asks you to re-record (`10.1 = 182`, `10.2 = 592`)
  are both **exact**. SDET-owned, informational.
- **Missing blank line at `tasks.md:963/964`**: the ruling-G paragraph ends "…before
  acting." and `**C12 — the hit list…**` begins on the next line, so the two run together
  in rendered markdown.
- **The re-derive-by-symbol sentence sits at `design.md:355-357`**, closing the whole
  32-site section, 70 lines below the `check.py` block whose numbers it governs, and opens
  "These line numbers" with the nearest antecedent being site 32's
  `fixtures/system/mirror-map.json:59,60,71`. Verbatim as ruled, so not a deviation —
  recorded only because a developer jumping to site 8 may not scroll to it.
- **Out of scope, unchanged since r7 and recorded so a future run is not surprised:** the
  five `backend/system` test files carrying `lattice` that no task names literally
  (`gates_test.go`, `interior_decode_guard_test.go`, `interior_endpoint_contract_test.go`,
  `splice_completeness_test.go`, `station_splice_test.go`) — all five are inside task
  2.10's 21-file query, which owns them by derivation.

---

**VERDICT: NOT CLEAR** — 0 blockers, 2 majors, 2 minors. **Every repair round 7 ordered
landed and is correct**: all eight `check.py` citations resolve by symbol at HEAD, the
re-derive sentence is verbatim, task 12.1 is executable against the archived tree, both
sweep pipelines match the harness character-for-character with every exemption and every
deliberate absence recorded, all six tracked prose lines are measurably still under leg
10.2's gate, the four RED files contribute zero surviving hits, and ruling G's
halt-and-report clause sits inside task 2.10 where the developer reads it before acting —
with its "one file in that 21-file list" claim still exactly true after the RED suite
landed. What the residue sweep found is one repair applied to two of the three sweeps that
needed it (task 7.1 never got ruling D, and its grep is unsatisfiable again — the r5
BLOCKER-1 seam, reopened one flag lower), and one pre-existing hole the repair's new
"do not widen" prohibition turned from a documentation gap into a contradiction
(task 10.1 vs task 7.1 on the `openspec/specs/` surface that only sections 12–13 clear).
Neither permits a wrong implementation; both are gate-credibility failures whose fixes are
one flag and one sentence. Under the orchestrator's follow-up rule they defer — but
MAJOR-1's fix is `-I --exclude-dir=.next --exclude-dir=.next-e2e` on two lines and costs
less to apply than to carry.
