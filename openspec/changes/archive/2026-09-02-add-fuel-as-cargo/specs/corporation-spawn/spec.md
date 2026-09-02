## MODIFIED Requirements

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

## ADDED Requirements

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
