## Context

`request-authorization` is a cross-cutting, security-sensitive surface —
every authenticated route in the backend runs through this middleware
chain, and the `claude-agent-service` capability's permission model depends
on it being the *only* enforcement point. This warrants a short design.md
even though the change itself is documentation-only.

## Goals / Non-Goals

**Goals:** baseline the current middleware chain accurately; record the
token-passthrough trust model explicitly (it is currently implicit,
scattered across `claude-agent-service`'s baseline and this codebase's
`CLAUDE.md`); surface, without resolving, the ownership-check gap this
capability is the natural home for.

**Non-goals:** this change does not add, remove, or fix any authorization
check. It does not decide the open questions below.

## Decisions

### The token-passthrough trust model (documented, not decided)

The Go backend is the single permission boundary in this system:

- The frontend never holds elevated credentials — every request carries
  the user's own Firebase ID token, verified per-request by
  `FirebaseJWTVerification`.
- `claude-agent/` (the Python tool-calling agent) verifies the *same*
  Firebase token and passes it through to the Go backend on every tool
  call — it has no service-account path and mints no tokens of its own.
  The agent therefore inherits exactly the calling user's permissions; it
  cannot act with more authority than the user already has.
- Consequently, **any authorization gap in this middleware chain or in a
  domain handler is a gap for both the frontend and the agent** — there is
  no separate agent-side enforcement layer to catch what the backend
  misses.

Alternative considered: a service-account path for the agent, with its own
scoped permissions independent of the calling user. Rejected (per existing
`claude-agent-service` baseline and `CLAUDE.md`) in favor of strict token
passthrough — simpler mental model, no second permission system to keep in
sync, and it means the agent can never do something the human player
couldn't do themselves through the UI.

### The ownership-check gap — context, not resolution

The existing `fleet-movement` and `action-dispatch` baselines already
document, as current observable behavior, that the mutating fleet-order and
generic action endpoints accept any authenticated caller acting on any
actor id, without verifying `common.ActorCorp(c)` (resolved by this
capability's `ResolveCorporation` middleware) against the target's actual
owner. This capability *provides* the seam (`ResolveCorporation` /
`common.ActorCorp`) that such a check would consume — it is read today only
by fog-filtered GET endpoints, not by the mutating ones.

This design.md does not decide whether that gap is a defect to fix or an
accepted single-player-slice posture (the retrofit analysis's "A3", explicitly
left to Travis). It is recorded here only so a future
`enforce-fleet-and-action-ownership` change has its context in one place
rather than re-discovering it.

The concrete player-facing shape of this gap is worth stating plainly: a
victim player would see their own fleet's order silently changed, or their
own running action silently cancelled, by another corporation's
authenticated request — with no notification, no attribution, and nothing
in the UI today to distinguish "another player did this" from "the game
state is buggy." Naming this here is offered to sharpen the later call on
A3, not to resolve it.

### Capability boundary and naming (architect recommendation)

This capability retrofits a single, cohesive seam: everything wired in
`router.go` out of `backend/middlewares/` — the global chain (`AnonymousId`,
`SecurityHeaders`, `TRACER`, `ErrorSanitizer`), the authorized-group chain
(`generalLimit` → `FirebaseJWTVerification` → `AuditAuthEvents` →
`FirebaseUidToAccountMiddleware` → `ResolveCorporation`), the per-route
strict rate tier, the push-group OIDC gate, and the defined-but-unwired
admin gate. All eleven requirements describe one file-tree's worth of
wiring registered in one function.

The tension the architect review flagged is real: only five requirements
(`Firebase Bearer Verification`, `Firebase UID Resolves to an Internal
Account`, `OIDC Gate on Push Routes`, `Corporation Resolution Seam`,
`Admin-Only Gate`) are authentication/authorization; the other six
(`Security Headers`, `Error Sanitization`, `Fixed-Window Rate Limiting`,
`Server-Set Anonymous Identifier`, `Auth Event Audit Logging`, `Request
Trace ID`) are request-pipeline hardening and telemetry. The name
`request-authorization` under-describes more than half its own content.

**Recommendation (architect's call to own; final scope is Travis's):**
keep this as **one** capability — the seam is one seam, and splitting it
would fragment a single wiring function across two spec folders and force a
cross-reference on every future middleware change — but **rename it to
`http-request-pipeline`** (or `backend-http-middleware`) so the name
matches the true scope. The cost asymmetry makes the timing clear: this
capability is not yet in `openspec/specs/`, so a rename today is a
zero-cost folder + delta-path move; deferring it means a real
`RENAMED Requirements` migration once it is baselined. Splitting into
`request-authorization` + a sibling `request-hardening` capability is the
alternative if Travis expects the two concerns to evolve on independent
change cadences; I do not recommend it, because they share one wiring point
and one test surface today.

**Correction to the "rename is free" premise (spec-writer, this revision):**
the architect review's cost argument ("this capability is not yet in
`openspec/specs/`, so a rename today is a zero-cost folder + delta-path
move") does not hold once sibling in-flight changes are checked. Two other
proposed changes already cross-reference this capability **by name**, not
just by folder path: `add-account-identity-spec` (proposal.md, its
`account-identity` spec.md, and its own design.md — roughly a dozen
references, several inside requirement/scenario prose, e.g. "gated entirely
by `request-authorization`'s OIDC check") and `add-realtime-sse-spec`
(tasks.md, design.md, proposal.md, and its `realtime-sse` spec.md —
including the literal change-id string `add-request-authorization-spec` in
prose). Renaming this change now would mean either (a) leaving those
~25 cross-references dangling against a name that no longer exists, or (b)
editing three unrelated, independently-owned in-flight changes to keep them
accurate — both outside this revision's scope ("keep unrelated content
untouched") and a materially different cost than "a zero-cost folder move."
The rename recommendation itself still stands on the merits (the name does
under-describe the scope); only the "do it now, it's free" timing argument
is disputed. **Not applied by this revision** — the folder, change id, and
capability name remain `request-authorization` /
`add-request-authorization-spec` pending Travis's call, made with the full
cost now visible rather than the understated one.

## Risks / Trade-offs

- Documenting the current (partial) enforcement state as a spec baseline
  risks reading as an endorsement. Mitigated the same way the existing
  `fleet-movement`/`action-dispatch` baselines do it: explicit "current,
  observable behavior, not an endorsement" framing on the relevant
  requirements, and this design.md's explicit non-resolution.

- **Rate limiting is per-instance and keyed on a spoofable IP.** Both are
  now baselined directly on the `Fixed-Window Rate Limiting, Two Tiers`
  requirement as current, observable defects (untrusted `X-Forwarded-For`
  lets a caller mint a fresh bucket per request; per-instance in-memory
  counters mean the effective ceiling scales with Cloud Run's instance
  count and resets on restart). Noted here too because it's accepted for
  the current single-corporation-per-player traffic profile, not because
  the mechanism is sufficient — a trusted-proxy fix (`SetTrustedProxies`)
  and, if volume grows, a shared counter (Firestore- or Redis-backed) are
  deliberate future decisions, not surprises to discover under load. This
  design doc is currently silent on expected request volume, so there is
  no threshold to sanity-check "is per-instance sufficient" against.

- **The same X-Forwarded-For spoofing that bypasses the limit also grows the
  limiter's memory unbounded between cleanups.** `RateLimiter`'s per-IP map
  is unbounded and only pruned once a minute; because `ClientIP()` trusts
  the client-supplied header (no `SetTrustedProxies`), a single caller
  varying that header on every request can mint an unbounded number of map
  entries within a 60s window on every instance it hits — a memory-growth
  vector distinct from (and compounding) the rate-limit bypass above.
  Bounding the map (LRU cap, or fixing `ClientIP()` trust first) is part of
  the same future trusted-proxy fix, not a separate decision, but is called
  out here so it isn't lost as "just a bypass."

- **Corporation-resolution outage widens to "every player looks corpless."**
  `ResolveCorporation` fails open by design (never leak another corp's
  view), but that means an outage or bug in `corpSvc.CorpForAccount`
  degrades every spawned player's reads to the pre-spawn baseline rather
  than failing loudly — safe, but potentially confusing during triage
  unless distinguished in logs from a genuinely corpless account.

- **A verification-infrastructure failure looks identical to a bad
  credential — and neither reaches the audit log at all.**
  `FirebaseJWTVerification` and `OIDCTokenVerification` both return a flat
  `401` whether the token itself is invalid/expired/malformed or the
  verification dependency (Firebase's key-fetch, Google's OIDC validation)
  is unreachable or erroring — but per the Auth Event Audit Logging
  requirement, `AuditAuthEvents` is wired downstream of
  `FirebaseJWTVerification` in `router.go`, and that middleware aborts
  without calling `c.Next()` on `401`, so neither case ever reaches the
  audit middleware to be classified as `auth_failure` in the first place.
  A systemic verification outage is therefore indistinguishable from
  background bad-token noise not just in classification but in the audit
  log itself — both are silent there today, with only
  `FirebaseJWTVerification`'s own unclassified warning log as a signal.
  Fixing either the cause-distinction or the missing capture means
  restructuring the middleware chain or adding an audit call at the abort
  site — a behavior change, not something this documentation-only baseline
  should assert as a `SHALL`. Recorded here as a candidate for a future
  `improve-auth-failure-observability` change, not specced as current
  behavior the code doesn't have.

- **No documented timeout bounds the four per-request external calls** —
  `authClient.VerifyIDToken`, `accountDao.GetAccountByFirestoreUid`,
  `idtoken.Validate`, and `corpSvc.CorpForAccount` (the `ResolveCorporation`
  middleware's Firestore lookup, via `dao.CorpIdForAccount`) all run with
  whatever default the underlying client uses. A slow or degraded dependency
  today means a slow or hung request, not a bounded rejection. What the
  target bound should be is not decided here (see Open Questions). The
  concrete root cause worth naming for the
  future corrective change: `FirebaseJWTVerification` calls
  `authClient.VerifyIDToken` with `context.Background()`
  (`firebase_jwt.go:101`), not `c.Request.Context()` — so even the request's
  own client-disconnect/deadline cannot bound that call, and the
  request-scoped trace logger the tracer middleware installs does not
  propagate into it. `FirebaseUidToAccountMiddleware` (same file, the
  account lookup) correctly uses `c.Request.Context()`, so the two calls in
  the same chain are inconsistent — a Go context-propagation defect, left
  for a corrective change, not baselined as a `SHALL`.

### Known as-built gaps recorded for accuracy (not fixed here)

A baseline of a security-sensitive surface is only useful if it is honest
about what the code does *not* do. Two as-built gaps were found while
confirming the requirements; both are latent code defects, left for a
future corrective change so this documentation-only baseline stays
documentation-only:

- **Audit identity enrichment never fires.** `audit_logger.go` reads the
  caller identity from literal context keys `"firebase_uid"` /
  `"account_id"`, but the chain sets `common.FirestoreUidKey`
  (`"x-firestore-uid"`) and `common.AccountIdKey` (`"x-uid"`). The keys
  never match in the real chain, so audit events never carry the caller's
  UID or account id. The middleware's own unit test sets the *literal*
  keys, so it passes green over the bug. The `Auth Event Audit Logging`
  requirement is therefore worded to claim identity only where the code
  actually attaches it (the classification fields), not to assert identity
  enrichment the code cannot currently deliver.

- **OIDC push gate verifies audience only, and the configured audience is
  confirmed wrong.** `oidc.go` accepts *any* Google-signed OIDC token whose
  audience matches the hard-coded constant `pushAudience =
  "flywheel-backend"` — it does not pin the pushing service account
  (issuer/`email`/subject), so any principal that can obtain a Google OIDC
  token for that audience clears the gate. Worse: the constant is simply
  wrong. `infra/terraform/pubsub.tf` and `infra/terraform/scheduler.tf`
  sign every push subscription's and the action-sweep scheduler job's OIDC
  tokens for audience `"hexaverse-backend"` — `scheduler.tf`'s own comment
  already flags the mismatch by name. The two literals never match outside
  local dev, so **every `/v1/push/*` route rejects 100% of legitimate
  deliveries with `401` in any deployed environment today** — this is not
  a hypothetical, it is confirmed by reading both sides of the contract.
  This is now baselined directly in the `OIDC Gate on Push Routes`
  requirement (with its own defect scenario) rather than left as a
  design.md aside, because a spec that silently asserted "a valid OIDC
  token is accepted" would misdescribe the system's own live behavior.
  Fixing the constant is a one-line change but is left for a future
  corrective change (e.g. `fix-oidc-push-audience`) so this baseline stays
  documentation-only — flagged to the orchestrator as a priority correction
  given it is a confirmed, live, total outage of push delivery in both
  deployed environments today, not a latent risk; pinning the pushing
  service account's identity (not just its audience) is a separate, larger
  hardening step and remains a candidate for a future `harden-push-oidc`
  change. Separately, both the `pushAudience` constant's old value and the
  anonymous-id cookie name (`fw_aid`, `middlewares/anonymous_id.go`) are
  unrelated Flywheel-skeleton naming leftovers from before the hexaverse
  fork — harmless on their own, but flagged here since this retrofit is
  where such drift naturally surfaces; a future naming-cleanup change, not
  this one.

  This gap is sharper than it might read in isolation:
  `infra/terraform/cloudrun.tf` sets `invoker_iam_disabled = true` on the
  backend Cloud Run service (confirmed — "makes service publicly
  accessible", used to bypass an org policy on `allUsers`), so `/v1/push/*`
  has **no Cloud Run IAM check backstopping it** — the audience-only OIDC
  middleware is the entire perimeter for an internet-reachable endpoint, not
  one layer of several. Once the audience constant is corrected
  (`fix-oidc-push-audience`), any principal able to obtain a Google-signed
  OIDC token for audience `"hexaverse-backend"` — a guessable, non-secret
  string — clears the gate; `harden-push-oidc`'s identity-pinning work
  therefore closes a public-internet exposure, not a defense-in-depth
  nicety.

  Player-facing impact of the current outage is bounded, not a stuck state,
  worth stating so a reader triaging urgency doesn't have to cross-reference
  two other capabilities to learn it: `realtime-sse`'s own baseline already
  treats SSE delivery as best-effort, and `hex-board-view`'s redundant
  ETA-scheduled and periodic-poll refetch rules mean an open board still
  resyncs without the broadcast — this defect currently degrades real-time
  update latency in every deployed environment, it does not strand any view.

### The account-creation uniqueness gap — cross-reference, not duplication

This capability's soft-fail UID→account resolution
(`FirebaseUidToAccountMiddleware` continuing without an account id when
none exists) is the seam that lets `POST /v1/accounts` run at all for a
first-time caller — and it is also what makes `account-identity`'s
concurrent-creation race possible: two requests from the same Firebase UID
arriving close together both resolve "no account yet" here, and both reach
`account.CreateAccountHandler`'s non-transactional check-then-set. The
`account-identity` capability's own `design.md` already documents this race
in full (its "A second surfaced (unresolved) question," including the
`corpByAccount/{accountId}`-pointer-doc alternative and the recommendation
to defer the fix to a future `fix-account-identity-uniqueness` change) —
this section exists only to point at that analysis from the seam's other
end, not to duplicate it. That same `account-identity` design.md also notes
the companion fact that a failed account lookup here fails closed
(`500`, not "no account") — which is now baselined directly on this
capability's `Firebase UID Resolves to an Internal Account, Softly`
requirement above.

## Migration Plan

None — documentation-only change, no code or data migration.

## Open Questions

- **Channel subscribe-side authorization** (owned by the `realtime-sse`
  capability, not this one — cross-referenced here because it is the same
  class of gap): should an account be restricted to subscribing only to
  SSE channels it is entitled to see?
- **The fleet/action ownership-check gap** ("A3" in the retrofit analysis):
  is the current no-ownership-check behavior on mutating fleet/action
  endpoints a defect to fix, or an accepted posture for the current
  single-player-per-corporation slice? Left to Travis; not decided by this
  change.
- **Capability boundary/naming**: the architect review's recommendation is
  recorded as a Decision above (`Capability boundary and naming`) — keep one
  capability, rename to `http-request-pipeline`. The "do it now while it's
  free" timing argument is disputed in that same Decision (this revision
  found ~25 by-name cross-references from two sibling in-flight changes,
  `add-account-identity-spec` and `add-realtime-sse-spec`, so a rename today
  is not the zero-cost move it was assumed to be). The residual open
  question is a decision only Travis can close: accept the rename
  (budgeting the cross-reference cleanup across those two sibling changes as
  part of the same rename change), or keep `request-authorization` as-is.
  Not applied by this revision.
- **No documented timeout** bounds `authClient.VerifyIDToken`,
  `accountDao.GetAccountByFirestoreUid`, `idtoken.Validate`, **or
  `corpSvc.CorpForAccount` (the `ResolveCorporation` middleware's Firestore
  lookup, via `dao.CorpIdForAccount`)** — a slow/degraded dependency
  currently means a slow/hung request, not a bounded rejection, for any of
  these four per-request external calls. `ResolveCorporation`'s own
  requirement documents fail-open on an *error*; it is silent on a *slow,
  non-erroring* call, which stalls the request the same way the other three
  do. What is the target bound for each? Not decided here — no number is
  invented.
- **The anonymous identifier's retention and purpose:** `AnonymousId` sets
  a 2-year `HttpOnly` cookie (`fw_aid`) on every request, unconditionally,
  and `common.AnonymousId(c)` exposes it to handlers — but no handler
  currently reads it (see the `Server-Set Anonymous Identifier`
  requirement's "plumbed but not yet consumed" scenario). Is this dead
  platform-template plumbing to remove, or a tracking mechanism awaiting a
  consumer? If the latter, this capability needs a stated retention/
  deletion story (what happens to a stale anonymous id, whether it is ever
  linked to an account once one is created) before it is more than
  incidental. Left to Travis; not resolved by this change.
