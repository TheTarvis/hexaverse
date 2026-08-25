## MODIFIED Requirements

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
