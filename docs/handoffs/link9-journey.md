# Link 9 `delete-the-lattice` — the archive gate (tiers 3 and 4)

Run 2026-09-04 by the orchestrator at `a392a1f`, tree locked, emulators reset
to a clean project before each tier. Each tier ran **once**.

## The journey judgement — no new journey spec was written

The workflow has the SDET write one journey spec per change at this gate. **Link 9
is a pure deletion**: it adds no player-visible behaviour, and the continuous-space
UI it must not break was built by links 8a-2 and 8b, which already carry journey
specs that walk it. Writing a new journey here would mean inventing a walk with no
new behaviour to walk — the "written blind" failure `docs/testing-tiers.md` warns
about, and half of this repo's historical e2e reds.

So **the existing e2e suite is this link's journey**, which is exactly what tasks 6.4
and 11.5 call for. For a deletion the proof obligation is that the slice still works,
not that something new does. Recorded here rather than left as a silent skip.

## Tier 3 — `npm run test:backend:all`

**1875 tests, 1 skipped, 1 failure, 1007.5s (16.8 min).** Budget is 90m; no timeout.

The single failure is `TestSpawn_Scenario_StartingFuelReachabilitySample`
(`backend/fuel_spawn_starting_fuel_e2e_test.go:249`) — **pre-existing, filed at
`43965a8`** as `docs/defects/2026-09-04-station-orbit-dips-inside-star-clearance.md`,
and **not a link-9 regression**:

- The identical suite **passed at `79ab9b1`**, already post-G5 and post-G7, with the
  station-derivation code in its final link-9 state. The only diffs since are comments
  and test-variable renames.
- It **passes in isolation** — independently re-run at this gate: `--- PASS … (1.30s)`
  against 27.6s in-suite. The failure depends on how much galaxy earlier tests have
  materialized.
- The fix lives in `system.StationContinuousOrbit`'s fallback radius, which this change
  does not touch. Repairing it here would be the opportunistic edit the spec-first rule
  forbids; it needs its own change.

Worth carrying forward: **the test's own failure message misreads its own failure.**
It reports "a signal to retune `FuelParams.StartingFuelTons`" — an affordability
shortfall — when the actual server response is `500 fleet: solving burn: space:
endpoint at or inside the star-clearance radius`. Anyone who trusts that message will
tune a parameter unrelated to the cause. The defect records the correction.

## Tier 4 — `cd frontend && npm run e2e`

**19 passed, 3 failed, 9.6 min.** The emulator project was wiped by the harness at
start (`[e2e] wiped emulator project 'hexaverse-emulator'`), so tier 4 did not inherit
tier 3's data — the reset link 8b's gate lost a full run to.

All three failures are in `space-double-submit.spec.ts`, in its **wire-capture helper**
— a known pre-existing flake, and one no link-9 task covers. **Not a link-9 finding,
and no batched revision round was triggered.** The evidence rules out a regression:

| Spec | Uses the same wire assertion? | Result |
| --- | --- | --- |
| `space-journey.spec.ts:88` — spawn→burn→dock→mine→sell→refuel→gate→jump | yes (`:150`) | **PASS** 1.2m |
| `slice.spec.ts:80` — the vertical slice | yes (`:104`) | **PASS** 1.8m |
| `jump-commit.spec.ts:64` — "the jump order naming the laneId **the interior read itself served**" | yes, *and asserts the lane-gate body id specifically* | **PASS** |
| `scan-journey.spec.ts` ×4, `refuel-commit.spec.ts` | yes | **PASS** |
| `space-double-submit.spec.ts` ×3 | yes | **FAIL** in 2.0–2.1s |

**The third failure's message is misleading and worth recording.** It reads "the
interior read for `sys_-6_-5` served no lane-gate body id", which sounds like a payload
gap — exactly the kind link 9's wire removals could have caused. It is not. The
expression is `(interiors.get(homeId)?.laneGates ?? [])[0]`, so an **empty capture map**
produces that message just as readily as a served-but-empty `laneGates`. `jump-commit`
passing on the identical served-lane-gate assertion is what settles it: the wire is
fine, the capture is flaky.

The fast-fail timing corroborates it — 2.0–2.1s (map empty on arrival) against 17–80s
for every passing spec. A genuine wire regression would have taken the siblings down
with it.

## Suite budget

Tier 3 **1007.5s / 90m budget**. Tier 4 **9.6 min**, 22 tests, 1 worker. Neither
overran; no timeout was raised.
