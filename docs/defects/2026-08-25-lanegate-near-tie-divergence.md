# Defect: `LaneGateHex` near-tie bearing diverges across the Go↔TS seam

**Filed:** 2026-08-25, by the `pin-cross-stack-determinism-seam` change's
near-tie probe (its tasks.md, task 1.4, anticipated exactly this outcome).
**Status:** dissolved (openspec `delete-the-lattice`, 2026-09-04) — successor question filed as `2026-09-04-phaseindexof-near-tie-cross-target.md`
**Against:** `board-tactical-math` (`backend/board/gate.go` /
`frontend/lib/hex/gate.ts`), and the `cross-stack-determinism` capability's
scenario "A near-tie bearing selects the same candidate in both languages."
**Severity:** live production divergence on a persisted value
(`LaneTransit.EntryGate`), currently latent — no shipped galaxy topology is
known to sit on the knife-edge, and all 10 recorded `laneGate` fixture cases
sit far from ties (they were deliberately chosen that way).

## Repro

```
LaneGateHex(0, 0, 0, 100, 16)   // Go   → Hex{Q:6,  R:-13}  (ring index 46)
laneGateHex(0, 0, 0, 100, 16)   // TS   → {q: 7, r: -13}    (ring index 45)
```

Self at the origin, neighbor due galactic north, radius 16 (gate ring 13).
The bearing is `atan2(100, 0)` = exactly float64 π/2, which by mirror
symmetry is **mathematically exactly equidistant** between gate-ring
candidates `(7,−13)` and `(6,−13)` (their board directions are
`atan2(19.5, ±√3/2)`; all `atan2` inputs are bit-identical across the two
languages).

## Measured cause

- **Go** (`math.Atan2`, arm64): the two candidates' computed angular deltas
  differ by `2.22e-16` — one ULP at the atan2-output magnitude —
  `(6,−13)` = `0x1.6b94a0bf8231p-5` minus one such ULP. The strict `<`
  argmin therefore picks `(6,−13)` and the enumeration-order tie-break
  never engages.
- **Node/V8** (`Math.atan2`): the two deltas come out **bit-identical**
  (`0x0.0b5ca505fc118…` both). The tie-break engages and picks the earlier
  candidate in `ringHexes` order, `(7,−13)`.

So the spec'd rule ("ties broken by earliest in `RingHexes` order") is
honored by TS and unreachable in Go on this input: Go's `atan2` rounding
manufactures a winner before the tie-break can fire. Which side wins is an
accident of each libm's last bit — precisely the hazard the
`cross-stack-determinism` capability exists to pin down.

## Why nothing is currently on fire

`LaneGateHex`'s inputs are galaxy-generator system positions; a lane bearing
must land within ~1 ULP of a candidate-pair bisector for the languages to
disagree. The server is authoritative (it stamps `EntryGate`), so a client
disagreement shows as a preview drawing the wrong gate tile, not corrupted
state. But the seam contract claims bit-exact agreement, and this input
falsifies it.

## Recommended fix (separate change against `board-tactical-math`)

Replace the float `atan2`/`angleDelta` argmin with an exact comparison, per
the alternative already sketched in the pin change's design.md: compare the
lane vector against candidate direction vectors using integer/rational
cross- and dot-products (candidate directions are `(√3(q + r/2), −1.5r)` —
rescale by 2/√3 to `(2q + r, −√3·r)`… or work in the doubled-coordinate
integer basis so no irrational scale appears at all). Angular closeness and
the half-plane test are then exact integer arithmetic, the tie-break
becomes genuinely reachable and deterministic, and the two `atan2` calls —
and their `determinism:allow(discretized)` pragmas — disappear from the
seam entirely.

The fix change must also add the repro above as a `laneGate` case in
`fixtures/board/cases.json` (deferred from the pin change: recording it
today would freeze Go's accidental winner and permanently fail the TS
suite). Until then, `LaneTransit.EntryGate` values already persisted are
unaffected — the fix only changes which hex wins inside the knife-edge.

## Dissolved, not repaired (2026-09-04)

`delete-the-lattice` did not fix this. It removed the seam it lived on.

`LaneGateHex` is gone with `backend/board`, `frontend/lib/hex` (and its
successor `frontend/lib/polar`) is gone with the TypeScript mirrors, and
`fixtures/board/cases.json` — where the recommended fix said to record the
repro — no longer exists. There is no Go↔TS pair left to disagree, because a
lane gate's direction is now derived server-side only: `system.gateOrbit`
reduces the bearing to a phase index and SERVES it, and the client consumes
the served value rather than re-deriving it. The predecessor's own
"recommended fix" is therefore moot, including its instruction to add the
repro as a `laneGate` fixture case.

Nothing was persisted under the divergence and nothing needs re-deriving: the
`LaneTransit.EntryGate` field this defect named no longer exists either.

## The successor question, recorded rather than waved through (task 9.3)

Deleting the seam does not delete the JOB. `system.gateOrbit` still answers
"which direction does this lane depart in" by reducing an inexact bearing to a
discretized, tie-broken choice — through `space.PhaseIndexOf`, a fixed
twenty-comparison bracketing search over a pinned trig table, with the tie rule
stated explicitly in `crossAtOrBefore`. That is a materially better
construction than the `atan2` argmin it replaces.

But the axis moved rather than vanishing: from the LANGUAGE seam to the Go
BUILD-TARGET axis (arm64 vs amd64/GOAMD64=v1). Task 9.3 required checking
whether `fixtures/system/cases.json`'s `gateOrbitSweep` exercises near-tie
bearings. **It does not** — measured, not assumed: it draws two independent
`galaxy.Coords` uniformly from `[-2000, 2000]³` boxes, so the chance a drawn
bearing lands within one ULP of a table entry's direction is effectively zero;
and the `gateOrbit` hand family's tie case is an EXACT tie, which both targets
agree on by construction and is not the hazard.

Per task 9.3's own instruction, that is filed as a new open defect rather than
closed silently: `docs/defects/2026-09-04-phaseindexof-near-tie-cross-target.md`.
