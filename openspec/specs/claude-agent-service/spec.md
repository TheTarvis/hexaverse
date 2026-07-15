# Claude Agent Service Specification

## Purpose
A Python/FastAPI service that runs a Claude-powered, tool-calling
conversational agent on the user's behalf: verifies the caller's Firebase
identity, streams the model's response over SSE, executes any tools Claude
invokes by calling the Go backend with the user's own token (never a
service-account credential), and loops until the turn ends or a hard
iteration cap is hit.

## Requirements

### Requirement: Firebase Token Authentication on Every Chat Request
The system SHALL require a `Bearer <Firebase ID token>` Authorization
header on `POST /chat`, verify it against Firebase, and reject the request
with `401` if the header is missing, malformed, or the token is expired,
invalid, or fails verification for any other reason — without ever
reaching Firebase verification for a request whose header isn't even
well-formed.

#### Scenario: Missing Authorization header is rejected
- **WHEN** `POST /chat` is called with no Authorization header
- **THEN** the response is `401`

#### Scenario: Non-Bearer header is rejected without a verification call
- **WHEN** `POST /chat` is called with an Authorization header that does
  not start with `Bearer `
- **THEN** the response is `401` and no Firebase token verification is
  attempted

#### Scenario: Expired token is rejected
- **WHEN** a syntactically valid but expired Firebase token is presented
- **THEN** the response is `401`

#### Scenario: Valid token populates the request context
- **WHEN** a valid Firebase token is presented
- **THEN** the request context carries the token's `uid` as `user_id`, its
  email claim (empty string if absent), the raw token itself, and its
  `admin` claim (false if absent) as `is_admin`

### Requirement: Per-User Rate Limiting on Chat
The system SHALL enforce a fixed-window, per-user (`user_id`-keyed) request
limit on `/chat`, running only after authentication succeeds (never
rate-limiting an unauthenticated request as if it were a valid user),
rejecting requests over the limit with `429` and a `Retry-After` header,
and SHALL allow this enforcement to be disabled entirely via
configuration (for tests/e2e).

#### Scenario: Requests under the limit succeed
- **WHEN** a user's request count within the current window is at or below
  the configured limit
- **THEN** the request proceeds

#### Scenario: Exceeding the limit is rejected with Retry-After
- **WHEN** a user exceeds the configured per-window request limit
- **THEN** the response is `429` with a `Retry-After` header

#### Scenario: Limits are independent per user
- **WHEN** two different users each make requests
- **THEN** one user's count toward the limit does not affect the other's

#### Scenario: The window resets after expiry
- **WHEN** a user's rate-limit window has elapsed
- **THEN** their next request is counted against a fresh window, not
  blocked by the expired one

### Requirement: Streaming Tool-Call Loop
The system SHALL, on a chat turn, stream Claude's text output as
`text_delta` events as they arrive, and, for each tool Claude invokes,
emit a `tool_use` marker, execute the tool, emit a `tool_result` marker,
append the tool's result to the conversation, and continue the loop —
stopping when Claude's response has no tool calls or reports
`stop_reason == "end_turn"`, or after a fixed maximum of 10 iterations,
whichever comes first. Every chat turn SHALL end with a `done` event
carrying the conversation id.

#### Scenario: A tool-free response ends after one iteration
- **WHEN** Claude's response contains no tool-use blocks
- **THEN** the loop stops after that iteration and a `done` event follows

#### Scenario: A tool call is executed and its result fed back
- **WHEN** Claude's response contains a tool-use block
- **THEN** a `tool_use` event is emitted, the tool executes, a
  `tool_result` event is emitted, and the tool's result is appended to the
  conversation before the next iteration

#### Scenario: The iteration cap stops a runaway loop
- **WHEN** ten iterations complete without Claude reaching `end_turn` or a
  tool-free response
- **THEN** the loop stops, yielding a message telling the user the turn's
  limit was reached, rather than looping indefinitely

#### Scenario: An upstream Claude API error ends the turn cleanly
- **WHEN** the Claude API call fails with an API error
- **THEN** an `error` event is yielded with a generic user-facing message
  and the loop stops without raising to the HTTP layer

### Requirement: Tool Execution Isolates Failures Per Tool
The system SHALL dispatch a tool call by name; an unknown tool name SHALL
return an `{"error": ...}` result (never raise); a known tool's domain
error (not-found, forbidden, or another backend API error) SHALL surface
its message as `{"error": message}`; and any other unhandled exception
from a tool handler SHALL be caught and converted to an `{"error": ...}`
result rather than propagating and aborting the chat turn.

#### Scenario: An unknown tool name yields a structured error, not a crash
- **WHEN** the model requests a tool name not present in the dispatcher
- **THEN** the result is `{"error": "Unknown tool: <name>"}`

#### Scenario: A backend 404 during a tool call surfaces as a message, not a stack trace
- **WHEN** a tool handler's backend call returns 404
- **THEN** the tool result is `{"error": "<not-found message>"}`, and the
  chat turn continues (the model sees the error and can respond to it)

#### Scenario: An unhandled exception in a tool handler does not crash the turn
- **WHEN** a tool handler raises an exception not covered by the known
  backend error types
- **THEN** the tool result is a structured `{"error": ...}` message and the
  agent loop continues

### Requirement: Token-Passthrough Backend Calls, No Service Account
The system SHALL make every call to the Go backend on behalf of a tool
using the requesting user's own Firebase token as the `Authorization`
bearer header — never a service-account or agent-owned credential — so the
backend's own auth/authorization enforcement is the only permission
boundary the agent's tool calls are subject to.

#### Scenario: A tool call to the backend carries the user's token
- **WHEN** a tool handler calls the backend API client
- **THEN** the outgoing request's Authorization header is the same
  Firebase token verified on the inbound `/chat` request

#### Scenario: A 401 from the backend is a typed, distinguishable error
- **WHEN** the backend rejects a tool's request with 401
- **THEN** the client raises an `UnauthorizedError` distinct from generic
  backend errors, so callers can special-case token expiry

#### Scenario: A 403 from the backend is a typed, distinguishable error
- **WHEN** the backend rejects a tool's request with 403
- **THEN** the client raises a `ForbiddenError`

#### Scenario: A 404 from the backend is a typed, distinguishable error
- **WHEN** the backend responds 404 to a tool's request
- **THEN** the client raises a `NotFoundError`

### Requirement: Conversation History Repair Before Reuse
The system SHALL, when conversation history is reloaded for a
conversation id, be able to repair a history whose last assistant message
contains `tool_use` blocks with no matching `tool_result` blocks in the
following message (an interrupted prior turn) by truncating the
orphaned trailing turn, so a resumed conversation is always a
valid message sequence Claude's API accepts.

#### Scenario: An orphaned tool_use tail is truncated
- **WHEN** repair is applied to a history whose last assistant message has
  `tool_use` blocks with no corresponding `tool_result` in the next
  message
- **THEN** that trailing assistant message (and anything after it) is
  dropped from the repaired history

#### Scenario: A valid, fully-resolved history is left unchanged
- **WHEN** repair is applied to a history whose every `tool_use` block has
  a matching `tool_result` in the following message
- **THEN** the history is returned unchanged

### Requirement: Thinking Blocks Stripped Before Persistence
The system SHALL strip `thinking` content blocks from assistant messages
before any conversation history is persisted, since they are not accepted
as input on a subsequent turn.

#### Scenario: A thinking block is removed before saving
- **WHEN** an assistant message containing a `thinking` block is prepared
  for persistence
- **THEN** the persisted message's content omits the `thinking` block,
  keeping any other content (text, tool_use) intact

### Requirement: Unauthenticated Health Endpoints
The system SHALL serve `GET /health` and `GET /` without authentication,
for liveness probing and service identification.

#### Scenario: Health check requires no auth
- **WHEN** `GET /health` is called with no Authorization header
- **THEN** the response is `200` with a status payload

## Notes for future maintainers

- Conversation history persistence (`_load_conversation_history` /
  `_save_conversation_history`) is a no-op by default — chats are
  single-turn unless a host app subclasses `Agent` and wires in storage.
  This baseline documents the shipped (no-op) behavior; multi-turn memory
  is not yet implemented in this codebase.
- The acknowledgment message (`_generate_acknowledgment`) is a best-effort
  UX nicety: any failure generating it is swallowed and no ack is sent, so
  its absence is never itself an error condition.
