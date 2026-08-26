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
home fog, its home system's NPC trading station, and its opening credit
balance — idempotently self-healing: if a corporation document exists but
its hull, fog, station, or balance write did not complete on a prior
attempt, a subsequent call completes the missing steps without creating a
second hull, duplicating fog writes, provisioning a second station, or
re-granting a second opening balance. Once every asset is confirmed
present, the system SHALL record a per-corporation assets-complete marker
so a later healing pass can short-circuit on that marker alone (see
"Session Bootstrap and Wake-Up Endpoints") rather than re-checking every
asset on every call.

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

### Requirement: Home Site Selection
The system SHALL select a new corporation's home system from the live
galaxy graph as a candidate that (a) carries at least one mineable body on
its skeleton (the bootstrap guarantee), and (b) is at least the configured
minimum lane-hop distance from every other living corporation's explored
systems ("unclaimed" space); among qualifying candidates, the system SHALL
draw a weighted random pick that favors systems farther (by lane hops) from
the graph's coordinate-centroid-nearest system (frontier weighting), using
an account-seeded random source so the same account always re-derives the
same pick.

#### Scenario: A non-mineable system is never selected
- **WHEN** home site selection runs and a candidate system has no mineable
  skeleton body
- **THEN** that system is excluded from consideration

#### Scenario: A system too close to another corp's explored space is excluded
- **WHEN** a candidate system's lane-hop distance from every other living
  corporation's explored systems is below the configured minimum spawn
  distance
- **THEN** that system is excluded from consideration

#### Scenario: No qualifying system fails clearly
- **WHEN** no system in the live galaxy satisfies both the mineable and
  unclaimed-distance criteria
- **THEN** site selection fails with `ErrNoSpawnSite`

#### Scenario: The same account re-picks the same site
- **WHEN** site selection is re-run for the same account against the same
  galaxy and claimed-space state
- **THEN** the same home system is selected (deterministic, account-seeded)

### Requirement: One Starting Hull at a Deterministic Rim Position
The system SHALL, on fresh spawn, seed exactly one fleet for the new
corporation in its chosen home system, coasting at a deterministic cell on
the rim ring (one ring inside the lane-gate ring) derived from the
account id, so a healed retry places the hull at the same position.

#### Scenario: The starting hull never lands on the core
- **WHEN** a starting hull is seeded
- **THEN** its position is a rim-ring cell, never the core cell
  `{ring 0, slot 0}`

### Requirement: Home-Only Initial Fog, No Lanes Charted
The system SHALL, on spawn, reveal only the home system as `explored` for
the new corporation and SHALL chart no lanes — discovering onward roads is
left to the corporation's first scan.

#### Scenario: Spawn charts no lanes
- **WHEN** a corporation spawns
- **THEN** its home system's tier becomes `explored` and its charted-lane
  set remains empty

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
living corporation whose station or opening balance predates this
capability, or was left incomplete by an earlier partial spawn, is healed
on its very next session-bootstrap read — not only on an explicit re-spawn
call — without every ordinary session bootstrap paying the cost of a full
healing pass.

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
  one opening-grant ledger entry exists, and the stored balance equals the
  configured starting value — never twice either

## Notes for future maintainers

- `SpawnParams.PeripheryWeight`'s doc comment describes an exponential
  weighting ("`(1 + PeripheryWeight)^(graph eccentricity rank)`"), but
  `selectSpawnSite` (`backend/corporations/siteselection.go`) computes a
  **linear** weight: `1 + PeripheryWeight * periphery[systemId]`. This spec
  describes the linear behavior the code actually implements; the doc
  comment is a discrepancy worth reconciling in code (see report).
- The ownership seam other domains key on (`middlewares.ResolveCorporation`
  → `common.ActorCorp`) resolves account→living-corp once per request; it
  is documented here as context but is implemented in `backend/middlewares`,
  outside this capability's files.
