# Polar Lattice Math — Delta (capability removed)

`polar-lattice-math` was created as a deliberately temporary capability
(its own spec and the archived `add-polar-lattice-math` design record the
Exit plan verbatim): at the board rewrite, its requirements fold into
`board-tactical-math` and the capability is removed in the same change.
This is that change. Every requirement below is REMOVED here and has a
successor in this change's `board-tactical-math` delta — two of them
deliberately changed in the fold (adjacency tightened to true corner
contact; the arc path gains the boundary stitch pass — both settled with
Travis 2026-08-25), the rest folded verbatim. The `backend/polar/` and
`frontend/lib/polar/` packages and `fixtures/polar/cases.json` survive as
implementation and contract of the folded requirements; only the separate
capability dissolves.

## REMOVED Requirements

### Requirement: Ring-and-Slot Cell Coordinates
**Reason**: Capability folds into `board-tactical-math` per the recorded
Exit plan; the requirement continues there verbatim.
**Migration**: See `board-tactical-math` › Ring-and-Slot Cell Coordinates.

### Requirement: Slot Schedule Shape
**Reason**: Capability folds into `board-tactical-math`; the structural
invariant continues there verbatim, now accompanied by pinned production
values.
**Migration**: See `board-tactical-math` › Slot Schedule Shape and The
Production Slot Schedule Is Pinned to Isotropic.

### Requirement: Lattice Adjacency Is an Integer Predicate
**Reason**: Folded into `board-tactical-math` with a deliberate change:
the open doubling-boundary fork this requirement recorded is closed toward
**true corner contact** (`2g ≤ D/Sa + D/Sb`), dropping the loose
predicate's two non-touching phantom neighbors per boundary cell.
**Migration**: See `board-tactical-math` › Lattice Adjacency Is True
Corner Contact. `fixtures/polar/cases.json`'s adjacency families and
sweep digests re-record in this change; cases pinning the loose fork's
answers are superseded.

### Requirement: Every Cell On a Ring Sits At One Radius
**Reason**: Capability folds into `board-tactical-math`; the requirement
continues there verbatim.
**Migration**: See `board-tactical-math` › Every Cell On a Ring Sits At
One Radius.

### Requirement: A Straight Path Is an Arc
**Reason**: Folded into `board-tactical-math` with a deliberate change:
under the tightened adjacency predicate the sampler's doubling-boundary
diagonal skips are no longer adjacent steps, so the folded requirement
adds the deterministic finer-ring **stitch pass** (this requirement's
"no gap-fill or stitching pass is required" clause described the loose
predicate and does not survive the fold).
**Migration**: See `board-tactical-math` › A Straight Path Is an Arc.
`fixtures/polar/cases.json`'s path families and sweep digests re-record
in this change.

### Requirement: A Path Reaches the Core Only If an Endpoint Is the Core
**Reason**: Capability folds into `board-tactical-math`; continues there
with its no-inserted-cell clause narrowed to bar avoidance detours while
admitting the contiguity stitch, which never alters what region a path
crosses.
**Migration**: See `board-tactical-math` › A Path Reaches the Core Only
If an Endpoint Is the Core.

### Requirement: Orbital Advance Is Integer Arithmetic Over the Ring's Slot Count
**Reason**: Capability folds into `board-tactical-math`; the requirement
continues there verbatim and supersedes the hex spec's Deterministic
Orbital State.
**Migration**: See `board-tactical-math` › Orbital Advance Is Integer
Arithmetic Over the Ring's Slot Count.

### Requirement: Orbit Back-Solve Settles Without Teleporting
**Reason**: Capability folds into `board-tactical-math`; the requirement
continues there verbatim and supersedes the hex spec's Anti-Teleport
Orbit Back-Solve.
**Migration**: See `board-tactical-math` › Orbit Back-Solve Settles
Without Teleporting.

### Requirement: The Sweep Domain Is Bounded and Its Enumeration Is Fixed
**Reason**: Capability folds into `board-tactical-math`; continues there
verbatim apart from renaming its reference to the adjacency requirement.
**Migration**: See `board-tactical-math` › The Sweep Domain Is Bounded
and Its Enumeration Is Fixed.

### Requirement: Rule-Bearing Values Are Integer or Exact Rational
**Reason**: Folded into `board-tactical-math` with one deliberate
loosening, stated rather than smuggled: trigonometry may additionally
execute inside the fixture-recording flow that generates the pinned
coordinate table (the board's visibility and gate-bearing geometry runs
on that table in exact integer arithmetic at runtime). The runtime
trig-and-`sqrt` ban on rule-bearing values continues unchanged.
**Migration**: See `board-tactical-math` › Rule-Bearing Values Are
Integer or Exact Rational and A Pinned Coordinate Table Grounds Board
Geometry.

### Requirement: A New Cross-Language Fixture Family Pins the Lattice
**Reason**: Capability folds into `board-tactical-math`; the
one-family-per-function, both-languages-assert, schedule-named-case
discipline continues under `cross-stack-determinism`'s golden-fixture
requirement (modified in this change to polar domains) and the folded
schedule-pinning requirement. `fixtures/polar/cases.json` remains the
lattice contract file.
**Migration**: See `board-tactical-math` › The Production Slot Schedule
Is Pinned to Isotropic (schedule-named cases) and
`cross-stack-determinism` › Shared Board Math Is Pinned By a
Cross-Language Golden Fixture.

### Requirement: The Polar Fixture File Reproduces On Every Build Target
**Reason**: Capability folds into `board-tactical-math`; the build-target
matrix obligation continues under `cross-stack-determinism`'s The Golden
Fixture Reproduces On Every Build Target, which already governs every
fixture file under `fixtures/`.
**Migration**: See `cross-stack-determinism` › The Golden Fixture
Reproduces On Every Build Target; provenance recording continues
unchanged in `fixtures/polar/cases.json`.
