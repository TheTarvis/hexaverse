# realtime-sse Specification

## Purpose
TBD - created by archiving change add-realtime-sse-spec. Update Purpose after archive.
## Requirements
### Requirement: Per-Channel Event Stream
The system SHALL serve `GET /v1/channels/:channelId/stream` as a
Server-Sent Events stream for an authenticated caller (Firebase identity
verified from either the `Authorization` header or the `token` query
parameter), sending an initial `connected` event, then relaying every event
subsequently broadcast to that channel id for the lifetime of the
connection or until the platform's 900-second request timeout closes it,
whichever comes first, with a 30-second heartbeat comment to keep the
connection alive. This route is registered on a group mounted directly on
`/v1` (`router.go`), not the `authorized` group every other route runs
through — see `Stream Route Is Outside the Rate-Limited, Corp-Resolved
Group` for what that omits.

**Current, observable defect — not an endorsement:** the stream route
accepts the Firebase ID token via the `token` query parameter (the only
viable auth path for `EventSource`, which cannot set a request header —
see design.md D3), so the token appears in the request URL. Platform
access logging (Cloud Run) records full URLs including query strings, and
the token also persists in browser history, so a captured log line or
history entry is a replayable bearer credential for the remainder of the
token's validity window. No redaction or short-lived-ticket substitution
is wired today (see design.md R3 and Open Question Q2).

#### Scenario: A connection opens with a connected event
- **WHEN** an authenticated caller opens
  `GET /v1/channels/:channelId/stream`
- **THEN** the stream immediately sends a `connected` event naming that
  channel id, before any other event

#### Scenario: A broadcast reaches a subscribed client
- **WHEN** an event is broadcast to channel `C` while a client is streaming
  channel `C`
- **THEN** that client receives the event over its open connection

#### Scenario: Cross-channel isolation
- **WHEN** an event is broadcast to channel `C`
- **THEN** a client streaming a different channel `D` does not receive it

#### Scenario: Disconnection stops relaying
- **WHEN** the client's connection context is done (disconnect, navigation
  away, timeout)
- **THEN** the server stops the stream loop and removes the client from the
  broadcast manager

#### Scenario: Missing or invalid token is rejected
- **WHEN** a stream request carries no valid Firebase token (neither the
  `Authorization` header nor the `token` query parameter)
- **THEN** the connection is rejected before the SSE stream begins

#### Scenario: A verified token with no backing account is rejected
- **WHEN** a caller presents a valid Firebase token whose UID resolves to no
  account record
- **THEN** the stream is rejected with 401 before the connected event, even
  though the token itself verified

#### Scenario: An idle connection is kept alive by a heartbeat
- **WHEN** a stream has been open for a 30-second heartbeat interval
  (measured from connection open, on a fixed cadence not reset by event
  delivery)
- **THEN** the server sends a heartbeat comment (not a named event) to keep
  the connection alive

#### Scenario: A stream is terminated at the platform's request-timeout bound
- **WHEN** a `GET /v1/channels/:channelId/stream` connection has been open
  for 900 seconds
- **THEN** the platform closes the connection independent of heartbeat or
  broadcast activity, and the client is expected to reconnect (which, per
  the frontend's reconnect rule, triggers a resync refetch)

#### Scenario: The stream token is exposed in request URLs (defect)
- **WHEN** a client opens
  `GET /v1/channels/:channelId/stream?token=<firebase-id-token>` in a
  deployed environment
- **THEN** the full URL, including the token, is recorded by platform
  access logging and by browser history, and any party able to read that
  log or history entry can replay the token as an authenticated caller
  until it expires

### Requirement: Stream Route Is Outside the Rate-Limited, Corp-Resolved Group
The system SHALL serve `GET /v1/channels/:channelId/stream` from a route
group mounted directly on `/v1` (`sseChannel := v1.Group("/channels/:channelId")`,
`router.go`), outside the `authorized` group — so the stream route inherits
neither the general 600 requests/minute/IP rate limit (`request-authorization`'s
"Fixed-Window Rate Limiting, Two Tiers") nor the corporation-resolution seam
(`ResolveCorporation` / `common.ActorCorp`) that every fogged read endpoint
runs through. No per-account concurrent-connection cap and no
connection-rate limit are enforced on this route today. (Current, observable
behavior — the enabling condition for both the subscribe-side authorization
gap this capability's "No Channel-Ownership Binding on Subscribe"
requirement documents and the resource-exhaustion risk below. Not an
endorsement — see design.md R2 and Open Question Q2.)

#### Scenario: An account opens unbounded concurrent streams without limit (defect)
- **WHEN** a single authenticated account opens many concurrent
  `GET /v1/channels/:channelId/stream` connections
- **THEN** each is accepted and retained in the per-instance client map with
  no cap and no rate-limit rejection, so the account can grow an instance's
  in-memory client map and goroutine count without bound until the instance
  sheds or fails

### Requirement: Delivery Is Best-Effort, Not Guaranteed
The system SHALL treat SSE delivery as a latency optimization, not a
delivery guarantee: an event broadcast via the channel manager reaches only
clients whose connection is currently held by the same backend instance
that received the triggering Pub/Sub push. Callers depending on this
capability for correctness (not just latency) MUST implement an
independent reconciliation path (poll and/or refetch-on-reconnect); the
delivered payload is a nudge to refetch, not the resolved game state
itself.

#### Scenario: An event is not delivered to a client connected on a different instance
- **WHEN** an `ActionCompleted` push is routed to backend instance A, and a
  client subscribed to that channel is connected to instance B
- **THEN** instance B's broadcast manager never receives or broadcasts that
  event, and the client's own connection remains open and reports no error

### Requirement: Slow-Consumer Events Are Dropped, Not Blocking
The system SHALL, when a client's per-connection event buffer (a 100-event
capacity channel) is full at broadcast time, drop the event for that client
(logging a warning that names the client id and event type) rather than
blocking the broadcast or the delivery to any other client on the same
channel.

#### Scenario: A full buffer drops one client's event without affecting others
- **WHEN** one client's event buffer is full at broadcast time and other
  clients on the same channel have room
- **THEN** the full client's event is dropped and logged, while the other
  clients on that channel still receive the event

### Requirement: Action-Completion Fan-Out
The system SHALL serve `POST /v1/push/sse-action` (OIDC-verified push
delivery — see `request-authorization`'s "OIDC Gate on Push Routes") by
decoding the delivered `ActionCompleted` event envelope and broadcasting
its payload to the SSE channel named by the message's `channelId`
attribute, dropping (logging a warning, not erroring) any message that
carries no `channelId`.

**Current, observable defect — not an endorsement, cross-referencing
`request-authorization`'s "OIDC Gate on Push Routes":** the OIDC
middleware's hardcoded audience (`"flywheel-backend"`) does not match the
audience (`"hexaverse-backend"`) every Terraform-provisioned push
subscription actually signs. In any deployed (non-local) environment, this
route currently rejects 100% of Pub/Sub push deliveries with `401` before
this handler ever runs — the fan-out described below is inert until that
constant is corrected. Locally (OIDC skipped) and in the emulator, the
described behavior is accurate today.

#### Scenario: A completion event reaches its scope's channel
- **WHEN** a push delivers an `ActionCompleted` envelope with
  `channelId = "system-42"`
- **THEN** the payload is broadcast to every client currently streaming
  channel `system-42`, delivered as an SSE event named `action.completed`
  (the string value of the `common.ActionCompleted` constant) whose `data`
  is the envelope payload

#### Scenario: In a deployed environment, the push route is currently unreachable (defect)
- **WHEN** Pub/Sub delivers a push to `POST /v1/push/sse-action` in a
  deployed (non-local) environment
- **THEN** OIDC verification currently rejects it with `401` before this
  handler runs, so no broadcast occurs, regardless of the message's
  `channelId` or decodability — deployed-environment SSE delivery is
  entirely dependent on `request-authorization`'s audience defect being
  fixed

#### Scenario: Missing channelId is dropped, not fatal
- **WHEN** a push arrives with no `channelId` attribute
- **THEN** it is logged and discarded, and the endpoint still reports
  success (no Pub/Sub redelivery is triggered)

#### Scenario: An undecodable envelope is dropped, not fatal
- **WHEN** a push delivers a message whose data cannot be unmarshaled as an
  `ActionCompleted` envelope (malformed JSON)
- **THEN** it is logged with the message id and discarded, and the endpoint
  still reports success (no Pub/Sub redelivery is triggered)

#### Scenario: A redelivered push broadcasts a second time, harmlessly
- **WHEN** Pub/Sub redelivers the same `ActionCompleted` message
  (at-least-once delivery — e.g. an ack-timeout race) after it was already
  successfully broadcast once
- **THEN** the handler broadcasts the payload again to the channel's
  current clients rather than detecting or suppressing the duplicate — per
  D1, this is a harmless extra refetch trigger, not a correctness issue,
  because clients re-derive state from a refetch rather than trusting the
  payload as truth

### Requirement: No Channel-Ownership Binding on Subscribe
The system SHALL, for `GET /v1/channels/:channelId/stream`, accept any
`channelId` from any authenticated caller, verifying only Firebase identity
(and resolving UID to account) without verifying that the caller's account
or corporation owns or is scoped to that channel. A caller subscribed to a
channel it does not own receives that channel's completion event —
including the action id, action type, actor id, scope, outcome, and eta
carried in the `ActionCompleted` payload (`backend/action/service.go`,
`publishCompleted`) — not merely connection timing. (Suspected
authorization defect — the handler's own comment names subscribe-side
authorization as unenforced middleware-that-does-not-exist; specced here as
current, observable behavior, not an endorsement. Whether channel-ownership
enforcement is added is tracked in design.md Open Question Q1.)

#### Scenario: Any authenticated caller can subscribe to another scope's channel
- **WHEN** an authenticated account opens
  `GET /v1/channels/:channelId/stream` for a channel scoped to a system or
  actor it does not own
- **THEN** the connection is accepted with no check that the caller owns
  the channel's scope, and whenever an `ActionCompleted` broadcast occurs
  for that channel the caller receives its payload (actor, action type,
  scope, outcome) — in local/emulator today, and in deployed environments
  once the OIDC audience defect on `Action-Completion Fan-Out` is fixed
  (deployed fan-out is currently inert per that requirement)

