## Context

The retrofit analysis flagged an open question (its "A1"): does
`POST /v1/accounts` bind the created account to the caller's own token
identity, or trust the request body for identity? Reading
`backend/account/handler.go`'s `CreateAccountHandler` resolves this from
code, so it is answered here (not left open) — but reading it surfaced a
narrower, genuinely open question about the self-reported profile fields,
which is recorded below rather than resolved by fiat.

## Resolution of A1 — account identity binding

`CreateAccountHandler` takes the caller's `firestoreUid` from
`common.FirestoreUid(c)` — set by `FirebaseJWTVerification`, i.e. from the
verified token, never from the request body — checks for an existing
account under that `firestoreUid`, and only if none exists mints a fresh
server-generated `uuid` as the account id and stores it with that
`firestoreUid`. **The identity anchor (`firestoreUid`) is bound to the
verified token, not spoofable via the request body.** This is not the
defect the analysis flagged as possible; it is specced as correct,
intentional behavior in `specs/account-identity/spec.md`.

## A newly surfaced (unresolved) question — self-reported profile fields

`CreateAccountRequest` accepts `name`, `email`, `email_verified`,
`picture`, etc. straight from the client body and stores them verbatim,
with **no cross-check against the Firebase token's own claims** (which
also carry email/name/picture for most providers). A caller could self-report
an `email` or `email_verified` value that does not match their actual
Firebase identity.

This is a genuine open question, not part of the original analysis's A1-A5
— it surfaced while resolving A1 — so it is recorded here rather than
resolved:

- **Open**: should account creation prefer/verify profile fields against
  the Firebase token's own claims (where present) over trusting the
  client-supplied body? Consequence: a mismatched self-reported `email`
  could mislead the `account-identity` -> `AccountProfile` surface (public
  profile projection), which other users see. Deferred to Travis; not
  addressed by this change, and not changed by fiat here — the baseline
  spec documents current (trust-the-body) behavior for these fields
  without endorsing it.
- **Panel review compounds this**: the security review flags this as more
  than a data-quality question — because `email` is one of the fields the
  public profile projection returns to *any* authenticated caller (not
  just the owner), an unverified, self-reported `email` is not merely
  stored, it is broadcast as if it were a trustworthy identity signal to
  every other player. The architect review independently raised the same
  compounding point. Fixing it (e.g. reconciling against the token's own
  claims on write, or narrowing the public projection to drop `email`) is
  a behavior change, out of scope for this documentation-only baseline —
  recorded here so the decision has a home, not resolved by this change.
  The baseline spec below documents current (trust-the-body,
  email-included-in-profile) behavior without endorsing it as the intended
  security posture.
- **Tracked as a follow-up.** The security and data-architect reviews both
  went further and proposed the actual fix (drop `email` from the public
  projection unless it is reconciled against the caller's verified token
  claims on write) as a requirement to baseline now. Disputed here (see
  Decision D4): baking that `SHALL` into *this* change would assert
  behavior the deployed code does not implement, contradicting this
  change's own documentation-only premise — the same reasoning this
  baseline already applies to the concurrent-creation gap below. The fix
  is recorded as a named, paste-ready follow-up (`fix-account-profile-integrity`)
  in the Appendix instead of being adopted here.

## A second surfaced (unresolved) question — concurrent account creation

`CreateAccountHandler` enforces "one account per `firestoreUid`" with a
check-then-write: `GetAccountByFirestoreUid` (a query) followed by
`SaveAccount` (a `Set` under a freshly generated `uuid` doc id) — not a
Firestore transaction, and not a `firestoreUid`-keyed document id that
would make the write naturally idempotent. Two concurrent
`POST /v1/accounts` calls for the same `firestoreUid` (e.g. a double-click,
or a client retrying after a timed-out first attempt with an ambiguous
outcome — the frontend's account-provisioning flow fires this
automatically on any 404 with no cross-tab guard) can both observe "no
existing account" and both write, producing two account documents that
share one `firestoreUid`. Every subsequent request then resolves
`common.Actor(c)` via `GetAccountByFirestoreUid`'s unordered `Limit(1)`
query (`middlewares.FirebaseUidToAccountMiddleware`), so which of the two
duplicate accounts backs a given request is undefined and can vary
request-to-request. `corporations`' `corpByAccount/{accountId}` pointer
guards the *next* seam (one corp per account) correctly, inside a
transaction — but it sits downstream of this unstable account mapping, so
a duplicated account can still produce a duplicated corporation for one
human.

**User-facing consequence (ux review):** because request-time resolution of
`firestoreUid → accountId` is an unordered query, a player with two account
documents for one identity is not merely a storage anomaly — they can be
handed a different one of the two on different requests, which looks to
that player like their corporation and fleet intermittently disappearing
(replaced by the corpless wake-up flow) or a second corp getting minted
under them. No current spec documents this as a reachable player-visible
state; recorded here as the ux-relevant sharpening of the open question
below, not resolved by this change.

- **Open**: should `POST /v1/accounts` be made concurrency-safe — e.g. a
  transactional check-and-create, or (matching the pattern
  `corporations.DaoImpl.CreateWithPointer` already uses for
  `corpByAccount/{accountId}`) an `accountByFirestoreUid/{firestoreUid}`
  pointer document written in the same transaction as the account, with
  `FirebaseUidToAccountMiddleware` switched from the unordered query to a
  direct `Get` on that pointer? Deferred to Travis; not resolved here —
  this documentation-only retrofit is not the place to change the write
  path. Recommended as a follow-up, code-changing spec (e.g.
  `fix-account-identity-uniqueness`). The baseline spec below documents
  the as-built, non-atomic behavior — including that it can produce
  duplicates under concurrency — rather than asserting a uniqueness
  guarantee the code does not actually enforce.

## A third surfaced (unresolved) question — no input-size/format validation on account creation

The security review confirmed, against `handler.go`'s `CreateAccountRequest`
binding, that `POST /v1/accounts` accepts `name`, `email`, `picture`,
`profile`, and the other free-text profile fields with no per-field length
or format validation, and that no request-body size cap
(`http.MaxBytesReader` or equivalent) is configured anywhere in the
backend — the only bound is Firestore's own 1 MB document limit. This is a
real, unmitigated gap (storage-bloat and stored-content-injection surface,
e.g. an oversized `name` or a `picture` value using a non-`https` scheme
later rendered by another player's client via the public profile
projection), confirmed from code, not hypothetical.

- **Open**: should `POST /v1/accounts` enforce a request-body size cap and
  per-field length/format limits (including an `https`-only scheme check on
  `picture`)? Deferred to Travis; not resolved here — this
  documentation-only retrofit is not the place to add validation logic.
  Recommended as a follow-up, code-changing spec
  (`fix-account-creation-input-bounds`; paste-ready requirement text in the
  Appendix). The baseline spec's Account Creation requirement documents the
  as-built absence of bounds, not a guarantee the code enforces.

## Decisions

### D1 — `firestoreUid` is never serialized in any account response

The `Account` model tags `FirestoreUid` as `json:"-"`, so the identity
anchor is absent from **every** JSON response — the owner-only full read
(`GET /v1/accounts/:accountId`) included, not only the public profile
projection. Requirement text must not imply the full account read exposes
`firestoreUid` and the profile read is what hides it; the field is hidden
everywhere at the model layer. The public `AccountProfile` DTO is a
*further* narrowing (drops `is_admin`, `email_verified`, name parts, etc.)
on top of that. Note also the response contract uses snake_case JSON names
(`is_admin`, `email_verified`, `given_name`, `family_name`) — not the
camelCase Firestore field names — so requirements describing what a caller
observes should name the JSON keys.

### D2 — "the requester's own internal account id" is resolved upstream

The owner check in `GetAccountByIdHandler` compares the path `accountId`
against `common.Actor(c)`, which returns the internal account id set by
`middlewares.FirebaseUidToAccountMiddleware`. That middleware resolves
`firestoreUid → accountId` by calling this capability's own DAO
(`GetAccountByFirestoreUid`) and leaves the id **unset when no account
exists yet** (so `Actor` is the empty string for a pre-creation caller —
harmless here because a required non-empty path param can never equal `""`).
The resolution mechanism is owned by `request-authorization` (as the push
OIDC verification is); the `account-identity` spec should cross-reference it
where the owner check depends on it, rather than restating the mechanism.
This is also the one cross-boundary read where middleware consumes the
account **DAO** directly rather than a service — an as-built seam, noted for
accuracy, not changed by this documentation-only baseline.

### D3 — the strict rate-limit tier is owned by `request-authorization`, not restated here

`request-authorization`'s "Fixed-Window Rate Limiting, Two Tiers" requirement
already owns the strict tier's numeric threshold (20 req/min/IP), its
`ClientIP()` keying, its `429` rejection, and — critically — the enumerated
list of routes it applies to, which already names "account creation, account
self-lookup, account profile lookup, and corporation spawn." Those are
exactly this capability's three sensitive routes. So the *number and mechanism*
have a single owner one capability over. The `account-identity` requirement
that exists to say "these routes are enumeration surfaces" must therefore
assert only *membership* in that tier, not re-state the `20 req/min` figure —
otherwise the two baselines archive into `specs/` with the same security
number written in two places, and a later tuning of the tier silently drifts
one copy. This capability owns *which of its routes are sensitive*;
`request-authorization` owns *what the strict tier is*. (See the finding to
the spec writer.)

### D4 — proposed controls that would change behavior are tracked as follow-ups, not adopted here (disputed panel findings)

The security review proposed two new requirements to add directly to this
baseline: (1) `SHALL exclude email` from the public profile projection, and
(2) `SHALL` bound request-body size and per-field length/format on account
creation. Both findings are accurate — the gaps are real and confirmed
against code (see the two open questions above) — but I did not adopt
either as an `ADDED Requirement` in `specs/account-identity/spec.md`, and
record that dispute here rather than silently dropping them.

**Why not:** this change's own premise, stated in `proposal.md` and applied
consistently to every other gap it found (the self-reported-email question,
the concurrent-creation race, the missing deletion path), is that it
documents *current, as-built* behavior with no code change. Both of the
security review's proposed requirements assert a `SHALL` the deployed code
does not implement — adopting them here would make the baseline `spec.md`
describe behavior that does not exist, which is a worse defect than the one
being fixed (a spec that lies about what's built is exactly the failure
mode OpenSpec retrofits exist to prevent). The dba review's parallel
findings on the same two topics independently reached the same conclusion
— recommending each be filed as a tracked, code-changing follow-up rather
than resolved by fiat in a documentation-only change — and dba's framing is
the one applied below (dba wins ties on data-integrity mechanics; this
extends the same reasoning to the profile-integrity finding on
user-observable-data grounds).

**What I did instead:** both gaps are recorded as open questions above with
named follow-up changes (`fix-account-profile-integrity`,
`fix-account-creation-input-bounds`), the current baseline's own
requirement text was strengthened to name the gap and its severity
explicitly (not merely note it neutrally), and paste-ready requirement text
for both follow-ups is captured verbatim in the Appendix so neither stalls
as a paragraph. If Travis decides either fix should land as a code change
now rather than later, the Appendix text is ready to lift into a new
change's spec delta without re-deriving it.

## Risks

- **Blast radius wider than the routed surface.** `backend/middlewares/
  firebase_jwt.go`'s `FirebaseUidToAccountMiddleware` is wired onto the
  entire `authorized` route group and the SSE channel group in
  `router.go` — not just `backend/account/`'s own four routes — and it
  calls this capability's `GetAccountByFirestoreUid` DAO method on every
  authenticated request in the game (galaxy, system, board, fleet, action,
  observation, corporations, SSE). A Firestore error on that lookup aborts
  the request with `500` (fail-closed), so a storage problem inside
  `account-identity` is an outage for every authenticated capability, not
  a degraded account page. This is existing, live behavior this retrofit
  did not introduce and does not change — flagged here for accuracy
  because `account-identity`'s own DAO is the thing being called. The
  companion `500`-on-lookup-error scenario, and its contrast with the
  fail-open Corporation Resolution Seam one step later in the same
  middleware chain, belongs to `request-authorization` (which owns
  `FirebaseUidToAccountMiddleware`) — noted here, not added there, since
  that capability is a sibling in-flight change outside this one's scope.
- **Account failures aren't attributable by cause.** Given the blast
  radius above, nothing today distinguishes "Firestore is failing account
  lookups" from any other `500` in the shared authenticated middleware
  chain, or a duplicate-`firestoreUid` state (see the concurrent-creation
  question above) from a routine error — handler/DAO code logs at
  `Warn`/`Error` with no stable, queryable cause field. This is an
  observability gap, not a documented behavior, so it is recorded here
  rather than specced as a `SHALL` — spec text would have to describe a
  guarantee the code does not make. Candidate follow-up: a stable
  cause/kind field on account-lookup and account-creation error logs (see
  the Appendix for paste-ready requirement text).
- **The push route this capability owns is currently unreachable in every
  deployed environment.** The sibling `request-authorization` retrofit
  (`openspec/changes/add-request-authorization-spec/design.md`) baselines a
  confirmed, as-built defect: the OIDC audience checked by `oidc.go` is
  hard-coded to a stale value (`"flywheel-backend"`) that Terraform never
  signs push tokens for (it signs `"hexaverse-backend"`), so **every**
  `/v1/push/*` route — including this capability's own
  `POST /v1/push/account-noop` — rejects 100% of legitimate Pub/Sub
  deliveries with `401` in any deployed environment (dev/prod; only local
  dev, where OIDC verification is bypassed, is unaffected). The "No-Op
  Account Push Subscription" requirement's "acknowledges and logs"
  scenario is accurate for local dev only; in dev/prod today the message
  never reaches the handler (now captured as its own scenario in
  `specs/account-identity/spec.md`). No account data is lost — the handler
  is a no-op — but the requirement previously read as describing working
  behavior without saying so. Fix is out of scope here (owned by
  `request-authorization`'s recommended `fix-oidc-push-audience`
  follow-up); noted so this baseline doesn't silently claim behavior only
  local-dev testing would corroborate.
- **No fail-fast timeout on the account-lookup dependency call.** Every DAO
  method in `backend/account/dao.go` (`GetByAccountId`,
  `GetAccountByFirestoreUid`, `SaveAccount`) takes the caller's context as-is
  with no `context.WithTimeout`/`WithDeadline` wrapping, and no Firestore
  client-level RPC timeout is configured either. The only bound is the
  platform default: Cloud Run's `900s` request timeout
  (`infra/terraform/cloudrun.tf`). Given the blast radius documented above —
  `FirebaseUidToAccountMiddleware` calls `GetAccountByFirestoreUid` on every
  authenticated request app-wide — a Firestore call that is merely slow (not
  erroring) holds that request open for up to 15 minutes rather than failing
  fast, with no circuit breaker or fallback. Fail-open vs. fail-closed under
  *slowness* (as distinct from the already-documented fail-closed-on-error
  path above) has never been an explicit decision. Not resolved by this
  documentation-only baseline — see Open Questions.
- **Provisioning failure has no specified frontend recovery.** The
  frontend's account-provisioning flow (see this design.md's note on the
  concurrent-creation question) treats every failure of the automatic
  `POST /v1/accounts` call the same way today: logged, not surfaced, with
  no retry — a dead end for the signed-in user (confirmed: `hasTriedCreation`
  permanently blocks retry for the session, the exposed `error` reports the
  stale original `404` rather than the provisioning failure, and the
  layout wrapper has no render branch for this state — it falls through to
  a blank frame). This is a UX gap in the consuming flow, not this
  capability's API contract; the fix belongs in `session-wakeup` (see its
  recommended "Account Provisioning Failure Shows a Retriable Error, Not an
  Indefinite Blank Frame" requirement — out of scope to add here since it
  is not this change's capability).

## Non-Goals

- This change does not modify `backend/account/` code. It documents
  current behavior and records the open questions above for future
  decisions.
- `Dao.UpdateAccount`, `Dao.DeleteAccount`, and `Dao.GetAccountByEmail` are
  implemented and unit-tested but not routed by any handler — no
  `PATCH`/`DELETE /v1/accounts/...` endpoint exists today, and this
  baseline does not add one. Account update/deletion (including any
  cascading cleanup of a departed account's corp/fleets) is out of scope
  for this retrofit and undecided, not silently missing — see the "No
  Account Deletion Path" requirement in `specs/account-identity/spec.md`,
  which documents the absence, not a design choice to never allow it.

## Open Questions

- Should self-reported profile fields (`name`, `email`,
  `email_verified`, `picture`) on `POST /v1/accounts` be validated or
  overridden against the verified Firebase token's own claims? (Surfaced
  during this retrofit; not resolved here.) The security review's finding
  that unverified `email` is then broadcast via the public profile
  projection to any authenticated caller sharpens this from a
  data-quality question to a PII/impersonation one — see "A newly
  surfaced (unresolved) question" above.
- Should `POST /v1/accounts` be made concurrency-safe against duplicate
  accounts for one `firestoreUid`? (Surfaced during this retrofit; not
  resolved here — see "A second surfaced (unresolved) question" above.)
- Should account deletion be supported at all, and if so, what happens to
  a departed account's corporation and fleets? Not addressed by this
  baseline; the current absence of any deletion route is documented as
  as-built behavior, not evaluated as a decision. Relatedly: what erasure
  or anonymization path, if any, should exist for the PII (`email` and
  other profile fields) an orphaned or departed account retains
  indefinitely today? (dba/security review; see the "No Account Deletion
  Path" requirement.)
- Should `POST /v1/accounts` enforce a request-body size cap and per-field
  length/format bounds (including an `https`-only `picture` scheme check)?
  (Surfaced during this retrofit's security review, confirmed against
  code; not resolved here — see "A third surfaced (unresolved) question"
  above.)
- What request-scoped timeout, if any, should bound the account-lookup
  Firestore call inside `FirebaseUidToAccountMiddleware` / this
  capability's own DAO methods? Today there is none — the call inherits
  the incoming request's context, bounded only by Cloud Run's
  platform-wide 900s timeout. Not resolved here; the design doc is silent
  on an intended threshold, so no number is invented — recorded as an open
  question for whichever change (`account-identity` or
  `request-authorization`) picks up the dependency-slowness gap
  (reliability review).

## Appendix: paste-ready requirement text for recommended follow-up changes

Not part of this baseline. Captured here, verbatim from panel review, so
each recommended follow-up (see `tasks.md` section 3) can be filed as its
own code-changing OpenSpec change without re-deriving the requirement text.
Route/id names (`fix-account-identity-uniqueness`, etc.) are suggestions,
not commitments.

### `fix-account-identity-uniqueness` — atomic account creation (dba review; reliability review recommends the same fix)

```markdown
## MODIFIED Requirements

### Requirement: Account Creation Bound to the Caller's Verified Identity
The system SHALL, on `POST /v1/accounts`, atomically create a new account
and its `firestoreUid` uniqueness pointer in one Firestore transaction —
keyed to the `firestoreUid` extracted from the caller's verified Firebase
token (never the request body) — and SHALL reject the call with
`400 Bad Request` if an account already exists for that `firestoreUid`,
including when two creation calls race each other (at most one succeeds;
the loser observes the existing-account rejection, never a second account
document).

#### Scenario: Concurrent creation calls for the same identity produce exactly one account
- **WHEN** two `POST /v1/accounts` calls for the same caller's
  `firestoreUid` race each other
- **THEN** exactly one account document is created and the second call
  receives `400 Bad Request` ("Account already created.")
```

Implementation note carried from the panel: write
`accountByFirestoreUid/{firestoreUid}` as a one-field pointer doc in the
same Firestore transaction as `accounts/{accountId}`, mirroring
`corporations.DaoImpl.CreateWithPointer`'s pattern (read pointer, abort
with `400` if it exists, else `tx.Create` both docs), and switch
`FirebaseUidToAccountMiddleware` from `GetAccountByFirestoreUid`'s
unordered `Where(...).Limit(1)` query to a direct `Get` on the pointer.
This closes both the duplicate-account race and its downstream
corp-duplication consequence in one change.

### `fix-account-profile-integrity` — unverified email exposure (security + dba review)

```markdown
## MODIFIED Requirements

### Requirement: Public Profile Projection
The system SHALL serve `GET /v1/accounts/:accountId/profile` returning only
`id`, `name`, and `picture` for any authenticated caller. `email` SHALL NOT
be included in the public profile projection unless the account's `email`
was set from (or reconciled against) the caller's own verified Firebase
token claims at creation time — self-reported, unverified email SHALL NOT
be broadcast to other callers.

#### Scenario: Unverified email is not exposed to other users
- **WHEN** an account's `email` field was set from the client-supplied
  request body at creation and does not match the account's verified
  Firebase token claims
- **THEN** `GET /v1/accounts/:accountId/profile` for that account omits
  `email`
```

### `fix-account-creation-input-bounds` — request-body/field validation (security review)

```markdown
## ADDED Requirements

### Requirement: Account Creation Input Bounds
The system SHALL bound the request body and each stored profile field on
`POST /v1/accounts`: the request body SHALL be limited to 16 KB (via
`http.MaxBytesReader`) and a larger body SHALL be rejected with
`400 Bad Request`; `name`, `given_name`, `family_name`, `nickname`, and
`profile` SHALL each be limited to 256 characters and `email` to 320
characters, rejecting an over-length field with `400 Bad Request`; and
`picture` SHALL be accepted only if it is an `https://` URL, rejecting any
other scheme (including `javascript:` and `data:`) with `400 Bad Request`.

#### Scenario: An over-length field is rejected
- **WHEN** a caller submits a profile field exceeding its documented
  length limit
- **THEN** the response is `400 Bad Request` and no account is created

#### Scenario: An over-size body is rejected
- **WHEN** a caller submits a request body larger than 16 KB
- **THEN** the response is `400 Bad Request` and the body is not fully
  buffered

#### Scenario: A non-https picture URL is rejected
- **WHEN** a caller submits a `picture` value whose scheme is not `https:`
- **THEN** the response is `400 Bad Request`
```

### `fix-account-failure-logging` — attributable error logging (reliability review, optional/MINOR)

```markdown
## ADDED Requirements

### Requirement: Attributable Account Failure Logging
The system SHALL tag account-lookup and account-creation error logs with a
stable, queryable `cause` field distinguishing at least: storage/Firestore
error, duplicate-firestoreUid state, and malformed request — such that
Firestore outages affecting account lookups are countable and
distinguishable from routine client errors in logs/metrics.

#### Scenario: A storage outage is distinguishable from a routine 400
- **WHEN** account-lookup or account-creation logs are queried over a time
  window containing both a Firestore outage and ordinary malformed-request
  rejections
- **THEN** the two are distinguishable by the `cause` field without
  inspecting full log bodies
```

Not tracked as a `tasks.md` follow-up item (kept optional/informational
per the reliability review's own framing) — captured here in case it's
picked up alongside one of the other follow-ups.
