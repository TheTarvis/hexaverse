# request-authorization Specification

## Purpose
TBD - created by archiving change add-request-authorization-spec. Update Purpose after archive.
## Requirements
### Requirement: Firebase Bearer Verification
The system SHALL require every route in the authorized group to carry a
verifiable Firebase ID token as a `Bearer` `Authorization` header,
rejecting a missing header, a non-`Bearer` header, an empty token, or a
token that fails Firebase verification with `401 Unauthorized` before any
domain handler runs. (The realtime-sse stream route is a separate route
group, outside the authorized group covered by this capability, and
additionally accepts the token as a `token` query parameter because
EventSource cannot send headers — see `realtime-sse`.)

#### Scenario: Missing Authorization header is rejected
- **WHEN** a request to an authorized route carries no `Authorization`
  header
- **THEN** the response is `401 Unauthorized` and no handler runs

#### Scenario: Non-Bearer header is rejected
- **WHEN** the `Authorization` header does not start with `Bearer `
- **THEN** the response is `401 Unauthorized`

#### Scenario: An invalid or expired token is rejected
- **WHEN** the bearer token fails Firebase ID token verification (invalid
  signature, expired, malformed)
- **THEN** the response is `401 Unauthorized`

#### Scenario: A valid token proceeds with identity in context
- **WHEN** the bearer token verifies successfully
- **THEN** the request proceeds with the verified Firebase UID and admin
  claim available to downstream middleware and handlers

#### Scenario: The Firebase auth client is not initialized (defect surface, not a bad-token case)
- **WHEN** `FirebaseJWTVerification` runs before Firebase initialization has
  completed successfully (the Firebase SDK/auth client is nil)
- **THEN** the response is `500 Internal Server Error` ("Authentication
  service unavailable"), not `401` — this is a service-initialization
  failure, indistinguishable in status code from any other `500`, and must
  not be conflated with an invalid-token rejection when triaging

#### Scenario: 401 error detail varies by failure cause and is not sanitized (current, observable behavior — not an endorsement)
- **WHEN** Firebase token verification fails for different underlying
  reasons (malformed/non-Firebase JWT, Firebase project misconfiguration, or
  a generic invalid/expired token)
- **THEN** the `401` response body's error message differs by cause and is
  returned as-is in every environment — `Error Sanitization` applies only to
  `5xx` responses, so this differentiation is not masked outside local dev

### Requirement: Firebase UID Resolves to an Internal Account, Softly
The system SHALL, after Firebase verification, look up the internal
account id for the verified Firebase UID and make it available to
downstream handlers when found — SHALL, when no account exists yet for
that UID, continue the request without an account id set (rather than
rejecting it), so that account-creation itself can proceed through the
same authorized route group — and SHALL, when the account lookup itself
errors (the dependency is unreachable, times out, or returns any
non-not-found error), reject the request with `500 Internal Server Error`
rather than treating the failure as "no account found" — a temporarily
unreachable Firestore must never be misread as a brand-new user.

#### Scenario: An existing account resolves to its internal id
- **WHEN** the verified Firebase UID has a corresponding account document
- **THEN** the request proceeds with that account's internal id available
  to downstream handlers

#### Scenario: No account yet does not block the request
- **WHEN** the verified Firebase UID has no corresponding account document
- **THEN** the request proceeds with no account id set, rather than being
  rejected — the account-creation endpoint depends on this to let a
  brand-new user create their first account

#### Scenario: A failed account lookup is rejected, not treated as no-account
- **WHEN** the account lookup for a verified Firebase UID errors (the
  dependency is unreachable, times out, or returns a non-not-found error)
- **THEN** the response is `500 Internal Server Error`, and the request is
  not treated as either the existing-account or no-account-yet case

#### Scenario: The account DAO is not initialized (defect surface, not a lookup-error case)
- **WHEN** `FirebaseUidToAccountMiddleware` runs before the account DAO has
  been constructed (nil DAO)
- **THEN** the response is `500 Internal Server Error` ("Service not
  initialized"), distinct from the documented account-lookup-error `500`
  case above — both currently return the same status and are not
  distinguished in the audit log's classification

### Requirement: OIDC Gate on Push Routes
The system SHALL require every `/v1/push/*` route to carry a valid
Google-signed OIDC token whose `aud` claim matches the middleware's
configured push audience, rejecting a missing header, malformed header, or
a token that otherwise fails OIDC validation with `401 Unauthorized` —
except when running locally, where OIDC verification is skipped entirely
because the Firebase emulator environment sends no such token. The check
validates the token's audience only; it does not verify the identity
(service-account email/subject) of the principal that signed it.

**Current, observable defect — not an endorsement:** the middleware's
configured audience (`pushAudience` in `backend/middlewares/oidc.go`) is
hardcoded to `"flywheel-backend"`, an un-substituted skeleton leftover,
while every Pub/Sub push subscription and the Cloud Scheduler job Terraform
provisions (`infra/terraform/pubsub.tf`, `infra/terraform/scheduler.tf`)
sign their OIDC tokens for audience `"hexaverse-backend"` — a mismatch
`scheduler.tf`'s own comment already flags. The two never match outside
local dev, so every `/v1/push/*` route (the account push subscription, the
SSE broadcast pushes, and the action-sweep scheduler job) rejects 100% of
legitimate deliveries with `401` in any deployed environment today. This is
a code defect, not a design decision.

#### Scenario: A valid OIDC token is accepted
- **WHEN** a push request carries a valid OIDC token for the audience the
  middleware is actually configured to verify against
- **THEN** the request proceeds to the push handler

#### Scenario: An invalid OIDC token is rejected
- **WHEN** a push request carries a token that fails OIDC validation
- **THEN** the response is `401 Unauthorized`

#### Scenario: Local environment skips OIDC verification
- **WHEN** the service is running in the local environment
- **THEN** push routes accept the request without validating any OIDC
  token

#### Scenario: The configured audience does not currently match a deployed token (defect)
- **WHEN** the service is running in a deployed (non-local) environment and
  Pub/Sub or Cloud Scheduler delivers a push request signed for the
  Terraform-configured audience (`"hexaverse-backend"`)
- **THEN** verification currently fails with `401 Unauthorized`, because
  the middleware's hardcoded audience (`"flywheel-backend"`) does not
  match — every push route is unreachable in that environment until the
  constant is corrected

### Requirement: Corporation Resolution Seam
The system SHALL, once per authenticated request with a resolved account
id, resolve the account's living corporation (if any) and make it
available to downstream handlers via a single accessor, `common.ActorCorp`
(reading the one `common.CorpIdKey` context key) — the single seam every
fog-filtered read consumes today — SHALL leave it unset for a corpless
account rather than rejecting the request, and SHALL fail open (continue
corpless, logging a warning) if resolution itself errors, never leaking a
prior request's or another corporation's identity.

#### Scenario: A corpless request carries no corporation id
- **WHEN** an authenticated account with no living corporation makes a
  request
- **THEN** `common.ActorCorp` is unset, and the request proceeds — this is
  the expected state before spawn, not an error

#### Scenario: A spawned account's corporation is resolved
- **WHEN** an authenticated account with a living corporation makes a
  request
- **THEN** `common.ActorCorp` is set to that corporation's id

#### Scenario: A resolution error fails open, not closed
- **WHEN** the corporation-resolution lookup itself errors
- **THEN** the request proceeds with no corporation id set (fail-open to
  the corpless baseline), rather than rejecting the request

#### Scenario: A resolution failure is indistinguishable from genuine corplessness to the player (gap, not an endorsement)
- **WHEN** the corporation-resolution lookup errors for an already-spawned,
  actively-playing account, and a fog-filtered read (galaxy, system, or
  fleet) proceeds corpless per the fail-open behavior above
- **THEN** the read still returns `200` with corpless-baseline (heavily
  fogged) content — indistinguishable, to the player, from having no assets
  in view — because no consuming capability today renders a distinct
  "your view may be stale/degraded" state for this case, so a transient
  resolution error can read to the player as their fleets or colony having
  vanished

#### Scenario: The seam is not yet consumed by mutating endpoints (current, observable behavior — not an endorsement)
- **WHEN** an authenticated caller invokes a mutating fleet endpoint
  (`POST /v1/fleets/:fleetId/orders|cancel|scan`) or a generic action
  endpoint (`GET/POST /v1/actions/:actionId ...`) on an id owned by a
  different corporation
- **THEN** the request currently succeeds — `common.ActorCorp` is resolved
  and available, but is read only by fog-filtered GET reads, not by these
  mutating handlers, so no ownership comparison against the target's owner
  occurs today (the ownership-check gap tracked as open question A3; see
  the `fleet-movement` and `action-dispatch` baselines and this change's
  `design.md`)

### Requirement: Fixed-Window Rate Limiting, Two Tiers
The system SHALL enforce a per-IP, fixed-window rate limit — tracked
independently in each running backend instance's own memory, not shared or
distributed across instances — on every route in the authorized group: a
general tier of 600 requests/minute/IP applied to the whole authorized
group, and a stricter tier of 20 requests/minute/IP applied additionally to
credential/enumeration-sensitive routes (account creation, account
self-lookup, account profile lookup, and corporation spawn) — rejecting
requests over either applicable limit with `429 Too Many Requests` — and
SHALL allow both tiers to be disabled entirely via configuration (for
e2e/CI runs). The "IP" a request is keyed on is whatever Gin's
`ClientIP()` resolves.

**Current, observable defects — not an endorsement:**
- The router never configures trusted proxies (`SetTrustedProxies` /
  `TrustedPlatform` are never called), so `ClientIP()` reads the
  client-supplied `X-Forwarded-For` header when present rather than only a
  platform-verified hop. A caller can vary that header per request to
  obtain a fresh rate-limit bucket on every request, bypassing both tiers.
- The limiter is per-instance and in-memory (an unbounded map behind one
  mutex); on Cloud Run's autoscaled deployment (0–10 instances) the
  effective, enforced ceiling for a caller spread across instances can
  reach up to (instance count) × the stated threshold, and all counters
  reset on restart/redeploy.

#### Scenario: A request under both limits succeeds
- **WHEN** a caller's request count in the current window is at or below
  both the general and (if applicable) strict limit
- **THEN** the request proceeds

#### Scenario: Exceeding the general limit is rejected
- **WHEN** a caller exceeds 600 requests/minute/IP, as `ClientIP()`
  resolves it, on any authorized route
- **THEN** the response is `429 Too Many Requests`

#### Scenario: Exceeding the strict limit on a sensitive route is rejected
- **WHEN** a caller exceeds 20 requests/minute/IP, as `ClientIP()`
  resolves it, on a credential/enumeration-sensitive route
- **THEN** the response is `429 Too Many Requests`, even if the general
  limit has not been reached

#### Scenario: Rate limiting can be disabled for automated test runs
- **WHEN** the service is configured with rate limiting disabled
- **THEN** no request is ever rejected for exceeding either tier

#### Scenario: A spoofed X-Forwarded-For obtains a fresh limit bucket (defect)
- **WHEN** a caller sends requests over a tier's limit while varying the
  `X-Forwarded-For` header on each request
- **THEN** each request currently resolves to a different `ClientIP()`
  value, so the limiter does not reject the caller despite the true client
  exceeding the intended threshold

#### Scenario: The limit is enforced per instance, not service-wide
- **WHEN** a caller's requests are distributed across more than one running
  backend instance
- **THEN** each instance enforces the stated limit independently against
  its own in-memory counters, so the caller's effective ceiling across the
  whole service can exceed the stated per-IP number by up to the instance
  count

### Requirement: Error Sanitization on 5xx Responses
The system SHALL, outside the local environment, replace any `5xx` JSON
error response body with a generic message and a trace id (correlating to
server-side logs, which retain the full error detail), and SHALL pass
streaming responses (SSE) through unmodified regardless of status —
SHALL pass all responses through unmodified when running locally, so
developers see the real error.

#### Scenario: A 5xx response is sanitized in a non-local environment
- **WHEN** a handler returns a `5xx` JSON error response outside the local
  environment
- **THEN** the client receives a generic error message and a trace id, not
  the original error detail

#### Scenario: Streaming responses are never sanitized
- **WHEN** a response's `Content-Type` is `text/event-stream` (or
  `application/octet-stream`)
- **THEN** it is passed through unmodified regardless of status code

#### Scenario: Local environment passes errors through unmodified
- **WHEN** the service is running locally and a handler returns a `5xx`
  error
- **THEN** the original error body is returned unmodified

#### Scenario: The trace id is not currently surfaced to the user (gap, not an endorsement)
- **WHEN** a sanitized 5xx response's trace id is available to the client in
  the response body
- **THEN** no frontend surface today displays or otherwise makes that trace
  id available to the user, so a user who wants to reference the error when
  contacting support has no way to supply the identifier that would let it
  be correlated to server logs — the correlation mechanism this requirement
  exists to support is not yet completed on the consuming side

### Requirement: Security Headers on Every Response
The system SHALL set a standard set of security headers
(`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
`X-XSS-Protection: 1; mode=block`, `Referrer-Policy:
strict-origin-when-cross-origin`, `Strict-Transport-Security` with a
one-year max-age including subdomains, `Permissions-Policy: camera=(),
microphone=(), geolocation=()`, and a `Content-Security-Policy` of
`default-src 'none'; frame-ancestors 'none'`) on every response, regardless
of route or status code.

#### Scenario: Security headers are present on any response
- **WHEN** any request is served, successful or not
- **THEN** the response carries the full standard security header set

### Requirement: Admin-Only Gate
The system SHALL, on routes protected by the admin-only middleware, permit
the request only when the caller's verified token carries the `admin`
claim as `true`, rejecting all others with `403 Forbidden`. This middleware
is currently defined but wired to no route (no admin-only route is
registered in `router.go`); the requirement baselines its behavior for when
an admin surface is added, not an active enforced surface today.

#### Scenario: An admin caller is permitted
- **WHEN** a caller whose verified token carries `admin: true` requests an
  admin-only route
- **THEN** the request proceeds

#### Scenario: A non-admin caller is forbidden
- **WHEN** a caller whose verified token does not carry `admin: true`
  requests an admin-only route
- **THEN** the response is `403 Forbidden`

### Requirement: Auth Event Audit Logging
The system SHALL log a structured audit event, for every request that
reaches this middleware (i.e., one that passed the general-tier rate
limiter AND Firebase bearer verification), classifying it by outcome
status (`authz_failure` for a downstream `403`, `rate_limit` for a
strict-tier `429`, a general "processed" event otherwise), recording the
request method, path, and client IP on every event. Because this
middleware is wired downstream of both the general-tier limiter and
`FirebaseJWTVerification`, neither a general-tier `429` nor a
Firebase-verification `401` ever reaches it, so those outcomes are not
audit-classified here — only a `429` from the strict tier (applied within
route registration, downstream of this middleware) is classified as
`rate_limit`.

#### Scenario: A Firebase-verification 401 is not captured by this audit event (current, observable behavior — not an endorsement)
- **WHEN** a request to an authorized route fails Firebase bearer
  verification and receives `401`
- **THEN** no `auth_failure` audit event is logged — `FirebaseJWTVerification`
  aborts upstream of this middleware without calling `c.Next()`, so
  `AuditAuthEvents` never runs for it (the same mechanism that leaves a
  general-tier `429` uncaptured); the only signal is
  `FirebaseJWTVerification`'s own warning log, which is not a queryable
  audit event. The `auth_failure` classification branch in
  `audit_logger.go` is therefore effectively dead code in the current
  wiring, since no authorized-group handler emits `401` downstream of this
  middleware.

#### Scenario: A 403 response is logged as an authorization failure
- **WHEN** a request through the authorized group resolves to a `403`
  status
- **THEN** an `authz_failure` audit event is logged with the request's
  method, path, and client IP

#### Scenario: A strict-tier 429 is logged as a rate-limit event
- **WHEN** a caller exceeds the strict limit on a sensitive route and
  receives `429`
- **THEN** a `rate_limit` audit event is logged with the request's method,
  path, and client IP

#### Scenario: A general-tier 429 is not captured by this audit event
- **WHEN** a caller exceeds the general limit and receives `429`
- **THEN** the request is rejected before reaching this middleware, so no
  `rate_limit` audit event is logged for it (the rejection is visible only
  in the rate limiter's own logging)

#### Scenario: Caller identity is not attached to audit events (current, observable behavior — not an endorsement)
- **WHEN** any audited request completes and the middleware attempts to
  enrich the event with the caller's Firebase UID and account id
- **THEN** neither field is populated, because the logger reads the literal
  context keys `"firebase_uid"` and `"account_id"` while the chain sets
  `common.FirestoreUidKey` (`"x-firestore-uid"`) and `common.AccountIdKey`
  (`"x-uid"`) — the keys never match, so audit events carry only method,
  path, client IP, and status

#### Scenario: Push-route OIDC failures are not audit-classified
- **WHEN** a `/v1/push/*` request fails OIDC verification (including the
  currently-confirmed 100%-failure defect on the misconfigured audience)
- **THEN** no `auth_failure` audit event is logged for it — this middleware
  is wired only on the authorized route group, not on the push group; the
  only signal is the OIDC middleware's own unclassified warning log, which
  is not queryable as an audit event and does not distinguish "expected
  local skip" from "systemic push outage" from "forged token attempt"

### Requirement: Server-Set Anonymous Identifier
The system SHALL set a server-side, `HttpOnly`, two-year-lived anonymous
identifier cookie on every request that does not already carry one, making
its value available to downstream handlers, so logged-out visitor behavior
can be correlated without relying on client-readable or client-writable
storage.

#### Scenario: A first-time visitor receives an anonymous id cookie
- **WHEN** a request carries no anonymous id cookie
- **THEN** the response sets one (HttpOnly, ~2-year max-age) and the value
  is available to downstream handlers on that same request

#### Scenario: A returning visitor's cookie is not replaced
- **WHEN** a request already carries a valid anonymous id cookie
- **THEN** no new cookie is set, and the existing value is used

#### Scenario: The identifier is plumbed but not yet consumed (current, observable behavior — not an endorsement)
- **WHEN** the anonymous id is made available to downstream handlers via
  `common.AnonymousId(c)`
- **THEN** no handler today reads or persists it beyond the cookie itself —
  the value is set on every request but has no consumer yet

### Requirement: Request Trace ID
The system SHALL assign every request a trace id — reusing an inbound
trace id supplied in the `x-tracer` request header if present, otherwise
generating a new one — and make it available to downstream middleware and
handlers, so sanitized error responses and server-side logs can be
correlated.

#### Scenario: A request without an inbound trace id gets one generated
- **WHEN** a request carries no `x-tracer` header
- **THEN** a new trace id is generated and made available to downstream
  middleware and handlers for that request

#### Scenario: An inbound trace id is reused
- **WHEN** a request carries an `x-tracer` header
- **THEN** that value is reused as the request's trace id rather than
  generating a new one

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
