## ADDED Requirements

### Requirement: Per-Corporation Write Quota on Player-Initiated Trade Routes
The system SHALL enforce, in addition to the per-IP tiers, a fixed-window
quota (`market.Params.CorpWriteQuotaPerMinute`, proposed default 120/min —
see design.md Open Questions) keyed on the requester's resolved corporation
id (`common.ActorCorp`, which no client input can influence), applied to
`POST /v1/fleets/:fleetId/sell` and any future route that appends a
trade-ledger entry **as the direct result of a distinct, player-initiated
trade action**: a configured maximum of settled-or-attempted credit
mutations per corporation per minute, rejecting requests over the limit
with `429 Too Many Requests`. A corpless requester SHALL be rejected by the
route's own authorization check before this quota is consulted. This
quota SHALL NOT apply to `POST /v1/corporations` or `GET
/v1/corporations/me` — Decision 14's asset-healing pass can append a
one-time opening-grant ledger entry from either, but a fresh spawn has no
`common.ActorCorp` yet to key a bucket on, that append is already bounded
to exactly once per corporation by its own idempotent-healing mechanism
(the assets-complete marker, `corporation-spawn`'s "Spawn Asset Healing"),
and it is not the repeatable, player-driven trading activity this quota
exists to bound.

#### Scenario: A corporation exceeding its per-corporation write quota is rejected
- **WHEN** one corporation submits more sale requests in a minute than the
  configured per-corporation quota, from any number of source IPs or
  `X-Forwarded-For` values
- **THEN** requests over the quota receive `429 Too Many Requests`, and no
  cargo, balance, ledger, or request state changes for them

#### Scenario: The per-corporation quota is not defeated by varying client IP
- **WHEN** a caller varies the `X-Forwarded-For` header on every sale
  request from one corporation
- **THEN** every request still counts against that corporation's single
  quota bucket, because the bucket key is the server-resolved corporation id

#### Scenario: Session bootstrap and spawn are never subject to this quota
- **WHEN** an account calls `POST /v1/corporations` or `GET
  /v1/corporations/me` any number of times, including on a fresh,
  never-spawned account with no resolved corporation id yet
- **THEN** neither call is ever rejected by this quota — its bucket key
  requirement (a resolved `common.ActorCorp`) does not apply to these two
  routes at all

#### Scenario: A contention-retry rejection still counts toward the quota
- **WHEN** sustained transaction contention causes a sale to exhaust its
  automatic retries and surface a "busy, try again" rejection (see
  `goods-sale`'s "Contention Aborts Retry Server-Side Before Surfacing
  Failure")
- **THEN** that rejected attempt still counts toward the corporation's
  per-corporation quota — sustained contention CAN convert into `429`
  quota rejections, a named and accepted consequence, not a gap

### Requirement: The Sell Endpoint Ignores a Client-Supplied Corporation Id
`POST /v1/fleets/:fleetId/sell` (`goods-sale`'s sale endpoint, the one
credit-mutating route this change adds) SHALL resolve its acting
corporation exclusively via `common.ActorCorp` (this capability's
"Corporation Resolution Seam"). If the request body carries a
`corporationId` (or equivalently-named) field, it SHALL be ignored — never
read, never compared, never substituted for the resolved value — so a
client cannot direct proceeds to, or act as, a corporation other than the
one its own bearer token resolves to. (The broader design intent — that
this pattern extends to any future corporation-scoped route this game
adds — is a stated design constraint, recorded in design.md, rather than a
second, independently unfalsifiable universal restated here.)

#### Scenario: A client-supplied corporation id in the sale body has no effect
- **WHEN** a sale request body includes a `corporationId` field naming a
  corporation other than the requester's own resolved corporation
- **THEN** the sale settles (or is rejected) exactly as it would with that
  field entirely absent — the named corporation is never credited, and the
  requester's own resolved corporation is the only one affected
