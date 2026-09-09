## Purpose

Transport-level retry policy for the frontend's single shared `QueryClient`
(`frontend/lib/query-client.ts`): the one rule that decides, for every
mutation issued from anywhere in the app, whether a failed request is worth
resending automatically — distinguishing a deterministic client rejection (a
`4xx`, where the same payload will be refused again, including statuses that
look transient like `408`/`429`) and a `5xx` server failure (excluded from
automatic resend today and unchanged by this capability) from a failure that
carries no response status at all (a lost connection, DNS failure, abort, or
a response that could not be read — still worth exactly one automatic
resend). This capability owns that single shared mutation-retry decision and
nothing else; it does not own query (read) retry policy, which is unaffected.

It does **not** own per-surface double-submit guarding — the synchronous,
commit-time discipline that stops a user's own double-click or
double-Enter from minting two requests in the first place, together with
the operation-key idempotency that lets a legitimate transport-level retry
dedupe once it reaches the server. Those stay with the capabilities that
own the controls issuing them (`docked-fleet-actions`, `system-space-view`).
The two concerns compose, and a future reader should not confuse them: this
capability decides whether a retry is ever issued; the per-surface guards
decide what a retry — or a double activation — is allowed to do once it
reaches the wire.

## ADDED Requirements

### Requirement: Mutation Retry Never Resends a Deterministic Client Rejection
The shared client-side query client's mutation retry policy SHALL NOT
automatically resend a mutation request that fails with any `4xx` response
status, including statuses that may look transient (`408`, `429`): a `4xx`
is a deterministic refusal of the submitted payload, and for a mutation that
carries no per-attempt operation key, an invisible automatic resend is worse
than a refusal the player can see and re-issue deliberately. The shared
client-side query client SHALL NOT automatically resend a mutation request
that fails with any `5xx` response status, unchanged from current
behavior. A single re-issue of a `401`ed request after the caller's
credential has been force-refreshed is a credential retry, not an
automatic retry of a refused payload, and is out of this requirement's
scope. This requirement governs mutation retry only; query (read) retry
policy is a separate, unaffected concern and is unchanged by this
requirement. This policy is the app's only mutation retry policy: no
mutation call site SHALL override it to resend a failure carrying a `4xx`
or `5xx` status.

#### Scenario: A 409 conflict is not resent
- **WHEN** a mutation request fails with a `409` response
- **THEN** no automatic resend is issued, and the mutation reports failure
  after that one attempt

#### Scenario: A 5xx failure is not resent
- **WHEN** a mutation request fails with a `5xx` response
- **THEN** no automatic resend is issued, and the mutation reports failure
  after that one attempt

#### Scenario: 401 and 403 failures are not resent
- **WHEN** a mutation request fails with a `401` or `403` response
- **THEN** no automatic resend is issued
- **AND** any re-issue performed by the API client after force-refreshing
  the credential is not an automatic retry for this purpose

#### Scenario: A 408 request timeout is not resent
- **WHEN** a mutation request fails with a `408` response
- **THEN** no automatic resend is issued, even though the failure may be
  transient

#### Scenario: A 4xx failure other than 401, 403, 408, or 409 is not resent
- **WHEN** a mutation request fails with a `4xx` response other than `401`,
  `403`, `408`, or `409` (for example `400`, `404`, `422`, or `429`)
- **THEN** no automatic resend is issued

### Requirement: A Transport Failure Without A Response Status Is Still Resent
A mutation request whose failure carries no HTTP response status — the error
surfaced to the retry policy exposes no response status, whether because no
response was ever received (a lost connection, DNS failure, or an aborted
request, including the API client's own request timeout), because a response
arrived but could not be read or parsed, or because the failure surfaced as a
thrown value that is not an `Error` at all — is not a refusal of the
submitted payload. That list of causes is illustrative, not exhaustive: this
class is defined by the observable absence of a response status on the error
reaching the retry policy, never by the cause. The API client's own request
timeout is a member of this class and SHALL NOT be reclassified as a `408`.
The shared client-side query client SHALL automatically resend such a
mutation request exactly once, carrying the identical request payload,
including whatever operation key the issuing surface minted for that attempt
(owned by `docked-fleet-actions`).

The observable absence of a response status governs: where this requirement
and the `4xx`/`5xx` rule could be read as competing — a response whose status
line arrived but whose body could not be parsed, for example — the failure is
classified by what the error exposes, so a failure carrying no response status
falls under this requirement and the `4xx`/`5xx` rule applies only to a
failure that carries one.

The absence of a response status means no response was read; it does NOT mean
the request failed to reach the server or failed to take effect. This resend
is therefore an at-least-once delivery of the mutation, and its safety rests
on server-side duplicate handling owned by other capabilities — a per-attempt
operation key on the surfaces that mint one, the action spine's single-slot
claim on the command verbs, or an equivalent uniqueness anchor. On a surface
that mints no operation key the resend is at-least-once and nothing in this
capability makes it safe; making those surfaces idempotent is out of this
capability's scope.

#### Scenario: A transport failure with no response status is still resent exactly once
- **WHEN** a mutation request fails without any response status (no
  response was ever received)
- **THEN** exactly one automatic resend is issued, carrying the identical
  request payload

#### Scenario: A client-side request timeout is a status-less failure, not a 408
- **WHEN** a mutation request is aborted by the API client's own request
  timeout, producing a failure that carries no response status
- **THEN** the failure is treated as a transport failure and exactly one
  automatic resend is issued — the `4xx` rule does not apply, because the
  failure carries no response status

#### Scenario: A failure carrying no status is classified by that absence, not by its cause
- **WHEN** a mutation request fails with an error that exposes no response
  status even though a response was received — for example a response body
  that could not be read or parsed — or with a thrown value that is not an
  `Error` at all
- **THEN** exactly one automatic resend is issued, because the failure
  carries no response status
- **AND** no cause-specific test (such as the error's type or name) decides
  the outcome

### Requirement: An Automatic Resend Is Recorded
The one automatic resend this policy still issues is invisible to the player
and invisible in the UI, and an unrecorded resend is indistinguishable from a
second user attempt in a server-side request log — the misreading this
capability exists to prevent. When the mutation retry policy authorizes an
automatic resend, the client SHALL record that fact on the warning channel,
identifying it as an automatic transport-level resend, so a doubled
server-side request is attributable to the retry policy rather than to the
player. The record SHALL be written only when a resend is authorized, so the
number of records equals the number of automatic resends.

#### Scenario: An automatic resend records that it happened
- **WHEN** the mutation retry policy authorizes an automatic resend of a
  status-less failure
- **THEN** a client-side warning is recorded identifying it as an automatic
  transport-level resend

#### Scenario: A refused mutation records nothing
- **WHEN** a mutation fails with a `4xx` or `5xx` response and no automatic
  resend is authorized
- **THEN** no automatic-resend warning is recorded

#### Scenario: An exhausted status-less failure records nothing
- **WHEN** a status-less mutation failure arrives after the one automatic
  resend has already been issued, so no further resend is authorized
- **THEN** no additional automatic-resend warning is recorded
