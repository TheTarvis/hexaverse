## Why

`backend/sse/` is the transport `action-dispatch`'s "Completion Event
Fan-Out" requirement hands off to — that requirement documents the emit
side (`ActionCompleted` published to a scope-named channel) but nothing in
the existing baseline documents the delivery side: the per-channel stream
endpoint, the broadcast manager, and the push-delivery bridge that turns a
Pub/Sub message into an SSE event. This closes that gap from the running
code.

## What Changes

- Add a new `realtime-sse` capability documenting current, as-built
  behavior: the `GET /v1/channels/:channelId/stream` endpoint (including its
  30-second heartbeat and the platform's 900-second request-timeout bound),
  per-channel broadcast (with its slow-consumer drop behavior), the
  best-effort/per-instance nature of delivery, and the
  `POST /v1/push/sse-action` fan-out bridge (including both its non-fatal
  drop paths: missing `channelId` and an undecodable envelope).
- Document the subscribe-side channel-ownership gap as a first-class ADDED
  requirement (`No Channel-Ownership Binding on Subscribe`) — current,
  observable behavior, not an endorsement — mirroring how `action-dispatch`
  specs its own "No Caller-Identity Binding" gap. Not resolved here; see
  `design.md` Open Question Q1 for the decision and the disputed severity
  between panel reviewers (re-affirmed, not silently downgraded, after a
  second security-panel pass — see below).
- Following specialist-panel review, add four more current-behavior
  defect scenarios/requirements in the same "document, don't invent the
  fix" spirit: the stream token traveling in the request URL/logs/browser
  history (on `Per-Channel Event Stream`); the stream route sitting outside
  the rate-limited, corp-resolved route group with no per-account
  connection cap (`Stream Route Is Outside the Rate-Limited, Corp-Resolved
  Group`, new); the `/v1/push/sse-action` route currently rejecting 100% of
  deliveries in any deployed environment due to a confirmed OIDC audience
  mismatch documented by the sibling `request-authorization` baseline
  (cross-referenced on `Action-Completion Fan-Out`, not re-derived here);
  and Pub/Sub's at-least-once redelivery producing a harmless duplicate
  broadcast (also on `Action-Completion Fan-Out`). `design.md` records one
  disputed security-panel finding (the BLOCKER's proposed enforcement
  requirement is not adopted — see Open Question Q1) and adds Q3
  (no delivery/miss observability, deferred to the same follow-up change as
  Q1/Q2).
- Out of scope: `BroadcastToAccount`, `BroadcastToAdmins`, and
  `GetClientCount` in `manager.go` are present but unwired (no route, no
  caller outside tests) — reserved surface, not specced as requirements
  here.
- Out of scope: security-hardening controls the running code doesn't have
  today (stream-token log redaction, per-account connection/rate limits, a
  bounded connection lifetime) — raised in panel review as real gaps, but
  they describe controls to build, not behavior to document; tracked in
  `design.md` Open Question Q2 for a follow-up change.
- No code changes — documentation-only retrofit baseline.

## Impact

- Affected specs: `realtime-sse` (new)
- Affected code: `backend/sse/` (read-only; no changes)
