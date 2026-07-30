# account-identity Specification

## Purpose
TBD - created by archiving change add-account-identity-spec. Update Purpose after archive.
## Requirements
### Requirement: Self Account Lookup By Verified Identity
The system SHALL serve `GET /v1/accounts/firestore` returning the caller's
own account document, looked up by the `firestoreUid` extracted from the
caller's verified Firebase token, and SHALL respond `404 Not Found` when no
account exists for that identity yet (account creation is a separate,
explicit step — this endpoint does not create one). IF the underlying
account lookup fails with a storage error, THEN the system SHALL respond
`500 Internal Server Error` — distinct from the `404` returned when the
lookup succeeds but finds no account (so a caller/UI must not treat a `500`
as "no account yet" and attempt creation).

#### Scenario: An existing account is returned
- **WHEN** an authenticated caller with a previously created account calls
  `GET /v1/accounts/firestore`
- **THEN** that account document is returned

#### Scenario: No account yet is a 404, not a creation
- **WHEN** an authenticated caller with no account document calls
  `GET /v1/accounts/firestore`
- **THEN** the response is `404 Not Found` and no account is created as a
  side effect

#### Scenario: A storage error during self lookup is a 500, not a 404
- **WHEN** the account lookup for `GET /v1/accounts/firestore` fails with a
  storage/Firestore error
- **THEN** the response is `500 Internal Server Error` and no account is
  created

### Requirement: Owner-Only Full Account Read
The system SHALL serve `GET /v1/accounts/:accountId` returning the full
account document only when the path `accountId` equals the requester's own
internal account id — resolved upstream by `request-authorization`'s
Firebase-UID-to-account mapping — rejecting any other value with
`403 Forbidden`. The full document never includes `firestoreUid` (the
identity anchor is omitted from every account response, not only the
public profile — see the Public Profile Projection requirement); it does
include the owner's own `is_admin`. IF, after the ownership check passes,
the underlying account lookup fails with a storage error, THEN the system
SHALL respond `500 Internal Server Error`.

#### Scenario: A caller reading their own account succeeds
- **WHEN** an authenticated caller requests `GET /v1/accounts/:accountId`
  with their own account id
- **THEN** the full account document is returned, including their own
  `is_admin`, but never `firestoreUid`

#### Scenario: A caller reading another account is forbidden
- **WHEN** an authenticated caller requests `GET /v1/accounts/:accountId`
  with an id that is not their own
- **THEN** the response is `403 Forbidden` and no account data is returned

#### Scenario: A storage error during owner-only lookup is a 500
- **WHEN** an authenticated caller requests `GET /v1/accounts/:accountId`
  with their own account id and the underlying account lookup fails with a
  storage error
- **THEN** the response is `500 Internal Server Error`

### Requirement: Public Profile Projection
The system SHALL serve `GET /v1/accounts/:accountId/profile` for any
authenticated caller (no ownership check), returning only the limited
`AccountProfile` DTO whose JSON body contains at most `id`, `name`,
`email`, and `picture`. It SHALL NOT include any other account field —
`is_admin`, `email_verified`, `given_name`, `family_name`, `nickname`,
`profile`, `createdAt`, `updatedAt`. (The identity anchor `firestoreUid` is
serialized in no account response whatsoever — it is `json:"-"` on the
model — so its absence here is not specific to the profile projection; see
the Owner-Only Full Account Read requirement.)

`name`, `email`, and `picture` are stored verbatim from the client-supplied
request body at account creation and are not cross-checked against the
caller's own verified Firebase token claims (see `design.md`'s open
questions). Consumers of this projection — including other players'
clients rendering it — SHOULD NOT treat these fields as verified identity
signals. In particular, `email` here is unverified, self-reported data
exposed to any authenticated caller who knows or discovers the account id;
the security and data-architecture reviews independently flag broadcasting
an attacker-choosable `email` to every other player as a PII/impersonation
defect, not a data-quality nicety, once any feature exposes `accountId`
cross-player (this route already does). It is recorded as an unresolved
concern in `design.md`, not endorsed as the intended security posture, and
tracked as a recommended follow-up change (`fix-account-profile-integrity`
— see `design.md`'s Open Questions and Appendix) rather than fixed by fiat
in this documentation-only baseline.

IF the underlying account lookup fails with a storage error, THEN the
system SHALL respond `500 Internal Server Error` — distinct from the `404`
returned when the lookup succeeds but the id is unknown.

The `404`-for-unknown-id versus `200`-for-existing-id distinction depends
primarily on account ids being unguessable, server-generated UUIDs (not
sequential or otherwise enumerable) — this is the actual compensating
control. It depends only secondarily on the strict anti-automation
rate-limit tier (see the Anti-Automation Throttle requirement), which
`request-authorization` documents as bypassable via a spoofed
`X-Forwarded-For` header (no trusted-proxy configuration); the rate limit
SHOULD NOT be relied on as the sole enumeration control.

#### Scenario: Any authenticated caller can view another account's profile
- **WHEN** an authenticated caller requests
  `GET /v1/accounts/:accountId/profile` for an account that is not their
  own
- **THEN** the limited profile DTO is returned, not `403`

#### Scenario: The profile response omits internal fields
- **WHEN** any authenticated caller fetches an account's profile
- **THEN** the response body contains only `id`, `name`, `email`, and
  `picture` — `is_admin`, `email_verified`, and `firestoreUid` are absent

#### Scenario: An unknown account's profile is not found
- **WHEN** `GET /v1/accounts/:accountId/profile` is called with an id that
  does not exist
- **THEN** the response is `404 Not Found`

#### Scenario: A storage error during profile lookup is a 500, not a 404
- **WHEN** the account lookup for `GET /v1/accounts/:accountId/profile`
  fails with a storage/Firestore error
- **THEN** the response is `500 Internal Server Error`

### Requirement: Account Creation Bound to the Caller's Verified Identity
The system SHALL, on `POST /v1/accounts`, create a new account keyed to the
`firestoreUid` extracted from the caller's verified Firebase token (never
from the request body), generating a fresh server-side account id, setting
`isAdmin` from the token's own admin claim, and storing the client-supplied
profile fields (`name`, `given_name`, `family_name`, `nickname`, `email`,
`email_verified`, `picture`, `profile`) verbatim from the request body —
SHALL reject the call with `400 Bad Request` if an account already exists
for that `firestoreUid`, and SHALL reject a missing or malformed
(non-JSON) request body with `400 Bad Request`. IF the existing-account
pre-check query OR the account save fails with a storage error, THEN the
system SHALL respond `500 Internal Server Error` and no account is
created.

This existing-account check is a query followed by a separate write, not a
Firestore transaction or a `firestoreUid`-keyed document id — it is not
atomic under concurrent calls (see `design.md`'s open question on
concurrent account creation). This baseline documents the as-built
behavior, including that gap, rather than asserting a uniqueness guarantee
the code does not enforce.

None of the profile fields above is length- or format-checked, and no
request-body size cap is configured — the only bound is Firestore's own
1 MB document limit (see `design.md`'s open question on input-size/format
validation). This baseline documents that absence rather than asserting
bounds the code does not enforce.

#### Scenario: First creation succeeds
- **WHEN** an authenticated caller with no existing account calls
  `POST /v1/accounts` with profile data
- **THEN** a new account is created, keyed to their verified
  `firestoreUid`, with a freshly generated account id and the submitted
  profile fields stored

#### Scenario: A repeat creation call is rejected
- **WHEN** an authenticated caller who already has an account calls
  `POST /v1/accounts` again
- **THEN** the response is `400 Bad Request` ("Account already created.")
  and no second account is created

#### Scenario: Admin status is set from the token, not the request body
- **WHEN** an account is created for a caller whose verified token carries
  the `admin` claim
- **THEN** the new account's `isAdmin` reflects that claim, regardless of
  anything in the request body (the request body has no `isAdmin` field)

#### Scenario: A malformed or empty request body is rejected
- **WHEN** an authenticated caller with no existing account calls
  `POST /v1/accounts` with a body that is not valid JSON (or is empty)
- **THEN** the response is `400 Bad Request` and no account is created

#### Scenario: Concurrent creation calls for the same identity can each succeed
- **WHEN** two `POST /v1/accounts` calls for the same caller's
  `firestoreUid` race each other (e.g. a client retries after a timed-out
  first attempt)
- **THEN** the creation check-then-write is not transactional, so both
  calls may observe no existing account and both may succeed, creating two
  account documents for the same `firestoreUid` — which one subsequent
  reads resolve to via `GET /v1/accounts/firestore` is not deterministic
  (see `design.md`'s open question on concurrent account creation)

### Requirement: No-Op Account Push Subscription
The system SHALL serve `POST /v1/push/account-noop`, gated by OIDC
verification on the `/v1/push/*` group (owned by the `request-authorization`
capability — itself a pending baseline as of this change), as a documented
placeholder push endpoint that acknowledges and logs the delivered message
without further action, so future account-related Pub/Sub events have a
wired route to extend rather than reading as missing/broken behavior. This
route's own logic is a no-op regardless of environment; whether a message
ever reaches it is gated entirely by `request-authorization`'s OIDC check,
which that capability documents as currently rejecting all deliveries
outside local dev (see the scenario below).

#### Scenario: A delivered push message is acknowledged and discarded
- **WHEN** a Pub/Sub message is delivered to `POST /v1/push/account-noop`
- **THEN** the endpoint returns success and the message is logged, with no
  further processing

#### Scenario: In any deployed environment, the OIDC gate rejects delivery before this handler ever runs
- **WHEN** Pub/Sub attempts to deliver a message to `POST /v1/push/account-noop`
  in a deployed (non-local) environment
- **THEN** `request-authorization`'s OIDC verification rejects the request
  with `401` before this handler executes — a confirmed, as-built defect
  (stale hard-coded push audience; see `request-authorization`'s design.md)
  external to this capability's own logic, not a defect in the no-op
  handler itself, and so the scenario above ("acknowledged and discarded")
  is accurate for local dev only until that defect is fixed

### Requirement: Anti-Automation Throttle On Account Surfaces
The account creation, self-lookup, and public-profile routes
(`POST /v1/accounts`, `GET /v1/accounts/firestore`,
`GET /v1/accounts/:accountId/profile`) are this capability's
credential/enumeration surfaces and SHALL be registered behind the strict
anti-automation rate-limit tier. That tier's per-IP threshold, `ClientIP()`
keying, and `429 Too Many Requests` rejection are defined and owned solely by
`request-authorization` ("Fixed-Window Rate Limiting, Two Tiers"), which
enumerates these same routes; this requirement asserts only that these routes
are members of that tier and deliberately does not restate its numeric limit,
so the figure has a single owner.

#### Scenario: Profile enumeration over the strict limit is rejected
- **WHEN** a caller exceeds the strict anti-automation tier against
  `GET /v1/accounts/:accountId/profile`
- **THEN** the response is `429 Too Many Requests`

#### Scenario: Account-creation spam over the strict limit is rejected
- **WHEN** a caller exceeds the strict anti-automation tier against
  `POST /v1/accounts`
- **THEN** the response is `429 Too Many Requests`

### Requirement: No Account Deletion Path
The system SHALL NOT expose any route to delete an account. Once created,
an account document is retained indefinitely, including when the
underlying Firebase user is later removed or disabled (the account
document becomes orphaned — unreachable by any future token, with no
reconciliation scenario).

Profile fields set at creation (`name`, `given_name`, `family_name`,
`nickname`, `email`, `email_verified`, `picture`, `profile`) are likewise
immutable via the current API — no update route is exposed. The DAO
implements `UpdateAccount`, `DeleteAccount`, and `GetAccountByEmail`, but
none is called by any handler; they are unreferenced, dormant surface, not
wired capability.

The absence of any deletion or erasure path is recorded here as an
unresolved data-retention gap, not an endorsed design choice: `email` and
the other profile fields are PII, retained indefinitely with no erasure or
anonymization mechanism, including for an account whose underlying Firebase
user has since been removed (the orphaning behavior described above).
Deciding an erasure path is out of scope for this documentation-only
baseline — see `design.md`'s Open Questions.

#### Scenario: No route deletes an account
- **WHEN** any authenticated caller, including the account's own owner,
  attempts to delete an account
- **THEN** no such route exists; the account document persists
  indefinitely

