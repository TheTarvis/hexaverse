## MODIFIED Requirements

### Requirement: Home Site Selection
The system SHALL select a new corporation's home system by a breadth-first
walk over the lane graph, outward from settled space — the union of every
other living corporation's explored systems, or the origin system recorded
on the galaxy document when no corporation is living. When the walk visits
a system, it SHALL first ensure that system's full lane horizon is
materialized (the 3×3 block window around the system's block plus the
far-endpoint block of every bridge incident to the system, per
`galaxy-generation`), so the system's true incident lanes are enumerable
before the walk expands past it — the walk therefore grows the world ahead
of itself and can never stall against unmaterialized space. A candidate
qualifies when it (a) carries at least one mineable body on its skeleton
(the bootstrap guarantee), (b) is at least the configured minimum lane-hop
distance from every other living corporation's explored systems
("unclaimed" space), (c) carries no spawn reservation (below), and (d) would
host a home station whose whole shell clears the star (below). The walk
SHALL stop at the first hop-ring containing at least one qualifier and
SHALL draw uniformly among that ring's qualifiers, ordered by system id,
using an account-seeded random source, so the same account against the same
field, claimed-space, and reservation state always re-derives the same pick
(new corporations thereby land just beyond the settled fringe — the
deliberate placement policy; the prior periphery weighting is retired).
Site selection SHALL run fully before any corporation document or account
pointer is written, so a wake that fails at site selection leaves the
account corpless and retryable.

Criterion (d) is a strict bound over the home system's galaxy-tier data alone
(its skeleton rings, the star class and the station's derived parent, which is the one body the station-orbit derivation itself names as the station's parent and never any other skeleton body): the
station's shell is every position a fleet can occupy while parked at,
holding at, or arriving at the end of a burn that inserts around the station, at every orbital phase
and every inclination, and a candidate satisfies (d) only when the lower
bound on that shell's distance from the star — the station's parent body's
orbital radius, less the station's orbit radius around that parent, less the
station's insertion standoff — is strictly greater than the star-clearance
radius. A candidate whose bound is equal to or below the clearance radius
SHALL NOT qualify, so no home station's shell ever reaches the clearance at
any phase. Criterion (d) SHALL apply to newly selected homes only: a
corporation whose recorded home fails it keeps that home (healing reuses the
recorded home, below) and is neither re-homed nor migrated.

The corporation-commit transaction SHALL create a create-if-absent
`spawnClaims/{systemId}` reservation for the picked home and SHALL record
the picked home system id on the corporation document. The recorded home is
the corporation's home system of record — it is what spawn and healing
report as the home, regardless of where the corporation's hull currently
sits. The reservation is the authoritative concurrency signal — criterion
(c) — because a living corporation's explored set is written only after its
commit transaction; reservations are permanent and corp-owned (a
reservation outlives its corporation's death), and spawn-asset healing
SHALL reuse the corporation's recorded home rather than re-running
selection (no orphaned reservations). A commit that fails because the
account already has a living corporation SHALL return that corporation (per
`One Living Corporation Per Account`) and SHALL NOT re-run selection; only
reservation contention by a **different** account triggers a re-pick. A
spawn losing the reservation race SHALL re-run selection against the
now-visible reservation, at most `MaxSpawnRepicks` times, failing with
`ErrNoSpawnSite` thereafter. `MaxSpawnRepicks` and `MaxSpawnWalkBlocks`
SHALL be validated positive at service construction, with a clear error.
Criteria (b) and (c) are evaluated against the claimed space and
reservations visible at selection time: two spawns committing concurrently
MAY land closer together than the minimum spawn distance — tolerated, not
repaired (the reservation prevents only a shared home).

Because the walk expands the materialized world as it goes, site selection
SHALL succeed for every well-formed world state regardless of how many
corporations exist; IF the walk's expansion depth — the maximum block-hop
distance (Chebyshev distance in block coordinates) reached from the block
set where the walk began, never a count of blocks touched and never a
distance from the field origin — exceeds `MaxSpawnWalkBlocks`, OR the walk
exhausts the lane-reachable graph without finding a qualifier (a finite
origin component), THEN site selection SHALL fail with `ErrNoSpawnSite`, a
hard-failure rail indicating misconfiguration or field degeneracy, never an
expected outcome of accumulating players.

#### Scenario: A non-mineable system is never selected
- **WHEN** home site selection runs and a candidate system has no mineable
  skeleton body
- **THEN** that system is excluded from consideration

#### Scenario: A system too close to another corp's explored space is excluded
- **WHEN** a candidate system's lane-hop distance from every other living
  corporation's explored systems is below the configured minimum spawn
  distance
- **THEN** that system is excluded from consideration

#### Scenario: The first corporation in a fresh world spawns near the origin
- **WHEN** site selection runs in a world with no living corporation
- **THEN** the walk begins at the origin system recorded on the galaxy
  document and selects a qualifying home, rather than failing on an empty
  claimed set

#### Scenario: The walk materializes the frontier it visits
- **WHEN** the walk visits a system on the edge of materialized space
- **THEN** that system's full lane horizon is ensured before the walk
  expands past it, so onward lanes that exist in the field are never
  invisible to the walk

#### Scenario: Exhausting materialized space grows the world instead of failing
- **WHEN** no currently materialized system satisfies the qualification
  criteria
- **THEN** site selection keeps walking and materializing outward until a
  qualifying site is found (or the defensive cap is exceeded), rather than
  failing after any fixed number of expansions

#### Scenario: Consecutive fresh wakes never exhaust the world
- **WHEN** N consecutive fresh accounts spawn into a world seeded with only
  the origin neighborhood, for N larger than the initially materialized
  system count
- **THEN** every one of the N spawns succeeds and the materialized system
  count strictly grows over the sequence

#### Scenario: Every home is lane-reachable from the origin system
- **WHEN** any number of corporations have spawned into a world seeded at
  the origin
- **THEN** a lane-graph traversal from the origin system reaches every
  corporation's home system

#### Scenario: The same account re-picks the same site
- **WHEN** site selection is re-run for the same account against the same
  seed/field, claimed-space, and reservation state — regardless of blocks
  materialized by the earlier run
- **THEN** the same home system is selected (deterministic, account-seeded)

#### Scenario: A reserved system never qualifies
- **WHEN** site selection runs and a candidate system carries an existing
  spawn reservation
- **THEN** that system is excluded from consideration

#### Scenario: Two accounts spawning concurrently do not share a home system
- **WHEN** two fresh spawns for different accounts run concurrently and both
  pick the same qualifying home
- **THEN** exactly one commit wins the create-if-absent reservation; the
  loser re-runs selection, now sees the winner's reservation (criterion c),
  and lands a different home within `MaxSpawnRepicks` attempts

#### Scenario: A failed wake leaves the account corpless
- **WHEN** site selection fails for any reason (including the defensive cap
  or exhausted re-picks)
- **THEN** no corporation document, account pointer, or spawn reservation
  exists for the account afterward, and a later wake attempt can succeed
  cleanly

#### Scenario: Healing reuses the recorded home
- **WHEN** spawn-asset healing runs for a corporation whose hull was never
  seeded
- **THEN** the hull is seeded in the home system recorded on the corporation
  document — selection is not re-run and no additional reservation is
  created

#### Scenario: A distant settled frontier still spawns
- **WHEN** the claimed set lies many blocks from the field origin after
  sustained play, spanning a wide frontier
- **THEN** the walk succeeds without approaching the defensive cap (depth is
  measured from the walk's own starting blocks, and a wide frontier consumes
  no additional budget)

#### Scenario: The defensive walk cap fails clearly
- **WHEN** `MaxSpawnWalkBlocks` is configured artificially low (the test
  hook — the failure is not inducible in a well-formed world) and the walk's
  expansion depth exceeds it without finding a qualifying site
- **THEN** site selection fails with `ErrNoSpawnSite`

#### Scenario: A finite reachable component fails as a clear service error
- **WHEN** the walk exhausts every lane-reachable system without finding a
  qualifier (a deliberately pocketed test field — a finite origin component
  smaller than the depth cap)
- **THEN** site selection fails with `ErrNoSpawnSite` and the account is
  left corpless

#### Scenario: A same-account double-spawn never re-picks
- **WHEN** two concurrent spawn calls for the same account race and the
  loser's commit fails because the account already has a living corporation
- **THEN** the loser returns the winner's corporation (200, per One Living
  Corporation Per Account) without re-running selection or consuming
  re-pick attempts

#### Scenario: A system whose station shell reaches the star clearance never qualifies
- **GIVEN** a candidate that is mineable, unclaimed and unreserved, whose
  station's parent is a ring-0 body, so the lower bound on the station
  shell's distance from the star is at or below the star-clearance radius
  for every star class
- **WHEN** home site selection runs
- **THEN** that system is excluded from consideration

#### Scenario: A bound exactly equal to the clearance radius is excluded and one just above it qualifies
- **WHEN** criterion (d) is evaluated for a lower bound on the station
  shell's distance from the star that equals the star-clearance radius
  exactly, and again for a bound that exceeds it
- **THEN** the first does not satisfy the criterion and the second does

#### Scenario: The criterion's outcome is fixed for every parent type, ring and star class
- **WHEN** criterion (d) is evaluated for each station-parent body type (molten, oceanic and barren parents take the rocky row, as the feature family has no sub-rock types), for parent rings 0 through 3, and for each star class, the star classes having clearance radii M 13.0, K 14.0, G 15.0 (also the unknown-class default), F 15.5, A 16.5, B 17.5 and O 19.0
- **THEN** the outcomes are exactly these, written by hand and not produced by the predicate:
  - rocky parent: ring 0 fails every class; ring 1 passes M, K, G, F and fails A, B, O; rings 2 and 3 pass every class
  - ice parent: ring 0 fails every class; ring 1 passes M, K and fails G, F, A, B, O; rings 2 and 3 pass every class
  - gas giant parent: rings 0 and 1 fail every class; ring 2 passes M, K, G, F, A, B and fails O; ring 3 passes every class
- **AND** every ring above 3 passes every type and class

#### Scenario: Criterion (d) is decided on the station's derived parent, not on another body, when that parent fails
- **GIVEN** a candidate with a skeleton of several bodies under a non-zero galaxy seed, in which the body the station-orbit derivation names as the station's parent (read from the derivation's own returned parent id) is a ring-0 body, and another body is a ring-3 body
- **WHEN** home site selection evaluates the candidate
- **THEN** the candidate is excluded

#### Scenario: Criterion (d) is decided on the station's derived parent, not on another body, when that parent passes
- **GIVEN** a candidate with a skeleton of several bodies under a non-zero galaxy seed, in which the body the station-orbit derivation names as the station's parent (read from the derivation's own returned parent id) is a ring-3 body, and another body is a ring-0 body
- **WHEN** home site selection evaluates the candidate
- **THEN** the candidate qualifies

#### Scenario: The walk continues past a ring whose only candidates fail the station-shell criterion
- **GIVEN** the nearest hop-ring holds candidates that satisfy criteria (a)
  through (c) but not (d), and a farther ring holds one that satisfies all
  four
- **WHEN** home site selection runs
- **THEN** the pick is the farther ring's qualifier and selection does not
  fail

#### Scenario: A field whose only candidates fail the station-shell criterion fails as ErrNoSpawnSite and leaves the account corpless
- **GIVEN** a deliberately pocketed test field in which every system
  satisfying criteria (a) through (c) fails (d)
- **WHEN** site selection runs
- **THEN** it fails with `ErrNoSpawnSite` and no corporation document,
  account pointer or reservation exists for the account

#### Scenario: Excluding shell-failing candidates keeps the pick deterministic
- **WHEN** site selection is re-run for the same account against the same
  field, claimed-space and reservation state, with candidates failing
  criterion (d) present in the ring
- **THEN** the same home system is selected, and it satisfies criterion (d)

#### Scenario: A home selected after this criterion yields no clearance refusal at its station
- **GIVEN** a station orbit derived for a system whose parent type, ring and star class satisfy criterion (d)
- **WHEN** a burn solve is run toward the station from an origin outside
  the clearance, and from a fleet parked at the station toward a
  destination outside the clearance, at every phase of a sweep across the
  station's orbit and a fleet's park around it
- **THEN** no solve is refused for an endpoint at or inside the
  star-clearance radius, on either the arrival or the departure side

#### Scenario: A corporation already homed in a failing system keeps its home
- **GIVEN** a living corporation whose recorded home does not satisfy
  criterion (d)
- **WHEN** spawn-asset healing runs for it
- **THEN** its recorded home is unchanged, selection is not re-run, no
  second reservation is created, and no migration of the corporation occurs
