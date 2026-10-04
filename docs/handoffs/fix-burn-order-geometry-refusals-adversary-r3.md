# Adversary round 3 (final) — `fix-burn-order-geometry-refusals`

**Date:** 2026-10-04. **Mode:** change. **Round:** 3 of 3. Read-only on specs and code.

Scope: a spot-check of the repairs to the four round-2 MINORs and the copy-wording correction,
against the orchestrator's round-2 rulings. Unchanged text was not re-attacked. No probe was
run this round; nothing in the repo was written except this file.

## How "nothing else changed" was checked

- `proposal.md`, `tasks.md`, `specs/fleet-movement/spec.md` and `specs/docked-fleet-actions/spec.md`
  were diffed against the byte-exact copy of each that my round-2 read saved outside the repo.
  `proposal.md` is identical. The others differ in exactly the places the writer listed, and
  nowhere else: one line in `tasks.md` (1.4), four lines in `fleet-movement`, one line in
  `docked-fleet-actions`.
- `specs/corporation-spawn/spec.md`: the *Home Site Selection* block was diffed against my
  round-2 copy (one line differs, the table scenario's WHEN) and against the live requirement
  (the 16 carried scenarios are still byte-identical).
- `design.md` has no saved round-2 copy: the change folder is untracked and my round-2 read of
  it was on screen only. It was checked by reading. The section list is unchanged (Decisions
  1-13 with the same titles), and every passage the ruling names was read in its current form.
  Text outside those passages was compared against the round-2 read by eye, not by diff; I saw
  no other change, and that is the weaker of the two checks.
- `openspec validate fix-burn-order-geometry-refusals --strict` still reports the change valid.

## Round-2 findings — verification

| Finding | Ruled fix | Status | Evidence |
| --- | --- | --- | --- |
| MINOR 1 (task 1.4's id search) | Search also requires the derived index to differ from the seed-0 index and to be non-zero in at least one direction | **Fixed** | `tasks.md` 1.4 now reads "the derived index under the document's seed differs from the index derived under seed 0, and the derived index is non-zero in at least one of the two directions (preferably both)". No scenario text changed, as ruled |
| MINOR 2 (design.md self-contradiction) | Decision 8 vs 10 reconciled; no margin floor; task references renumbered; own host conditional; Decision 2 names the seed | **Fixed** | Decision 8: "the pass/fail table is the exception: it is written out by hand in the delta's calibration scenario (Decision 10)". Line 71: 0.08 is now what "the hand-written table in the delta pins cell by cell". Risks: "The hand-written table (Decision 10) fails when any cell moves". References now read task 1.10, task 1.7, and "task 1.2 checks the bound against positions computed from that orbit". Context line 8: "for the fleet's own host, at some phases only". Decision 2: task 1.4 "gives the fake graph's galaxy document a non-zero seed (it carries none today, so the walk's seed is 0) and a multi-body skeleton" |
| MINOR 3 (three of six body types) | State which row each type takes, verified against the code | **Fixed** | The scenario's WHEN now says "molten, oceanic and barren parents take the rocky row, as the feature family has no sub-rock types". That matches `backend/system/generator.go:300-309`, whose default arm maps every type other than gas giant and ice to the rocky feature |
| MINOR 4 (i) (scenario does not exercise "outranks a destination") | Arrange a destination inside the clearance | **Fixed** | The scenario now submits three orders: a point outside the clearance, "a point inside the clearance", and a point closer than the minimum arc; each is served the origin `409` |
| MINOR 4 (ii) (where a solve-only fault sits) | Absent body, then origin, then the solve; faults requirement gains the exception | **Fixed** | The fixed-order requirement adds: "A fault discoverable only in the solve itself, such as a present target body whose parent chain names a missing body, is therefore not reached for a fleet whose origin is inside the clearance, which is served the origin refusal." The faults requirement opens "Except where *Burn Solve Refusals Are Decided in a Fixed Order* serves the origin refusal first". The missing-parent scenario's GIVEN now starts "a fleet outside the clearance" |
| Observation (c) (copy wording) | "not in this system", everywhere it is pinned | **Fixed** | `docked-fleet-actions` delta and `design.md` Decision 13 both read "That body is not in this system. Pick another target."; a search of the change folder finds no remaining "no longer in this system" |

## New contradictions introduced by the repairs

None found. Two checks were made specifically:

- The faults exception does not swallow the other fault cases. A fleet whose own stored host no
  longer resolves fails at the position read, before the origin test (`design.md` Decision 4,
  "Absent target vs stored host"), so the fixed order never "serves the origin refusal first"
  for it and the `5xx` scenario stands unqualified.
- The fixed-order sentence, the faults exception and Decision 4's step order (absent-body
  lookup, origin pre-test, then the solve) now say the same thing in all three places.

No material findings. The change is implementation-ready.

VERDICT: CLEAR

## Orchestrator rulings

Round 3 of 3: CLEAR, no findings to rule. Adversary rounds used: 3 of 3 — any further spec edit on this change cannot buy another round; residue would become a follow-up change.

Verdict commit:
