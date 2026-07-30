# Design — realtime-sse (retrofit baseline)

## Context

`backend/sse/` is the delivery half of the realtime loop whose emit half is
already specced under `action-dispatch` ("Completion Event Fan-Out"). A
resolved action publishes an `ActionCompleted` envelope to Pub/Sub keyed by a
scope channel; a Terraform push subscription delivers it to
`POST /v1/push/sse-action`; that handler fans it out to every `EventSource`
client streaming `GET /v1/channels/:channelId/stream` for that scope. This
change documents the as-built delivery side; no code changes.

The package is deliberately game-agnostic: a "channel" is an opaque string, the
payload is a nudge-to-refetch rather than resolved state (`env.Payload`; see
the D1 correction below on what that payload actually contains), and the
manager also carries two account/admin fan-out helpers that game code does not
currently wire. The seam
is `backend/sse/` — a clean package boundary, one HTTP stream endpoint plus one
push endpoint — so `realtime-sse` maps to a real system seam, not a cross-cut.

## Goals / Non-Goals

**Goals**
- Pin the observable contract of the stream endpoint (connected event, relay,
  isolation, heartbeat, disconnect, token rejection).
- Pin the slow-consumer drop guarantee (one client's full buffer never blocks
  or starves the channel).
- Pin the push-to-SSE bridge (`ActionCompleted` → scope channel) including its
  non-fatal drop paths (no `channelId`, undecodable envelope).

**Non-Goals**
- Not changing behavior. Documentation-only.
- Not *resolving* the subscribe-side authorization question — the gap is now
  a first-class ADDED requirement (`No Channel-Ownership Binding on
  Subscribe`, documenting current behavior, mirroring
  `action-dispatch`'s "No Caller-Identity Binding on Action Endpoints"), but
  this change does not add enforcement code (see Open Questions Q1).
- Not adding new controls the code doesn't have today — token-in-log
  redaction, per-account connection/rate limits, or a bounded connection
  lifetime (all raised by the security panel review, see R2/R3 and Open
  Questions Q2) — because this change documents as-built behavior; adding
  enforcement is separate implementation work for a follow-up change.
- Not specifying `BroadcastToAccount` / `BroadcastToAdmins` / `GetClientCount`
  — present in `manager.go` but unreferenced outside tests (no route, no
  caller). They are reserved surface, out of scope here; call them out as
  intentionally-omitted so the spec's coverage of "the broadcast manager" reads
  as deliberate, not partial.

## Decisions

**D1 — SSE is invalidation, not truth.** The delivered payload is a nudge to
refetch, never *resolved* game state (fog is not re-applied at delivery time —
the client refetches through the fogged read path — and a dropped or missed
event is a performance issue, not a correctness one, because the client always
converges via refetch). This is `#0005` Decision #10, restated in
`subscriptions.go`. Correction from the security panel review, adopted here:
"nudge" undersells the payload's actual content — `publishCompleted`
(`backend/action/service.go`) attaches `actionId`, `type`, `actor`, `scope`,
`outcome`, and `eta` to every `ActionCompleted` event, not just a bare
timing ping. That correction doesn't change D1's core claim (the client still
re-derives truth by refetching through the fogged read path, so a missed
event is a latency problem, not a state-corruption one) — but it does matter
for Q1 below, since it means a caller subscribed to a channel it doesn't own
learns real activity detail (who moved, what verb, against what scope, with
what outcome), not just "something happened." It is the load-bearing premise
for D2 and R1.

**Cross-reference flagged by the dba panel review, recorded here rather
than edited into the sibling spec:** `observation-fog-and-scan`'s Purpose
states fog is "never a client-side hide." That guarantee is scoped to the
reads it filters (`galaxy`/`system`/`fleet` via `.WithFog(...)`) and does
not extend to this capability's completion channel — a subscriber to a
channel it does not own receives the `ActionCompleted` payload above with
no fog/ownership filter (see `No Channel-Ownership Binding on Subscribe`).
This is the same fact Q1 already covers from this capability's side; it's
repeated here, addressed to a future reader of `observation-fog-and-scan`,
because that capability's guarantee reads as broader than it currently is.
Not applied as an edit to `observation-fog-and-scan/spec.md` itself — its
"Notes for future maintainers" section is prose, not a `### Requirement:`,
and the OpenSpec delta format (`## ADDED/MODIFIED/REMOVED/RENAMED
Requirements`) only targets requirement-level content, so a delta from
*this* change has no mechanism to touch it without inventing a requirement
that capability doesn't have. If `observation-fog-and-scan` is revised for
any other reason, its author should fold this cross-reference into that
capability's own Notes section then.

**D2 — Per-instance in-memory manager, backed by a client poll.** `SSEManager`
is a per-Cloud-Run-instance singleton holding an in-memory client map; a
broadcast reaches only clients connected to the same instance that received the
Pub/Sub push. Correctness does not depend on any single event arriving: the
frontend `useBoardRealtime` hook runs three convergent refetch rules — ETA
self-schedule, SSE-on-completion, and a gentle poll (`BOARD_POLL_MS = 20s`,
`SCAN_POLL_MS = 5s` while scanning) — all folding into one idempotent board
invalidation. The poll is the backstop that makes D2 safe; it must not be
"optimized away" on the belief that SSE alone suffices (see R1).
**As of this revision, only two of those three rules are actually live in
any deployed (non-local) environment** — the SSE-on-completion leg is
currently dead there because of the OIDC audience defect the
Action-Completion Fan-Out requirement now cross-references (the push that
would trigger it never reaches the broadcast handler). "Three convergent
rules" describes the intended/local-dev shape, not deployed reality today;
see the R1 correction below.

This backstop is not merely a code detail this capability leans on — it is
itself specced, as `hex-board-view`'s "Realtime Refetch Rules While the Board
Is Open" requirement (self-scheduled refetch, refetch-on-completion +
refetch-on-reconnect, and the scan-tightened poll). That cross-capability
requirement is the anchor that lets this capability's "Delivery Is Best-Effort,
Not Guaranteed" requirement push the reconciliation obligation onto the caller
without leaving a dangling correctness end: the obligation "callers MUST
implement an independent reconciliation path" is discharged there, not just in
the hook.

**D3 — Query-param token for the stream, header for everything else.**
`EventSource` cannot set an `Authorization` header, so the stream route's auth
middleware (`FirebaseJWTFromQueryParam`) accepts the Firebase ID token from the
`token` query parameter, falling back from the standard header. The observable
requirement is "the endpoint accepts a token via the `token` query param"; the
`EventSource` limitation is the rationale, and belongs here, not inside the
requirement text.

**D4 — Non-fatal drops on the push bridge.** `handleActionCompleted` returns
success (no error, so no Pub/Sub redelivery) on both a missing `channelId`
attribute and an undecodable envelope, logging and discarding. Redelivering
either could never succeed, and D1 means a discard self-heals. Both drop paths
are observable and belong in the spec as scenarios.

## Risks / Trade-offs

**R1 — Multi-instance fan-out gap, and today, total fan-out failure in
deployed environments.** `cloudrun.tf` sets `max_instance_count = 10`,
`min_instance_count = 0`, no session affinity. A client's stream and the
push that should notify it can land on different instances; that event is
silently missed. Mitigated to a latency cost (not a correctness bug) by D1
+ the D2 poll: worst case, the board is stale until the next 5–20s poll
tick. Accepted for the current slice. If realtime latency guarantees ever
tighten (e.g. sub-second combat feedback), this needs a shared fan-out layer
(Pub/Sub fan-out to every instance, or a Redis/broker relay), and the poll
cadence assumption must be revisited.

In addition to that multi-instance miss, the push leg is currently
**entirely dead** in every deployed (non-local) environment due to the OIDC
audience mismatch documented in `request-authorization`'s "OIDC Gate on
Push Routes" (`backend/middlewares/oidc.go`'s hardcoded
`pushAudience = "flywheel-backend"` vs. the `"hexaverse-backend"` audience
`infra/terraform/pubsub.tf` and `scheduler.tf` actually sign) — not an
occasional miss, a 100% rejection of every push, including the SSE
broadcast push. This is now baselined directly on the Action-Completion
Fan-Out requirement's defect scenario, not left as an aside here. Until
that constant is fixed (tracked as a `request-authorization` implementation
task, not this change's), deployed-environment realtime convergence is
carried entirely by the ETA self-schedule and poll legs of D2, not SSE —
correctness is unaffected (D1 + the poll backstop still hold), but the
"multi-instance miss is the residual gap" framing this risk previously led
with understated how much of D2 is actually load-bearing right now.

A second, independent reason the poll must remain indefinite rather than
just bridging brief gaps: `EventSource` does not auto-retry after a
non-2xx response, unlike a transient network drop. Once the query-param
token captured at connect time expires (D3; Firebase ID tokens default to
~1 hour), the stream goes permanently silent for the rest of that
component's mount, with no visible client error — distinct from the
transient-drop-and-reconnect case `hex-board-view`'s spec already covers.
Not a correctness gap today for the same reason: only the token-independent
poll keeps the board converging after that point.

**R2 — Unbounded per-instance client map.** Clients accumulate in memory with
no cap; a connection leak or a scale event that never sheds a hot instance
grows the map. Low risk at current scale; noted for capacity review. The
same absence of a cap also means no per-account concurrent-connection limit
or connection-rate limit exists — the `/v1/channels` route group is created
off `v1` directly, not off the `authorized` group, so it does not inherit
the general 600/min DoS safety net either (`router.go`). Flagged by the
security panel review as a MAJOR resource-exhaustion risk (an authenticated
account could open unbounded concurrent streams). **Revised this round:**
the *absence of the cap* is now baselined as a spec requirement
(`Stream Route Is Outside the Rate-Limited, Corp-Resolved Group`, with a
defect scenario) — documenting the gap is in scope for a documentation-only
retrofit. The *control itself* (a concurrent-connection cap / connection-rate
limit) is not — still tracked at Q2.

**R3 — Stream token travels in the URL.** D3's query-param token
(`?token=<firebase-id-token>`) is the only viable auth path for
`EventSource`, but it puts a bearer credential in the request URL, which
platform request logging can capture verbatim and which persists in browser
history. `router.go` only enables verbose request logging locally
(`gin.Logger()` is dev-only), but Cloud Run's own platform access logging
records full request URLs including query strings in production, so a
captured log line is a replayable credential for that token's validity
window. Flagged by the security panel review as a MAJOR credential-exposure
risk. **Revised this round:** the defect itself is now a scenario on the
`Per-Channel Event Stream` requirement (same "document, don't invent the
fix" treatment as R2 above). The *control* (log redaction or a short-lived
stream ticket) is not adopted — still tracked at Q2.

## Migration Plan

None — retrofit of running code. On archive, the delta becomes
`openspec/specs/realtime-sse/spec.md` (a `## Purpose` is added at archive time,
consistent with sibling retrofit changes).

## Open Questions

**Q1 — Subscribe-side channel authorization.** The stream route's only guards
are Firebase JWT verification and UID→account resolution; there is no check
that the authenticated account owns the `channelId` it subscribes to
(`handler.go:29` names this "the caller's responsibility to enforce in
middleware before reaching this handler," and no such middleware is wired,
and the route isn't even in the `authorized` group that resolves corp
context — `router.go:143`, so there is no corp to authorize against without
first adding that resolution). Any authenticated account may today subscribe
to any channel — including another corporation's system or actor scope — and
receive that channel's `ActionCompleted` payload, which per the D1 correction
above names the actor, action type, scope, and outcome, not merely a timing
ping. This is the same shape of gap `action-dispatch` records as its "No
Caller-Identity Binding on Action Endpoints" requirement, and this change now
specs it the same way: `No Channel-Ownership Binding on Subscribe`, a
first-class ADDED requirement documenting current, observable behavior with a
scenario — not prose in a non-standard `## Notes` section.

**Disputed severity, recorded not silently resolved — re-affirmed after a
second security-panel pass.** The security panel review rated this a
BLOCKER and, in its most recent pass, proposed a `Channel Subscribe
Authorization` requirement that *mandates* enforcement (reject non-owners
with 404 before the `connected` event) rather than only documenting the
defect — reasoning that the payload is real competitive intelligence (an
IDOR against the fog-of-war boundary the `observation` capability exists to
hold), not cosmetic metadata, and that an exploitable IDOR "must not rest on
an uncheckable follow-up." That reasoning is accepted (see the D1
correction) and the underlying risk is real; it is not downgraded here.
What remains disputed is applying the *mandate* in *this* change: this
artifact is a documentation-only retrofit of already-running code (the
posture every other panelist — architect, reliability, dba, ux — assessed it
against, and the same posture every sibling retrofit in this repo uses for
its own confirmed defects — `action-dispatch`'s "No Caller-Identity Binding,"
`request-authorization`'s OIDC-audience and rate-limit defects), and
specifying a `SHALL reject` for behavior the code does not do today would
misstate current behavior as current behavior — the one failure mode a
retrofit cannot afford, symmetrically with reliability's BLOCKER on the
Action-Completion Fan-Out requirement above.

**Correcting one factual premise of the BLOCKER, not the risk rating:** the
security review's remediation-tracking objection stated the follow-up
change "does not exist in `openspec/changes/`." That is no longer (and,
on inspection, was not at review time) accurate at the *documentation*
layer: `add-request-authorization-spec` already exists as a proposed
change and its own `design.md` Open Questions already cross-reference this
exact gap ("Channel subscribe-side authorization... owned by the
`realtime-sse` capability... cross-referenced here because it is the same
class of gap"). What does *not* yet exist is an *enforcement* change — the
actual fix (e.g. `enforce-channel-and-action-ownership`) is proposed by
neither `add-request-authorization-spec` nor this change; both are
documentation-only baselines by design, and `request-authorization`'s own
"A3" open question defers the sibling fleet/action ownership-check gap to
Travis the same way this one is deferred here. So: the *documentation*
cross-link the security review asked for already existed; the *enforcement*
change it actually wants still does not, and creating one is outside the
scope of a spec-revision pass on an already-scoped documentation-only
change — it is a decision (own-id vs. sensor-coverage audience rule, 404 vs.
403, whether it folds into the same change as the fleet/action ownership
gap) that needs Travis's sign-off, not a unilateral addition here. `tasks.md`
1.3 is updated to point at the concrete existing cross-reference and name
the still-missing enforcement change explicitly, so this can't quietly
resolve to "already handled."

**Q2 — Security-hardening controls not adopted here.** The security panel
review also proposed concrete controls this change does not add, for the
same "documents as-built, doesn't mandate unbuilt controls" reason as Q1:
(a) redacting the `token` query parameter from request logging or replacing
it with a short-lived stream ticket (see R3 — the *defect* is now
documented as a spec scenario; the *redaction/ticket* is not); (b) a
per-account concurrent-connection cap and connection-rate limit, 429 on
excess (see R2 — the *absence of a cap* is now a spec requirement; the *cap
itself* is not); (c) a bounded maximum server-side connection lifetime with
forced reconnect (not documented or adopted — no current behavior to
baseline, since the code has no lifetime bound beyond the platform's
900-second timeout already specced). All three describe *controls to add*,
not *behavior to document*. Tracked here as candidate scope for the same
follow-up hardening change as Q1, with the security review's concrete
numbers (N=5 concurrent, M=30/min, 30 min max lifetime) as a starting
proposal, not yet a decision.

**Q3 — No observability into actual fan-out delivery/miss rate.** Neither
R1's multi-instance miss, R1's now-documented deployed-environment
OIDC-audience total failure, nor a slow-consumer drop are currently
observable via any counter or gauge — only inferable from code review or a
player-visible staleness complaint. Flagged by the reliability panel review:
a minimal signal (e.g. a log line or counter for "broadcast attempted, zero
clients matched" at `BroadcastToChannel`, and/or a per-instance
connected-client gauge) would let R1's "revisit if latency guarantees
tighten" trigger be checked against real data instead of theory, and would
have made the audience-mismatch defect observable in production logs rather
than requiring cross-spec review to find it (as this revision's own process
just demonstrated). Tracked as candidate scope for the same follow-up change
as Q1/Q2, not adopted here — it would require a code change, out of scope
for a documentation-only retrofit.
