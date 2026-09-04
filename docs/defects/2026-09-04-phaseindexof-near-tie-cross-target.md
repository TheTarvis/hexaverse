# Defect: `space.PhaseIndexOf`'s near-tie bracketing comparison is unpinned across Go build targets

**Filed:** 2026-09-04, by the `delete-the-lattice` change (tasks.md 9.3),
which was required to record the successor question before closing
`2026-08-25-lanegate-near-tie-divergence.md` rather than declare victory.
**Status:** open
**Against:** `cross-stack-determinism` — *Inexact Arithmetic Is Rule-Bearing
Only Through a Discretized, Tie-Broken Choice*, scenario "Authority does not
cover a same-side cross-target disagreement" — and `backend/space/turn.go`'s
`PhaseIndexOf` / `crossAtOrBefore`.
**Severity:** low, latent, and NARROWER than its predecessor. The axis moved
from the Go↔TS language seam (where the predecessor lived, and where nothing
is left to disagree — there is no TypeScript mirror of this math, by design)
to the Go **build-target** axis, arm64 vs amd64/GOAMD64=v1. The value it
reaches, a lane-gate body's `Orbit.Phase`, is derived at body-table
construction and served; the server is authoritative, so a disagreement would
show as two servers on different architectures placing one gate body a
sub-turn index apart, not as corrupted stored state.

## What this is the successor to

`docs/defects/2026-08-25-lanegate-near-tie-divergence.md` recorded that
`LaneGateHex`'s float `atan2` argmin picked different candidates in Go and in
JavaScript on a bearing exactly equidistant between two of them: Go's `atan2`
rounding manufactured a winner one ULP before the spec'd tie-break could fire,
and V8's did not. That defect is **dissolved** — `LaneGateHex`, the ring-slot
coordinate system, and the TypeScript mirror it disagreed with are all gone.

But the JOB it did survives. `system.gateOrbit` (`backend/system/bodies.go`)
still answers "which direction does this lane depart in" by reducing an
inexact bearing to a discrete index — now `space.PhaseIndexOf`, a fixed
twenty-comparison bracketing search over a pinned trig table, with the
tie-break stated as `>= 0` in `crossAtOrBefore` so an offset lying exactly on
a table entry's own direction resolves to that entry's index. This is a
strictly better construction than the one it replaces: no `atan2`, a pinned
table, an explicitly documented tie rule.

## The gap

`crossAtOrBefore` decides each of the twenty comparisons on the sign of

```go
cross := float64(dirX*offZ) - float64(dirZ*offX)
```

Both products carry the explicit `float64(...)` conversion that inhibits FMA
contraction, so the expression is well-defined on both build targets. What is
NOT established is that it yields the same SIGN on both targets for an offset
within one ULP of a table entry's own direction — the case where `cross` is at
or near zero and the `>= 0` tie-break is the thing actually deciding the
answer. That is exactly the input class the predecessor defect was about, one
axis over.

**No recorded fixture family covers it.** Measured at filing:

- `fixtures/system/cases.json`'s `gateOrbitSweep` draws two independent
  `galaxy.Coords` uniformly from `[-2000, 2000]³` boxes plus an extent
  (`gateOrbitAxes`, `backend/system/fixtures_test.go`). The probability that a
  drawn bearing lands within one ULP of a table entry's direction is
  effectively zero, so the sweep — however large — never exercises the
  tie-break.
- The `gateOrbit` **hand** family's tie case is *"an exact tie (straight along
  the table's index-0 direction) resolves to the documented lower index"*. An
  EXACT tie is `cross == 0` exactly, on both targets, by construction: the
  operands are exactly representable and the products are exact. It pins the
  documented rule, which is worth having, but it is not the hazard. The hazard
  is `cross` being a few ULP either side of zero, where the two targets'
  rounding of the two products can disagree on the sign.

So `cross-stack-determinism`'s *"Authority does not cover a same-side
cross-target disagreement"* applies: designating `backend/space` Go-sole-
authority removes the language seam but says nothing about two Go build
targets disagreeing with each other.

## Repro

Not yet constructed — that is the first task of any change that takes this on.
The construction is mechanical: pick a table index `i`, take `(dirX, dirZ) =
CosSin(i)`, and search for an offset `(x, z)` near that direction for which
`float64(dirX*z) - float64(dirZ*x)` evaluates to opposite signs under
`GOARCH=arm64` and `GOARCH=amd64 GOAMD64=v1`. If no such offset exists — which
is plausible, since both products are separately rounded and IEEE
multiplication is correctly rounded on both targets — then the honest outcome
is a PROOF that closes this defect, not a fix. Record that proof as a fixture
family either way.

## Recommended resolution (separate change against `cross-stack-determinism`)

In preference order:

1. **Prove it cannot happen.** If `float64(a*b) - float64(c*d)` is
   sign-stable across the build-target matrix for all finite inputs — both
   multiplications correctly rounded, one separately-rounded subtraction — then
   `crossAtOrBefore` is exact-enough by construction and this defect closes
   with a recorded argument plus a near-tie fixture family demonstrating it.
2. **Pin it.** Add a `gateOrbit` near-tie family: offsets constructed at
   ±1, ±2 ULP from each of a sample of table-entry directions, recorded and
   asserted across the build-target matrix like every other family in
   `fixtures/system/cases.json`.
3. **Remove the inexactness.** Make the comparison integer/rational, as the
   predecessor defect's own recommended fix proposed for its argmin.

Until then this is registered in `fixtures/determinism-register.json` under
`discretized-choice`, and `system.gateOrbit` should not be assumed
cross-target-identical on knife-edge bearings.
