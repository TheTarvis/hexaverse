# Defect: a station parented to an inner skeleton body swings inside the star-clearance shell, and the default spawn-to-station burn is rejected 500

**Filed:** 2026-09-04, by openspec link 9, whose task 11.5 full-backend run
surfaced it. Filed at the orchestrator's instruction:
link 9 does not touch the derivation at fault and does not fix this.
**Status:** open
**Against:** `trading-station` (*A Station's Continuous Orbit Is Derived, Never
Rolled*) and `system.StationContinuousOrbit`
(`backend/system/station_continuous.go`), with `space.BuildCurve`'s
`ErrEndpointInsideClearance` as the observed symptom.
**Severity:** medium. A newly spawned corporation whose home station happens to
be parented to an inner skeleton body cannot burn to its own home station for
part of that station's orbital period — the ONE action the wake-up flow is
built around. The window is real but intermittent, and it clears on its own as
the station orbits, so it reads to a player as "the game refused my first order
for no reason" rather than as a permanent block.

## The observed failure

`TestSpawn_Scenario_StartingFuelReachabilitySample`
(`backend/fuel_spawn_starting_fuel_e2e_test.go:224`) spawns 8 sampled accounts
and orders each fleet to its own home station. Under a full-suite run:

```
--- FAIL: TestSpawn_Scenario_StartingFuelReachabilitySample (27.56s)
    fuel_spawn_starting_fuel_e2e_test.go:236: sample account #0: default order to
        home station rejected (status = 500)
    fuel_spawn_starting_fuel_e2e_test.go:249: 1/8 sampled accounts could not afford
        their own default spawn-to-home-station burn — per this requirement's own
        instruction, a failing sample is a signal to retune
        FuelParams.StartingFuelTons, never to relax this requirement
```

The server-side error behind the 500, from the same run:

```
{"level":"error","error":"fleet: solving burn: space: endpoint at or inside the
 star-clearance radius","message":"fleet operation failed"}
```

## THE TEST'S OWN ADVICE IS WRONG HERE — read this before tuning anything

The test's summary line says a failing sample is "a signal to retune
`FuelParams.StartingFuelTons`". **For this failure it is not.** That advice
belongs to the test's *other* branch — the one comparing `granted` tons against
`cost` tons. This failure never reaches that branch: the order is rejected with
HTTP 500 before any cost is computed, so `granted` and `cost` are never
compared and no amount of starting fuel would change the outcome.

Anyone who follows the printed advice will tune a parameter with no causal
relationship to the failure, observe the sample pass on the next run (see
"Why it is intermittent"), and conclude the tuning fixed it.

Two follow-ups are worth doing alongside the fix below:

- Make the test distinguish its two failure modes. A non-200 status is an
  *error*, not an affordability shortfall, and should print its own message
  rather than fall into the retune-the-grant summary.
- The 500 itself is arguably wrong. A burn whose endpoint lies inside the star
  clearance shell is a rejected *request*, not a server fault; `fleet`'s handler
  maps `space.ErrEndpointInsideClearance` to a 500 today.

## This is NOT a link-9 regression

Recorded because the timing invites the assumption:

- The identical full suite **passed at `79ab9b1`**, which is already after this
  change's generator rewrite (step G5) and after its tuning rename (step G7).
  The only diff between that commit and the failing run is comments and test
  variable renames — nothing that can move a body.
- The test passes **4 of 4 runs in isolation**, at ~1.7s against 27.6s in-suite.
- The derivation at fault, `system.StationContinuousOrbit`, is not touched by
  link 9 at all. Link 9 deleted the station's *discrete* orbit
  (`stations.DeriveOrbit`); the continuous one it left alone is the one with
  the gap.

## Why it is intermittent, and why isolation hides it

Two independent sources of variation, both of which a single isolated run
suppresses:

1. **Which home system.** The sampled accounts are created with fresh random
   Firebase UIDs, so spawn site selection lands them in different systems with
   different skeletons. Only some of those systems parent their station to an
   inner body (see below).
2. **World time, and therefore the station's orbital phase.** The station
   orbits its parent, and the parent orbits the star; the station's absolute
   distance from the star is a function of both phases and therefore of the
   world time at which the burn is solved. In isolation the world clock is
   near its epoch and the suite finishes in under two seconds; in a full run
   it has advanced through every preceding e2e test.

So the failure needs an unlucky home system AND an unlucky phase. That is why
it appears under full-suite load and vanishes when the test is run alone —
which also makes "it passed in isolation" worthless as evidence that it is
fixed.

## Measured mechanism (computed with the production functions, not by hand)

`StationContinuousOrbit` parents the station to a skeleton major body chosen by
`k = mix64(mix64(systemSeed)) mod len(skeleton.Bodies)`, and gives it a local
orbit radius that is a **type-keyed ceiling**:

```
localRadius = MaxFeatureSize(parentType)
            + InsertionStandoff(Body{Size: MaxFeatureSize(parentType)})
            + StationStandoff
```

That is 14.50 for a gas-giant parent and 10.00 for a rocky one. The parent's own
distance from the star is `ContinuousRadius(parent.Ring)`, and
`ContinuousRadius(0) = BaseOrbitRadius = 24.0`. The station's inclination is
exactly 0 or exactly half a turn (`inclinationForDominant` applies no jitter),
so its orbit is **coplanar** with its parent's and the two radii add and subtract
directly:

```
star O: size 7.60  clearance 19.00
star G: size 6.00  clearance 15.00
star M: size 5.20  clearance 13.00

  parent ring 0 (gas_giant): parentR=24.00 localR=14.50 -> station |r| in [ 9.50, 38.50]
  parent ring 0 (rocky):     parentR=24.00 localR=10.00 -> station |r| in [14.00, 34.00]
  parent ring 1 (gas_giant): parentR=29.52 localR=14.50 -> station |r| in [15.02, 44.02]
  parent ring 1 (rocky):     parentR=29.52 localR=10.00 -> station |r| in [19.52, 39.52]
  parent ring 2 (gas_giant): parentR=36.31 localR=14.50 -> station |r| in [21.81, 50.81]
```

A station on a ring-0 gas giant reaches 9.50 from the star — **inside every
star class's clearance shell**, and inside a G star's 15.00 for a substantial
arc of its orbit. A ring-0 rocky parent reaches 14.00, inside a G or O star's
shell. A ring-1 gas-giant parent reaches 15.02, which clears a G star by 0.02.
`space.BuildCurve` then rejects the burn outright:

```go
if starClearance > 0 {
    if from.Length() <= starClearance || intercept.Length() <= starClearance {
        return CurveResult{}, ErrEndpointInsideClearance
    }
}
```

**The calibration invariant that was supposed to prevent this does not cover
it.** `system/continuous.go` asserts
`space.StarClearanceRadius(max(StarSize table)) < BaseOrbitRadius` — i.e. that a
body AT `BaseOrbitRadius` clears the shell, with `TestCalibration_Scenario_
NoStarSizePlacesBodyInsideClearanceShell` guarding it. That invariant is about
*star-parented* bodies. It says nothing about a **body-parented** object whose
local radius (up to 14.50) is comparable to `BaseOrbitRadius` itself (24.00),
and the station is the only such object in the game.

## Recommended first step

Attempt the repro, and be willing to close this with a proof rather than a fix:

1. Construct a system whose skeleton has a gas giant at ring 0 and whose
   `mix64(mix64(systemSeed)) mod len(bodies)` selects it, resolve the station's
   absolute position across a full orbital period, and confirm that
   `|position| <= StarClearanceRadius(starSize)` for part of it and that a burn
   to the station from a legal origin returns `ErrEndpointInsideClearance`.
2. If it does not reproduce — if some other constraint already prevents a
   station being parented to an inner body, or the phases cannot align —
   **close this defect with that proof**, and fix only the test's misreported
   failure mode.

If it does reproduce, the fix belongs to `trading-station` and the shape is a
calibration invariant that actually covers the station: require
`ContinuousRadius(parent.Ring) - localRadius > StarClearanceRadius(max star
size)` for every parent a station can be assigned, enforced either by excluding
inner rings from the parent choice or by clamping `localRadius`. Whichever is
chosen, it wants a `TestCalibration_*` guard in the same style as the existing
star-size one, reading `space.StarClearanceRadius` directly rather than a copied
factor — the existing guard's own stated discipline.

## Not registered in the deviation register

`fixtures/determinism-register.json` records rule-bearing values that are
KNOWN to violate a `cross-stack-determinism` requirement — cross-target
reproducibility, transcendental drift, discretized choice. This defect is a
placement-calibration gap, not a determinism one: the derivation is perfectly
reproducible on every build target and across the language seam, and reproduces
the same wrong answer everywhere. No register entry is warranted, and adding
one would dilute what that file means.
