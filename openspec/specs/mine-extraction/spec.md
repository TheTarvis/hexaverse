# mine-extraction Specification

## Purpose
TBD - created by archiving change add-mine-extraction. Update Purpose after archive.
## Requirements
### Requirement: Mine Command Requires Fleet Ownership
The system SHALL commit a mine run only for the fleet named by `:fleetId`
when the requesting account's living corporation (`common.ActorCorp`) owns
that fleet, rejecting a request from any other corporation — and any
unauthenticated request — before any other precondition check, creating no
action and applying no lode delta or cargo credit. Existence is hidden: a
foreign or unknown fleet returns `404 Not Found`, matching the fog
convention `fleet-movement`'s read endpoints already use for foreign fleets
outside coverage. This endpoint intentionally departs from
`fleet-movement`'s "Command Endpoints Enforce No Fleet Ownership" baseline
(orders/cancel/scan currently accept any authenticated caller): mine is a
brand-new endpoint, and claiming a foreign fleet's movement slot to mine is
a resource-griefing surface (locks the victim in place, forces cargo into
its hold, can consume a contested lode on its behalf), not a reversible
reposition, so this change closes the gap at the source instead of
inheriting it (see design.md Decision 10).

#### Scenario: An unauthenticated mine request is rejected
- **WHEN** `POST /v1/fleets/:fleetId/mine` is called with no valid Firebase
  bearer token
- **THEN** the response is `401 Unauthorized` and no action is created

#### Scenario: A foreign corporation cannot mine with another corp's fleet
- **WHEN** an authenticated account whose corporation does not own fleet F
  submits `POST /v1/fleets/F/mine`
- **THEN** the response is `404 Not Found`, no action is created, no lode
  delta is appended, and F's cargo and movement slot are unchanged

#### Scenario: The owning corporation may mine its own fleet
- **WHEN** the requesting account's living corporation owns fleet F and all
  other mine preconditions hold
- **THEN** the run commits normally

### Requirement: Mine Tonnage Is a Positive Finite Number
The system SHALL reject, with `400 Bad Request` and before any other
precondition (except the ownership check), a mine commit whose requested
`tons` is not a finite number strictly greater than zero — rejecting `0`,
negative, `NaN`, and infinite values — creating no action.

#### Scenario: Zero or negative tonnage is rejected
- **WHEN** a mine commit requests `tons` at or below zero
- **THEN** the response is `400 Bad Request` and no action is created

#### Scenario: A non-finite tonnage is rejected
- **WHEN** a mine commit requests a `NaN` or infinite `tons` value
- **THEN** the response is `400 Bad Request` and no action is created

### Requirement: Minimum Mine Run Size
The system SHALL reject a mine commit whose requested `tons` is below a
configured minimum run size (`MineParams.MinRunTons`), bounding the number
of ledger delta entries a feature can accumulate to
`⌈lodeTonnage / MinRunTons⌉` and capping read-time fold cost as a feature
is mined repeatedly over the game's life.

#### Scenario: A sub-minimum run is rejected
- **WHEN** a mine commit requests `tons` greater than zero but below
  `MineParams.MinRunTons`
- **THEN** the response is `400 Bad Request` and no action is created

### Requirement: Minimum Mine Run Size Is Bounded By Lode Tonnage
The system SHALL set `MineParams.MinRunTons`, per resource-bearing feature
type, to a value related to that feature type's typical starting lode
tonnage by a named, configured ceiling on total delta count
(`⌈startTons / MinRunTons⌉`), so that a fully-depleted lode's ledger never
grows past a bounded, known-in-advance number of entries regardless of how
many separate runs, over the game's life, target it — keeping both the
per-commit courtesy fold ("Already-Depleted Lode Rejected At Commit") and
the per-resolve transactional fold ("Resolve Clamps Yield to Reality") cost
safe for synchronous request handling. The bound is a ceiling, not a floor
quotient: every take-bearing delta below the final one removes at least
`MinRunTons`, but nothing requires a committed run's `tons` to fit within
the lode's remaining tonnage (only that it not exceed free hold), so the
last take-bearing delta against a lode can be a sub-`MinRunTons` dry-clamp
tail that drives remaining to exactly zero — accounting for the `+1` over
the plain quotient `startTons / MinRunTons`. The specific tonnage curve,
minimum run sizes, and ceiling value are tuning-time configuration (see
design.md Open Questions); this requirement constrains only that a ceiling
is named and honored, not its numeric value.

#### Scenario: A lode's maximum possible delta count is bounded
- **WHEN** a lode of any richness is mined down to zero across any number
  of separate runs, each at or above `MineParams.MinRunTons`
- **THEN** the total number of delta entries appended to that lode's ledger
  key never exceeds `⌈startTons / MinRunTons⌉`, and that count is within
  the configured ceiling for the feature's resource kind

### Requirement: Mine Commit Preconditions
The system SHALL accept a mine commit (`POST /v1/fleets/:fleetId/mine
{featureId, kind, tons}`) only when, at commit time: the requesting
corporation owns the fleet (see "Mine Command Requires Fleet Ownership");
the requested `tons` is a positive finite number at or above
`MineParams.MinRunTons` (see "Mine Tonnage Is a Positive Finite Number" and
"Minimum Mine Run Size"); the fleet's effective state is `docked` to the
named feature; the target feature's detail carries at least one resource
entry of the requested `kind`; the feature's best-known remaining tonnage
of that `kind` is not already at or below zero (see "Already-Depleted Lode Rejected At
Commit"); the fleet's derived mining rate is greater than zero; the
requested `tons` does not exceed the fleet's current free hold (derived
capacity minus current cargo); and the fleet's movement-channel action slot
(`activeActionId`) is free — rejecting the commit with the matching
sentinel error and creating no action when any precondition fails. No
prior scan of the feature is required to commit.

#### Scenario: Not docked to the feature is rejected
- **WHEN** a fleet whose effective state is not `docked` to the named
  feature (coasting, burning, or docked elsewhere) commits a mine run
- **THEN** the commit fails and no action is created

#### Scenario: An unknown resource kind is rejected
- **WHEN** the run names a `kind` the target feature's resources do not
  include
- **THEN** the commit fails and no action is created

#### Scenario: A request over free hold is rejected at commit
- **WHEN** the requested `tons` exceeds the fleet's current free hold
- **THEN** the commit fails and no action is created

#### Scenario: A busy movement slot is rejected
- **WHEN** the fleet already holds a running action on the movement
  channel (`activeActionId` claimed)
- **THEN** the commit fails with the action spine's active-action conflict

#### Scenario: A fleet with no mining capability is rejected
- **WHEN** a fleet whose derived mining rate is zero (a roster with no
  mining-capable ship) commits a mine run
- **THEN** the commit fails and no action is created — a zero rate would
  yield an undefined (`+Inf`) ETA that would permanently hold the movement
  slot

#### Scenario: No scan is required to commit
- **WHEN** a fleet docked to a feature it has never scanned commits a mine
  run for a resource kind that feature actually carries
- **THEN** the commit succeeds — prospecting by scanning first is
  advantageous, never required

### Requirement: Mine Commit Rejections Report a Distinguishable Reason
The system SHALL, for every commit-time rejection defined in this
capability (ownership, invalid or sub-minimum tonnage, not-docked to the
target, unknown resource kind, over-free-hold, no mining capability,
already-depleted lode, and busy movement slot), include a human-readable
reason in the response body that distinguishes it from every other
rejection in this list — following the `gin.H{"error": "<reason>"}`
convention already established in `backend/fleet/handler.go`'s
`RoutePreview`/`Scan`/`Order` handlers — so a caller can present the player
a specific, actionable message rather than a generic failure. A
busy-movement-slot rejection's reason SHALL further name which kind of
action currently holds the slot (burning, in lane transit, or already
mining), since mine sharing the movement channel with burn and lane travel
makes "busy" ambiguous between three materially different player
situations for the first time.

#### Scenario: Each commit rejection reason is distinguishable from the others
- **WHEN** any two different mine-commit preconditions fail on two separate
  requests (e.g. not-docked vs. unknown-kind)
- **THEN** the two responses' reason text differs, so a caller never has to
  guess which precondition failed from a shared generic message

#### Scenario: A busy-slot rejection names the occupying action kind
- **WHEN** a mine commit is rejected because the fleet's movement slot
  already holds a running burn, lane-transit, or mine action
- **THEN** the response's reason text names which of the three currently
  occupies the slot

### Requirement: Already-Depleted Lode Rejected At Commit
The system SHALL, at commit time, compute the feature's best-known
remaining tonnage of the requested `kind` as of the current world time (the
same ledger fold used at resolve, evaluated at the commit instant) and
reject the commit if that remaining tonnage is at or below zero, rather
than creating an action that can only resolve to a zero-tonnage outcome.
This is a courtesy fast-fail, not a reservation: a lode genuinely contested
by an in-flight, not-yet-resolved run may still legitimately deplete
further before this commit's own ETA (see "Optimistic Contested Lodes") —
only a lode already known-empty (zero, or — under the float drift the
resolve-time floor in "Resolve Clamps Yield to Reality" guards against —
below zero) at commit time is rejected up front, matching the `max(0, …)`
floor that requirement already applies at resolve.

#### Scenario: Committing against a fully depleted lode is rejected
- **WHEN** a mine commit names a `kind` whose folded remaining tonnage, as
  of the current world time, is already at or below zero
- **THEN** the commit fails with a validation error and no action is
  created, and no delta document is appended

#### Scenario: A lode with an in-flight contested run still commits
- **WHEN** a mine commit names a `kind` whose folded remaining tonnage as
  of now is still positive, even though another run's not-yet-resolved ETA
  may deplete it further
- **THEN** the commit succeeds, per "Optimistic Contested Lodes" — this
  requirement only blocks commits against a lode already at or below zero

### Requirement: Ledger Key Is System-And-Kind-Qualified, Channel Scope Is Per-System
The system SHALL key a mine run's depletion ledger by a
Firestore-document-id-safe join of the target feature's system id, its
feature id, and the run's resource kind (`${systemId}::${featureId}::
${kind}` — joined with `::`, never `/`, since Firestore document ids cannot
contain `/`), never by feature id alone (feature ids are assigned
per-system by the system-interior generator and are not unique across the
galaxy — every system with a belt has a feature literally named
`feat-belt-0`), never by system id and feature id alone without the kind
(a single feature may carry more than one resource kind — see "One
Resource Kind Per Run" — and folding two kinds' deltas into one ledger
would let extraction of one kind falsely deplete another's readable
remaining), and never by system id alone (two features in one system would
then share a ledger). The mine action's `scope` — the read-resolution
query key (`ResolveDue(systemId)`) and the SSE completion channel — SHALL
remain the containing `systemId` and SHALL NOT be set to the ledger key, so
a completed mine resolves on the same board read and broadcasts on the
same system channel as a burn or scan; the per-feature, per-kind
granularity lives only in the ledger key, decoupled from the action scope
(see the `action-dispatch` capability's "Ledger Key Decoupled From Channel
Scope").

#### Scenario: Identically-id'd features in different systems do not share a ledger
- **WHEN** two fleets each commit a mine run against a feature with the
  same feature id (e.g. `feat-belt-0`) but in two different systems
- **THEN** each run's delta is appended to, and its remaining tonnage is
  folded from, only that run's own system-and-kind-qualified ledger key —
  the other system's identically-id'd feature's ledger is neither read nor
  written

#### Scenario: Two features in one system keep separate ledgers
- **WHEN** two mine runs in one system target two different features
  (`feat-belt-0` and `feat-belt-1`)
- **THEN** each folds and appends to its own `${systemId}::${featureId}::
  ${kind}` ledger key, and depleting one does not reduce the other's
  remaining tonnage

#### Scenario: Two kinds on one feature deplete independently
- **WHEN** a feature carries both `metals` and `volatiles`, and a fleet
  mines `volatiles` from it
- **THEN** the folded remaining tonnage of `metals` on that same feature is
  unchanged, and a subsequent `metals` commit's already-depleted check and
  resolve-time clamp read only the `metals` ledger key, never the
  `volatiles` deltas

#### Scenario: A ledger key never contains a path separator
- **WHEN** a mine run's ledger key is constructed from a system id, a
  feature id, and a resource kind
- **THEN** the resulting key contains no `/` character, so it is a valid
  Firestore document id for the ledger's parent document

#### Scenario: A completed mine resolves and pushes on the system scope
- **WHEN** a mine run's ETA passes and the containing system's board is
  read or its channel is subscribed
- **THEN** the due mine is resolved by the system-scoped read
  (`ResolveDue(systemId)`) and its completion event is delivered on the
  system channel, the same as a burn or scan

### Requirement: ETA From Tonnage Target
The system SHALL, at commit, freeze `eta = commitTime + (tons ÷
fleetMineRate)`, where `fleetMineRate` is the sum of the fleet's roster's
per-ship mining rates (see `fleet-movement`'s derived mining rate), and
freeze `{featureId, kind, tons, rate, startTons}` into the action's params
so a later resolve is self-contained — where `startTons` is the target
lode's richness-derived starting tonnage, computed from the feature's
`resources[kind].richness` under the commit-time `MineParams` curve and
frozen so resolve neither re-reads the feature nor re-derives tonnage
against possibly-retuned params.

#### Scenario: ETA scales with target tonnage and fleet rate
- **WHEN** a run targeting 40 tons commits on a fleet whose derived mining
  rate is 10 tons/unit-time
- **THEN** the committed action's ETA is 4 unit-times after commit

### Requirement: Resolve Clamps Yield to Reality
The system SHALL, on resolve, compute the feature's remaining tonnage of
the run's `kind` at the action's frozen ETA as
`remainingAtEta = max(0, startTons + fold(deltas with effectAt <= eta))`
(each mining delta being a negative tonnage, so the fold reduces
remaining, and the result is floored at zero so a resolve can never treat
an over-depleted ledger as a surplus), take
`take = max(0, min(params.tons, remainingAtEta, freeHoldAtResolve))` (also
floored, so `take` can never go negative), and record which constraint (if
any) bound both in the resolved action's `outcome` text and as a
structured reason code (`clean` | `lodeDry` | `holdFull`) alongside it, so
clamp frequency is countable per reason without parsing `outcome` prose.
The three `outcome` text forms (full yield, lode-dry clamp, hold-full
clamp) SHALL be reliably distinguishable by a caller inspecting the string
(e.g. via a stable substring or prefix per reason code), not merely equal
in narrative intent, so a later UI can safely branch on which constraint
bound. The `holdFull` branch remains structurally unreachable in this
version, but for a different reason than when it was first specified:
`goods-sale` is now a second writer of `fleet.cargo` (a sale debits it
instantly, outside the action spine — see `goods-sale`'s "Instant, Not an
Action"), so mine is no longer the cargo field's only writer. What still
prevents a concurrent sale from mutating `freeHoldAtResolve` mid-run is
`fleet-movement`'s single-movement-state invariant: a mine run holds the
fleet `docked` to the mined feature for the run's whole duration, and
`goods-sale`'s "Sale Requires the Fleet Docked To the Buying Station"
rejects a sale unless the fleet is currently docked to a station — a fleet
cannot be simultaneously docked to a lode (mining) and docked to a station
(selling), so no sale can land between this run's commit and its resolve,
and `freeHoldAtResolve` therefore still always equals `freeHoldAtCommit`.
It stays specified (the reason code and clamp math cost nothing extra and
are exercised directly, not through a second writer) because a future verb
that can mutate cargo while a fleet is docked to a mined feature (e.g., a
transfer between two docked fleets, or a same-feature multi-run future)
will make it reachable, and resolve must already floor and report
correctly when it is.

#### Scenario: A clean run takes the full target
- **WHEN** neither the lode's remaining tonnage nor the fleet's free hold
  binds below the requested `tons`
- **THEN** the full requested tonnage is taken and credited, and the
  resolved action's reason code is `clean`

#### Scenario: A dry lode clamps to what remains
- **WHEN** the lode's remaining tonnage at the action's ETA is less than
  the requested `tons`
- **THEN** the take equals the remaining tonnage, the outcome records that
  the lode ran dry, and the resolved action's reason code is `lodeDry`

#### Scenario: A full hold clamps to free capacity
- **WHEN** the fleet's stored cargo at resolve leaves free hold below the
  requested `tons`
- **THEN** the take equals the free hold, the outcome records that the
  hold filled, and the resolved action's reason code is `holdFull`

#### Scenario: An already-exhausted lode resolves to a zero take, not a negative one
- **WHEN** a run resolves against a kind whose folded remaining at ETA
  would otherwise compute below zero (fully taken by earlier-ETA runs
  against the same ledger key)
- **THEN** `remainingAtEta` and `take` are both floored at zero, no delta
  is appended at all (never a positive, tonnage-restoring one, and never a
  zero-amount one — see "Exactly-Once Lode Delta"), and the fleet's cargo
  is not decremented

### Requirement: Exactly-Once Lode Delta
The system SHALL, in the same transaction that computes the clamped take,
append at most one negative-tonnage delta entry to the target feature's
system-and-kind-qualified ledger key (see "Ledger Key Is
System-And-Kind-Qualified, Channel Scope Is Per-System"), keyed by the
action's own id as the delta document id (per `action-dispatch`'s
exactly-once resolution contract): exactly one when the clamped `take` is
greater than zero, crediting that same tonnage onto the fleet's cargo pool
for the run's `kind` — never as a separately mutated "remaining" field on
the feature — and none when the clamped `take` is zero. A zero-take resolve
SHALL still flip the action to `done` with its honest `outcome` string and
structured reason code (`lodeDry` | `holdFull`, as applicable), release the
movement slot, and credit no cargo; it appends no delta document at all,
rather than a zero-amount one, so that only take-bearing runs consume a
ledger entry and the ledger's delta count per key stays bounded by
`⌈startTons / MinRunTons⌉` (see "Minimum Mine Run Size Is Bounded By Lode
Tonnage") rather than by the number of runs that ever targeted the lode.

#### Scenario: Concurrent resolve attempts append exactly one delta
- **WHEN** two resolve attempts race for the same take-bearing (`take > 0`)
  mine action
- **THEN** exactly one delta document exists under the feature's ledger
  afterward, and the fleet's cargo is credited exactly once

#### Scenario: A zero-take resolve appends no delta but still resolves done
- **WHEN** a mine run resolves with a clamped take of zero — either a
  contested lode already emptied by an earlier-ETA run against the same
  ledger key, or the hold full or the lode dry to exactly zero at ETA
- **THEN** no delta document is appended to the ledger key, the fleet's
  cargo is unchanged, and the action still resolves `done` with an honest
  `outcome` string and reason code (`lodeDry` or `holdFull`) and its
  movement slot released

### Requirement: One Resource Kind Per Run
The system SHALL require each mine run to target exactly one resource
`kind`, frozen at commit — extracting a second kind from a multi-resource
feature requires a second, separate run.

#### Scenario: A single run yields only its named kind
- **WHEN** a mine run against a feature carrying multiple resource kinds
  commits for `kind = metals`
- **THEN** the resolved delta and cargo credit are for `metals` only, never
  any other kind the feature carries

### Requirement: Optimistic Contested Lodes
The system SHALL apply no reservation at commit time when multiple runs
target the same feature and kind; concurrently committed runs against one
lode SHALL resolve independently, each folding the ledger as it stands at
its own ETA, so an earlier-ETA run's yield is unaffected by a later one,
and a later-ETA run clamps against whatever the earlier run(s) already
took.

#### Scenario: Two fleets contest one lode, earlier ETA resolves first
- **WHEN** two fleets each commit a mine run against the same feature and
  kind, with different ETAs
- **THEN** the earlier-ETA run resolves against the lode as it stood before
  either run, and the later-ETA run's resolve folds in the earlier run's
  already-applied delta, clamping its own take to whatever tonnage remains

### Requirement: Mine Ledger Depth Is Observable
The system SHALL record, on every mine commit and resolve, the folded
ledger key's current delta-entry count (or an equivalent countable signal)
in a form attributable to that ledger key (a log field or metric), so that
a key approaching a size that risks a slow or failing transactional fold
is detectable before the fold degrades or fails outright in production,
rather than discovered only when a popular lode's mine commits start
timing out. Mine pays the fold cost at both commit time ("Already-Depleted
Lode Rejected At Commit") and resolve time ("Resolve Clamps Yield to
Reality"), so both paths SHALL emit this signal.

#### Scenario: A commit or resolve logs its ledger key's depth
- **WHEN** a mine commit or resolve folds a feature's ledger key
- **THEN** the operation emits the resulting delta-entry count for that
  ledger key, attributable to that key, independent of whether the commit
  or resolve itself succeeds

### Requirement: Mine Command Endpoint
The system SHALL serve `POST /v1/fleets/:fleetId/mine {featureId, kind,
tons}`, committing the run through the action service on the fleet's
movement channel and returning the created action (including its frozen
ETA); cancellation and acknowledgement of a running mine action SHALL ride
`action-dispatch`'s existing generic cancel/acknowledge endpoints (mine
introduces no verb-specific cancel route, since a mine run has no motion
state of its own to settle on cancel).

#### Scenario: A committed mine run returns its action and ETA
- **WHEN** `POST /v1/fleets/:fleetId/mine` succeeds
- **THEN** the response includes the created action's id and its frozen
  ETA

#### Scenario: Cancelling a running mine run uses the generic endpoint
- **WHEN** a running mine action is cancelled via
  `POST /v1/actions/:actionId/cancel`
- **THEN** it is cancelled with no delta applied and no cargo credited
  (per `action-dispatch`'s cancel contract), and the fleet's movement slot
  is released

#### Scenario: A retried commit after a lost response fails closed
- **WHEN** a client's `POST /v1/fleets/:fleetId/mine` request succeeds
  server-side but the response is lost, and the client retries the
  identical request
- **THEN** the retry fails with the action spine's active-action conflict
  (the original commit already claimed the movement slot) rather than
  creating a second, competing mine action — callers SHALL treat this
  conflict as "already committed, re-fetch the fleet's active action," not
  as a failed mine attempt

#### Scenario: A rolled-back deploy leaves a running mine action cancellable, not lost
- **WHEN** this deploy is rolled back while a mine action is `running`, and
  it is left unresolved because the prior binary has no `mine` resolver
  registered
- **THEN** the action is skipped by resolution (not errored, per
  `action-dispatch`'s "unregistered resolver type is skipped, not fatal"
  behavior), the fleet's movement slot remains claimed, and
  `POST /v1/actions/:actionId/cancel` still releases the slot with no
  delta or cargo credit — the fleet is recoverable without data loss,
  never permanently stuck
