# Defect — a fleet can still come to rest at or inside the star clearance by paths placement does not close

**Status:** OPEN, product calls with no recorded lean. **Filed:** 2026-10-04 by
`fix-burn-order-geometry-refusals` (its RULING 8), deliberately not fixed there.
**Whose call:** Travis's. **Principle already ruled:** USER RULING 1 in
`fix-burn-order-geometry-refusals-rulings.md` — "star clearance is a space that a fleet may
never be." What is NOT ruled is the mechanism for each path below.

Full evidence: `fix-burn-order-geometry-refusals-analysis.md` sections 12.4-12.5 (open by line
range from its index). Rates are the analyst's and the adversary's solver-level probes, not HTTP
reproductions.

## What `fix-burn-order-geometry-refusals` closed

New homes: spawn site selection no longer picks a system whose station shell reaches the
clearance (criterion (d)), so a fleet ordered to, docked at, or holding at a newly selected
home station is never inside. Every solve refusal is now a typed `409`/`404`, not a 500.

## What stays open

1. **Corporations homed before the fix in a failing system** (its RULING 2: no migration).
   Their station still dips: about 8.9% of systems are affected; in those, 9.9% of
   station-targeted solves and 8.2% of departure solves from the dock are refused —
   intermittently, by orbital phase — now with a readable reason. Wiping emulator/dev data
   re-homes everyone under the new criterion.
2. **A non-station body whose park shell dips.** A ring-0 rocky planet around an O star dips
   permanently (5 bodies in 5 of 2,223 systems, 0.22%). The guard tests one point at one
   instant, so an outer-side arrival docks and the park then sweeps inside. Honouring the ruling
   means either the body is undockable (a `space` rule; re-records `fixtures/space/cases.json`)
   or the generator never produces it (re-records `fixtures/system/cases.json`, which must not
   be recorded on the arm64 machine).
3. **Drift after a cut drive** has no clearance check: a cut while heading starward coasts
   through the clearance and the star.
4. **A free stop while drifting inside** (at or below the speed floor) writes a point park
   there, so a fleet can come to rest inside.
5. **A fleet that is inside cannot burn out**: the guard refuses on the origin, so every order
   and every above-floor stop is served the origin `409`. Correct under the ruling, and the
   reason paths 3-4 need their own decision.
6. **Stranded false alarm (derived from `backend/fleet/fuel.go:151-168`, not observed).** With
   the origin inside, every reachability candidate fails, so a fleet with a full tank reads
   `stranded: true` for those seconds.
7. **A stop from a fleet docked at a QUALIFYING home can be destination-refused** when its lead
   point lands inside the clearance (adversary probe: 0.86% of stops in a retrograde system, 0
   in a prograde one). A correct typed refusal; named here so a future red in an arrangement
   that stops a docked fleet is read in seconds.

Also carried: 9.7% of mineable systems no longer qualify as homes (spawn still always
succeeds), and RULING 9's obligation — the next change that modifies `backend/system` gives
`StationShellClearsStar` a recorded fixture family, recorded off the arm64 machine.

## What would make this stale

A ruling per path (2-4, 6) and the change that implements it; for path 1, a data wipe.
