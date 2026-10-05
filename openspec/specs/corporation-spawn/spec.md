# Corporation Spawn Specification

## Purpose
Owns the player entity — the Corporation, an auth-account-linked lineage —
and the wake-up flow that mints one per account: choosing a home system,
seeding its one starting hull, and writing its initial fog, so a fresh
account becomes a playable presence in the galaxy in a single idempotent
call.
## Requirements
### Requirement: One Living Corporation Per Account
The system SHALL enforce that an account has at most one living
(not-yet-died) corporation at a time, anchored by a create-if-absent
account→corporation pointer written in the same transaction as the
corporation document.

#### Scenario: A concurrent double-spawn converges on one corporation
- **WHEN** two concurrent spawn calls for the same account both attempt to
  create a corporation
- **THEN** exactly one corporation is created; the losing call detects the
  winner's pointer and returns the winner's corporation instead of
  creating a second one

### Requirement: Idempotent Spawn
The system SHALL, on `Spawn(accountId, name)`, return the account's
existing living corporation (with its assets ensured/healed) if one
already exists, rather than creating a new one, and SHALL require a
non-empty, whitespace-trimmed name for a fresh spawn.

#### Scenario: Spawning an already-spawned account returns the existing corp
- **WHEN** `Spawn` is called for an account that already has a living
  corporation
- **THEN** the existing corporation, its hull, and its home system are
  returned unchanged (the supplied name is ignored)

#### Scenario: An empty name is rejected on fresh spawn
- **WHEN** `Spawn` is called for an account with no living corporation and
  a name that is empty or all whitespace
- **THEN** the call fails with `ErrNameRequired`

#### Scenario: An unauthenticated spawn is rejected
- **WHEN** `Spawn` is called with an empty account id
- **THEN** the call fails with `ErrForbidden`

### Requirement: Spawn Asset Healing
The system SHALL make a corporation's derived assets — its one hull, its
home fog, its home system's NPC trading station, its opening credit
balance, and that hull's starting fuel grant — idempotently self-healing:
if a corporation document exists but its hull, fog, station, balance, or
starting-fuel write did not complete on a prior attempt, a subsequent call
completes the missing steps without creating a second hull, duplicating
fog writes, provisioning a second station, re-granting a second opening
balance, or re-crediting a second starting-fuel grant. The starting-fuel
grant's idempotency anchor SHALL be a distinguishable, per-fleet grant
marker — a create-if-absent document at `corporations/{corpId}/fuelGrants/
{fleetId}` — checked and set atomically (so two concurrent healing calls
cannot both observe it absent) in the same write that credits the fuel —
analogous to the credit ledger's `"spawn:" + corpId` entry the opening
balance grant already anchors on,
and required for the same reason: `/v1/corporations/me` is explicitly
exempt from the per-corporation write quota, so two concurrent bootstrap
reads for one account are cheap to trigger and must still heal exactly
once — and SHALL NEVER be inferred from the fleet's current `fuel`
cargo level: a hull that has legitimately burned its starting fuel down to
exactly zero through play MUST NOT read as "never granted" and be
re-credited, which would make starting fuel an infinite faucet. Once every
asset is confirmed present, the system SHALL record a per-corporation
assets-complete marker so a later healing pass can short-circuit on that
marker alone (see "Session Bootstrap and Wake-Up Endpoints") rather than
re-checking every asset on every call.

#### Scenario: A corp with a hull but no fog yet gets its fog written on retry
- **WHEN** `Spawn` is called for an account whose corporation and hull
  already exist but whose home-system reveal was never written
- **THEN** the retry writes the home-system reveal without minting a
  second hull

#### Scenario: A corp with an existing hull is not re-seeded
- **WHEN** `Spawn` is called for an account whose corporation already has
  at least one fleet
- **THEN** no new hull is seeded; the existing hull and its system are
  returned as the home

#### Scenario: A corp with hull and fog but no station yet gets its station provisioned on retry
- **WHEN** `Spawn` is called for an account whose corporation, hull, and
  fog already exist but whose home system's station was never provisioned
- **THEN** the retry provisions the home station without minting a second
  hull or duplicating fog writes

#### Scenario: A corp with no opening balance gets it granted exactly once
- **WHEN** `Spawn` is called for an account whose corporation exists but
  has never been granted its opening credit balance
- **THEN** the retry grants the configured starting balance exactly once —
  a subsequent healing call for the same corporation grants it no second
  time

#### Scenario: A corporation that spent its balance to exactly zero is never re-granted
- **WHEN** a corporation's balance has been legitimately debited down to
  exactly zero, and its session-bootstrap healing pass runs again
- **THEN** no second starting-grant ledger entry is created and the balance
  remains zero — the healing pass MUST NOT infer "never granted" from a
  balance of zero; the only signal for "already granted" is the existing
  `"spawn:" + corpId` ledger entry

#### Scenario: A corp with hull, fog, station, and balance but no starting-fuel grant yet gets it credited on retry
- **WHEN** `Spawn` is called for an account whose corporation, hull, fog,
  station, and opening balance already exist but whose starting hull has
  never received its starting-fuel grant
- **THEN** the retry credits the configured starting fuel to that hull's
  cargo, recording the grant marker, without re-seeding a hull,
  duplicating fog, re-provisioning a station, or re-granting the opening
  balance

#### Scenario: A hull that burned its starting fuel to exactly zero is never re-granted
- **WHEN** a corporation's one hull has legitimately burned its `fuel`
  cargo down to exactly zero through play, and its session-bootstrap
  healing pass runs again
- **THEN** no second starting-fuel grant is credited and the hull's `fuel`
  remains zero — the healing pass MUST NOT infer "never granted" from a
  `fuel` level of zero; the only signal for "already granted" is the
  existing per-fleet grant marker

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

### Requirement: Home-Only Initial Fog, No Lanes Charted
The system SHALL, on spawn, mark only the home system `explored` in the new
corporation's knowledge (`galaxy-knowledge`) and SHALL chart no lanes —
discovering onward roads is left to flying out and reaching them: attaching
to a lane's own gate body charts it (`galaxy-knowledge`'s "Gate-Attachment
Knowledge Write"), and a lane is otherwise chartable only by traveling it or
by buying intel on it. Spawn itself writes neither.

#### Scenario: Spawn charts no lanes
- **WHEN** a corporation spawns
- **THEN** its home system's knowledge tier becomes `explored` and its
  charted-lane set remains empty

### Requirement: Death Invariant
The system SHALL permit marking a corporation dead (`diedAt` stamped) only
when it currently has zero fleets, and SHALL treat a corporation with a
non-zero `diedAt` as no longer living (excluded from "living" queries and
the unclaimed-space claim).

#### Scenario: Marking a corp with living fleets dead is rejected
- **WHEN** `MarkDead` is called for a corporation that still has at least
  one fleet
- **THEN** the call fails with `ErrHasLivingFleet` and no death stamp is
  written

#### Scenario: A dead corp is excluded from living-corp queries
- **WHEN** a corporation has a non-zero `diedAt`
- **THEN** it is excluded from the set of living corporations used for
  unclaimed-space computation and other living-corp queries

### Requirement: Session Bootstrap and Wake-Up Endpoints
The system SHALL serve `POST /v1/corporations` (spawn; idempotent, `200`
on both fresh and repeat calls) and `GET /v1/corporations/me` (the
account's living corporation, including its current credit balance, or
`404` before the account has woken). Both endpoints SHALL run the same
idempotent asset-healing pass described in "Spawn Asset Healing" before
responding, and that pass SHALL short-circuit on a stored, per-corporation
assets-complete marker so a corporation whose assets are already complete
performs no additional read or write beyond checking that marker — so a
living corporation whose station, opening balance, or starting-fuel grant
predates this capability, or was left incomplete by an earlier partial
spawn, is healed on its very next session-bootstrap read — not only on an
explicit re-spawn call — without every ordinary session bootstrap paying
the cost of a full healing pass.

#### Scenario: A repeat spawn call returns 200, not a fresh creation status
- **WHEN** `POST /v1/corporations` is called for an account that already
  has a living corporation
- **THEN** the response is `200 OK` with the existing corporation

#### Scenario: A corpless account's session bootstrap is 404
- **WHEN** `GET /v1/corporations/me` is called for an account with no
  living corporation
- **THEN** the response is `404 Not Found`

#### Scenario: No available spawn site surfaces as a clear service error
- **WHEN** `POST /v1/corporations` is called and site selection fails with
  `ErrNoSpawnSite`
- **THEN** the response is `503 Service Unavailable`

#### Scenario: The session bootstrap response includes the credit balance
- **WHEN** `GET /v1/corporations/me` is called for an account with a
  living corporation
- **THEN** the response includes that corporation's current credit balance

#### Scenario: A pre-existing corporation heals on its next session bootstrap read
- **WHEN** `GET /v1/corporations/me` is called for a living corporation
  created before this capability shipped, carrying no stored station or
  balance
- **THEN** its home station is provisioned and its opening balance is
  granted exactly once, with no explicit re-spawn call required

#### Scenario: A healed corporation's subsequent bootstrap reads perform no provisioning work
- **WHEN** `GET /v1/corporations/me` is called repeatedly for a corporation
  whose assets-complete marker is set
- **THEN** no station existence check, grant check, fog read, or hull query is
  performed, and no write of any kind occurs

#### Scenario: Concurrent bootstrap reads for one account heal exactly once
- **WHEN** two `GET /v1/corporations/me` requests for the same account are
  served concurrently against an unhealed corporation
- **THEN** exactly one station exists for its home system afterward, exactly
  one opening-grant ledger entry exists, the stored balance equals the
  configured starting value, and its one hull's starting-fuel grant is
  credited exactly once at the configured starting-fuel constant — never
  twice for any of the four

### Requirement: One Starting Hull at a Deterministic Home Park

The system SHALL, on fresh spawn, seed exactly one fleet for the new
corporation in its chosen home system via `fleet.SeedFleet`, parked at a
position deterministic from the account id, so a healed retry places the
hull at the same position — never re-seeding a second hull for an account
whose corporation already has one (see "Spawn Asset Healing").

#### Scenario: The starting hull is deterministic per account

- **WHEN** a fresh spawn seeds the starting hull for an account
- **THEN** its position derives deterministically from that account id, so a
  later healing retry for the same account reproduces the identical position

#### Scenario: The starting hull never lands inside the star's clearance

- **WHEN** a starting hull is seeded
- **THEN** its position lies outside the home system star's configured
  clearance radius

### Requirement: Starting Fuel Is a Configured Constant, Guarded By a Reachability Sample
The system SHALL grant a fresh corporation's starting hull a configured
constant amount of `fuel` (`FuelParams.StartingFuelTons`), never a
spawn-time solve against the kinematics package, which would make the
grant non-deterministic across a tuning change and couple spawn to
`space`'s implementation. Because a freshly spawned hull is seeded
unattached, at a `point` park ("Spawn Fleet Seeding Places a Park"), and
sale and refuel both require attachment, and attachment requires a burn,
and a burn requires fuel — a starting grant of zero would deadlock a fresh
corporation permanently at spawn. This constant SHALL be validated by a
generated-sample invariant test, in the spirit of `system-interior`'s
size/tonnage guards: over a large sample of seeded accounts, the
configured starting-fuel constant SHALL afford the fuel-priced burn
`space.SolveBurn` solves from that account's deterministic spawn park to
its home system's station. A constant that fails the sample for any
sampled account is a tuning defect in the constant's value, to be
corrected by moving the constant — never a spec change to this
requirement. **This guard deliberately prices the reachability check at
the fleet's `DerivedAccelCeiling`, the one carve-out from
`fleet-movement`'s floor-pricing rule for every other reachability
judgment this change defines** ("A Burn Commit Warns...", "Fleet Read
Reports an Estimated Maximum Range..."): an order that omits an explicit
commanded acceleration defaults to the fleet's ceiling ("An omitted
commanded acceleration defaults to the fleet's ceiling"), so the ceiling —
not the floor — is what a fresh corporation's actual, unmodified default
spawn-to-station order would cost. A floor-priced guard here would certify
a starting-fuel constant under which that default first order is
unaffordable, reopening exactly the spawn-time deadlock this requirement
exists to prevent.

#### Scenario: A seeded hull can reach its home station on its starting fuel
- **WHEN** a fresh corporation's starting hull, seeded at its deterministic
  spawn park, is solved a burn to its home system's station at its
  acceleration ceiling
- **THEN** that burn's fuel cost, priced per `fleet-movement`'s "A Burn's
  Fuel Cost Scales With Roster Hull Count, Never Loaded Mass," does not
  exceed the corporation's configured starting-fuel grant

#### Scenario: The guarantee is checked over a generated sample, not one fixture account
- **WHEN** the starting-fuel reachability check is run over a large,
  generated sample of seeded accounts spanning the galaxy's spawnable
  systems
- **THEN** every sampled account's spawn-to-home-station burn is
  affordable on the configured starting-fuel constant, and a sample
  member that fails is treated as a signal to retune the constant, not to
  relax this requirement

## Notes for future maintainers

- The ownership seam other domains key on (`middlewares.ResolveCorporation`
  → `common.ActorCorp`) resolves account→living-corp once per request; it
  is documented here as context but is implemented in `backend/middlewares`,
  outside this capability's files.
