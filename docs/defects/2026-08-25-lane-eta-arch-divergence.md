# Defect: lane-leg ETAs are architecture-dependent (`legMs` / `laneLength`)

**Filed:** 2026-08-25, by the `pin-cross-stack-determinism-seam` adversarial
review; reproduced and confirmed in compiler output by the orchestrator.
**Status:** fixed (migrate-fleet-to-continuous-burns)
**Against:** `fleet-movement` (`backend/fleet/routing.go:186-197`) and the
`cross-stack-determinism` capability.
**Severity:** same class as the `board.Line` FMA defect, on a **persisted ETA**,
on a code path nobody had surveyed. Currently unmeasured in magnitude.

## What is wrong

```go
func legMs(a, b galaxy.System, msPerDistance float64) common.WorldMillis {
	return common.WorldMillis(math.Round(laneLength(a, b) * msPerDistance))
}

func laneLength(a, b galaxy.System) float64 {
	dx := a.Coords.X - b.Coords.X
	dy := a.Coords.Y - b.Coords.Y
	dz := a.Coords.Z - b.Coords.Z
	return math.Sqrt(dx*dx + dy*dy + dz*dz)
}
```

`legMs` feeds `routePlan.legMs` → `LegEtas`, which is persisted on a
`LaneTransit`. Three independent determinism violations in two functions:

### 1. Float contraction — verified in assembly

`dx*dx + dy*dy + dz*dz` is the canonical fusable shape.

```
GOARCH=arm64 go build -gcflags=-S ./fleet   ->  FMADDD x5 at routing.go:196
GOARCH=amd64 go build -gcflags=-S ./fleet   ->  0
```

So a lane's crossing time is computed differently on a developer's Apple
Silicon machine than on amd64 Cloud Run — the same defect class as
`docs/defects/2026-08-25-line-fma-arch-divergence.md`, but on the graph tier
rather than the board, and on a value that is written to Firestore.

### 2. Runtime `sqrt` into a persisted ETA, with no fixture family

`math.Sqrt` is applied to a runtime value whose result reaches a stored ETA.
There is no `fixtures/` family covering `laneLength` or `legMs` on either side,
so nothing pins it across the Go↔TS seam or across build targets.

### 3. `math.Round` — a *guaranteed* Go↔JS divergence, not a last-ULP one

```
math.Round(-2.5) = -3      Math.round(-2.5) = -2
math.Round(-1.5) = -2      Math.round(-1.5) = -1
math.Round(-0.5) = -1      Math.round(-0.5) =  0
```

Go rounds half away from zero; JavaScript rounds half toward +∞. They disagree
on **every negative half-integer**. The codebase already knows this —
`frontend/lib/hex/hex.ts:54-58` carries the warning — but the knowledge never
propagated to `fleet/routing.go`, and the transcendental lint
(`.claude/scripts/check-transcendental.sh`) does not match `Round`/`Floor`/`Trunc`.

## Not yet measured

Unlike the `board.Line` defect, the **magnitude is unknown**: nobody has swept
real galaxy coordinates across both architectures to count how many lanes get a
different `legMs`. Because the result is rounded to a whole millisecond, most
1-ULP differences will be absorbed — a divergence needs the product to land
within an ULP of a `.5` millisecond boundary. That is rarer than the hex
lattice's constant half-integer traffic, but it is not zero, and the
consequence (a persisted ETA differing between dev and prod) is worse.

**Do this measurement before deciding severity.**

## Recommended fix

Same shape as the `Line` fix, and note the same trap: assigning the product to a
local does NOT inhibit fusion; only an explicit `float64(...)` conversion is
specified to.

```go
func laneLength(a, b galaxy.System) float64 {
	dx := a.Coords.X - b.Coords.X
	dy := a.Coords.Y - b.Coords.Y
	dz := a.Coords.Z - b.Coords.Z
	return math.Sqrt(float64(dx*dx) + float64(dy*dy) + float64(dz*dz))
}
```

Then replace `math.Round` with an explicitly-specified rounding helper shared
across the seam (or keep `math.Round` and pin it with a fixture family that
includes negative half-integers), and add a `laneLength`/`legMs` fixture family.

Better still, and consistent with the `Line` recommendation: lane length feeds a
millisecond integer, so the whole computation can be done in integer or exact
rational arithmetic and rounded once, with the tie-break stated.
