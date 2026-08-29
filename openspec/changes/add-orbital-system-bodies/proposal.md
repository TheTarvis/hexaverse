## Why

Link 3 of the lattice-to-continuous-space chain (`docs/plans/continous_space/chain.md`).
`backend/space` (link 1) and `backend/disclosure` (link 2) landed with zero
consumers — `space` mints no body, and `disclosure` reads the world through
`space.Bodies`, an interface no type in the repository implements. Nothing has
a position until bodies do. This change gives every generated interior
feature a continuous orbital element set alongside its existing lattice one,
and lands the first implementation of `space.Bodies`, so a later link can
wire fleets, fog, and the economy into continuous positions without inventing
generation math at the same time.

## What Changes

- Every generated interior feature (star, skeleton body, moon, belt, hazard,
  detail feature) gains a continuous orbital element set (`space.Orbit`) and
  a physical size, drawn from a second, independently seeded RNG stream so
  the existing lattice draw sequence and every already-shipped lattice
  placement stay byte-identical.
- Orbital radii follow a geometric law (`BaseOrbitRadius = 24.0`,
  `RadiusGrowth = 1.23`) over a per-family **orbital index** — a skeleton
  major's raw, un-clamped ring; every other star-parented feature's own
  already-drawn lattice ring — never the clamped lattice ring the two
  representations would otherwise collide on. Strict ascent and minimum
  spacing bind skeleton majors only; a detail feature may legally share a
  skeleton major's radius as a co-orbital pair. A moon's local radius
  follows its own named band anchored on its parent's insertion clearance,
  never this law. Orbital periods follow Kepler's third law for
  star-parented bodies and the shipped `space.InsertionPeriod` law for
  body-parented ones (moons, the station); retrograde motion is expressed as
  inclination past a quarter turn (read from the feature's own already-drawn
  lattice direction, never re-rolled independently), never as a non-positive
  period.
- A belt stays one persisted feature with a persisted `Width` (the full
  radial thickness of its annulus); its mineable population is expressed
  as a configured number of discrete member bodies, each with its own
  derived radius and size, derived deterministically from the belt's id and
  never independently persisted.
- A feature omitted at decode time (a corrupted or pre-capability document)
  cascades that omission to a fixpoint through the parent chain, so an
  omitted ancestor never leaves a descendant permanently naming an absent
  parent; every body a successfully built table contains resolves through
  `space.Position` with no error.
- **New capability `system-body-table`**: `system.BodyTable`, the first
  implementation of `space.Bodies` — a materialized, immutable, per-request
  snapshot resolving every body in a system (interior features, belt
  members, the spliced station, and derived lane gates) to its continuous
  position, enumerated through `Ids()` in a deterministic total order, with
  the station and lane gates degrading independently rather than failing the
  whole build. Building a table for a not-yet-materialized system
  materializes it through the same atomic create-if-absent path the interior
  read already uses.
- Lane gates become ordinary bodies in that table: motionless, star-parented,
  placed at a derived bearing and radius that puts every gate strictly
  outside the system's planetary disk, resolved from the galaxy's bounded
  neighbourhood rather than a full-galaxy scan. A lane whose destination
  system is unreadable yields no gate (recorded by name) rather than a
  fabricated bearing, and a zero horizontal projection resolves to a named
  default phase index rather than an incidental one.
- The trading station's orbit gains a continuous expression — parented to a
  generated skeleton body, prograde with the system's disk — computed as a
  pure function of the system id, galaxy seed, and the chosen parent's
  galaxy-tier body type, with no store read, preserving the existing
  `DeriveOrbit` purity precedent. Its local radius is a type-keyed size
  ceiling, never the parent's actual (unknowable at this layer) drawn size.
- `galaxy-generation`'s body-skeleton requirement is clarified: a skeleton
  body's ring is an ordinal orbital position ascending outward, the ordering
  input a continuous radius now derives from — never itself a lattice ring
  or a distance.
- Orbital elements cross the persistence boundary through the already-
  specified `space.EncodeOrbit`/`space.DecodeOrbit` codec (discharge of an
  existing `space-kinematics` requirement, not a new one).
- Determinism: a golden test pins the lattice generator's output — ring,
  angle0, direction, footprint, resources, effects, ids, order — as
  unchanged across this whole change; a new `fixtures/system/` fixture
  family is recorded byte-for-byte on both Go build-target legs; every new
  multiply-add in the generation math is `float64(...)`-guarded.

**Out of scope** (deliberately, per the chain's later links):

- No consumer migrates. `fleet` still flies the lattice, `observation` still
  serves fog, `mine`/`market`/`stations` still resolve positions through
  `board`. `system.BodyTable` has zero consumers when this change lands.
- No jump verb, no lane-transit change, no gate dwell time (recorded as
  still open, decided at link 4 alongside the jump verb).
- No disclosure wiring — `disclosure` stays unconsumed.
- No fuel, no delta-v pricing, no burn-commit validation.
- No renderer change and no wire-shape change. `Feature`'s new `Space`/
  `Size` fields do not reach the wire: the interior read serializes
  `fogFeatureDTO` (`backend/system/fog.go:16-34`), an explicit allowlist
  this change does not touch. Link 5 is where disclosure gets wired and a
  fog-band requirement for continuous fields, if any, belongs.
- No deletion of `board`, `polar`, their mirrors, fixtures, or specs, and no
  deletion of any lattice field, requirement, or consumer.
- No combat.
- **No migration and no backfill.** Every already-persisted interior
  predates the continuous fields and stays that way; regeneration is
  Decision 15's wipe of the dev/emulator galaxy and re-seed from the same
  seed (`make seed` / `cmd/seed`), not a lazy backfill, a version-stamped
  regeneration path, or a dual-read fallback. Prod exists and is unused.

## Impact

- Affected specs: `system-interior` (ADDED only), `system-body-table` (new
  capability, all ADDED), `trading-station` (ADDED only), `galaxy-generation`
  (one MODIFIED requirement — `Per-System Body Skeleton`).
- Affected code: `backend/system` (generator, model, DAO, new `bodies.go`),
  `backend/stations/placement.go` (`DeriveOrbit` gains the skeleton-body-count
  input), `backend/space/params.go` (`EncodeOrbit`/`DecodeOrbit`), CI fixture
  path filters (`fixtures/system/**`), `.claude/scripts` determinism gates
  (no script edit required — `system` is already governed).
