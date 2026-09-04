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
outside coverage. This requirement predates `fleet-movement`'s own
ownership check and is the same rule, stated independently: at the time
mine shipped, the sibling movement-command endpoints
(orders/cancel/cut-drive/stop/jump) accepted any authenticated caller
regardless of ownership — a gap `fleet-movement`'s "Movement Command
Endpoints Enforce No Fleet Ownership" recorded as open — and mine closed
the gap at its own endpoint rather than inheriting it, because claiming a
foreign fleet's movement slot to mine is a resource-griefing surface (locks
the victim in place, forces cargo into its hold, can consume a contested
lode on its behalf), not a reversible reposition (see design.md Decision
10). `replace-observation-with-sightings` subsequently closes that sibling
gap too, under `fleet-movement`'s "Fleet Command Endpoints Are Restricted
to the Owning Corporation"; mine's own ownership check, stated here, is
unchanged by that later change.

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
named feature — a fleet merely parked at, near, or coincident with a body's
position, with its stored `attachedTo` unset or naming a different body, is
not docked to it (see "A fleet parked near a body but not attached to it is
rejected"); the submitted `featureId` has passed the validation defined in
"A Client-Supplied Feature Id Is Validated Before Resolution" (enforced
only after, never before, this ownership and docked-state ordering); the
resolved target's detail — the named feature
itself, or, for a belt member id, its parent belt feature (see "Belt
Member Targets Resolve Through Their Parent Belt Feature") — carries at
least one resource entry of the requested `kind`; the feature's best-known
remaining tonnage of that `kind` is not already at or below zero (see
"Already-Depleted Lode Rejected At Commit"); the fleet's derived mining
rate is greater than zero;
the requested `tons` does not exceed the fleet's current free hold (derived
capacity minus current cargo); and the fleet's movement-channel action slot
(`activeActionId`) is free — rejecting the commit with the matching
sentinel error and creating no action when any precondition fails. No prior
scan of the feature is required to commit.

#### Scenario: Not docked to the feature is rejected
- **WHEN** a fleet whose effective state is not `docked` to the named
  feature (coasting, burning, or docked elsewhere) commits a mine run
- **THEN** the commit fails and no action is created

#### Scenario: A fleet parked near a body but not attached to it is rejected
- **WHEN** a fleet's resolved position coincides with or lies near a body —
  for example, a fleet freshly arrived via a lane jump and parked near the
  destination gate, per `fleet-movement`'s "Jump Arrival Parks Near the
  Destination Gate, Unmasked" — but its stored `attachedTo` does not name
  that body
- **THEN** the commit fails with the same not-docked rejection as any other
  non-docked state; positional proximity or apparent co-location never
  substitutes for the stored attachment string

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
already-depleted lode, busy movement slot, and each
client-supplied-feature-id validation failure defined in "A
Client-Supplied Feature Id Is Validated Before Resolution"), include a
human-readable reason in the response body that distinguishes it from
every other rejection in this list — following the `gin.H{"error":
"<reason>"}` convention already established in `backend/fleet/handler.go`'s
`RoutePreview`/`Scan`/`Order` handlers — so a caller can present the player
a specific, actionable message rather than a generic failure. Every
rejection in this list SHALL surface as a 4xx response carrying that
reason in its body — never a bodiless 5xx, regardless of which check in
this capability fails. A busy-movement-slot rejection's reason SHALL
further name which kind of action currently holds the slot (burning, in
lane transit, or already mining), since mine sharing the movement channel
with burn and lane travel makes "busy" ambiguous between three materially
different player situations for the first time.

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
Firestore-document-id-safe join of the **resolved** target feature's
system id, its feature id, and the run's resource kind (`${systemId}::
${featureId}::${kind}` — joined with `::`, never `/`, since Firestore
document ids cannot contain `/`), never by feature id alone (feature ids
are assigned per-system by the system-interior generator and are not
unique across the galaxy — every system with a belt has a feature
literally named `feat-belt-0`), never by system id and feature id alone
without the kind (a single feature may carry more than one resource kind —
see "One Resource Kind Per Run" — and folding two kinds' deltas into one
ledger would let extraction of one kind falsely deplete another's readable
remaining), and never by system id alone (two features in one system would
then share a ledger). The mine action's `scope` — the read-resolution
query key (`ResolveDue(systemId)`) and the SSE completion channel — SHALL
remain the containing `systemId` and SHALL NOT be set to the ledger key, so
a completed mine resolves on the same system read and broadcasts on the
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
- **WHEN** a mine run's ETA passes and the containing system's interior is
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
bound. The `holdFull` branch remains structurally unreachable through a
concurrent *sale*: `goods-sale` is a second writer of `fleet.cargo` (a sale
debits it instantly, outside the action spine — see `goods-sale`'s
"Instant, Not an Action"), but `fleet-movement`'s single-movement-state
invariant still forbids a sale from landing mid-run — a mine run holds the
fleet `docked` to the mined feature for the run's whole duration, and
`goods-sale`'s "Sale Requires the Fleet Docked To the Buying Station"
rejects a sale unless the fleet is currently docked to a station, and a
fleet cannot be simultaneously docked to a lode and docked to a station.
**That invariant does not extend to station-keeping.** `hold` (see
`fleet-movement`'s "Station-Keeping Hold and Release Are Fleet Verbs")
requires only that the fleet's effective park mode be `orbit`, and, per
that same capability's "A fleet's attachment survives hold, release, and
force-demotion", never alters `attachedTo` — so a fleet mining a feature
(`docked`, i.e. `attachedTo` naming that feature) can be held into
`stationkeep` without ever ceasing to be docked to it. That hold's own settlement — `release` called mid-run,
or the automatic past-dry-instant fold, which can fire on any read or
write that observes it — debits the fleet's `fuel` cargo between this
run's commit and its resolve. This is exactly the "future verb that can
mutate cargo while a fleet is docked to a mined feature" this requirement
previously held open as unreachable, and **the claim retired here is that
one claim alone: `freeHoldAtResolve` no longer always equals
`freeHoldAtCommit`.** It can now be strictly larger, by exactly a
station-keeping settlement's `fuel` debit, if one lands inside the run's
window.

Nothing else changes, and in particular the `holdFull` branch **remains
structurally unreachable in production**. A station-keeping settlement only
ever *debits* `fuel`, so it can only widen free hold, never narrow it; and
`take = min(tons, remainingAtEta, freeHoldAtResolve)` with `tons` already
admitted at commit against the narrower `freeHoldAtCommit` means a widened
free hold can never bind the take. No production writer can grow a fleet's
cargo of **any** kind between a run's commit and its resolve either, and the
reason is docking exclusivity rather than which kind is credited: `mine`'s
own resolver is the sole crediter of mined cargo and the run holds the
movement slot for its whole duration; a sale requires the fleet docked to a
station; and a refuel likewise requires the fleet docked to a station
(`fuel-purchase`'s "Refuel Requires the Fleet Docked To the Selling
Station"), which a fleet docked to the mined feature is not. That last
exclusion is load-bearing and SHALL NOT be replaced by the weaker
observation that a refuel credits `fuel` rather than a mined kind: free hold
counts **all** kinds including fuel (`fleet-movement`'s "Fuel occupies cargo
capacity exactly like a mined resource"), so a mid-run refuel would *narrow*
free hold and make `holdFull` genuinely reachable. It is unreachable because
the refuel cannot land mid-run at all. The `holdFull` branch and its
scenario therefore stay specified and tested against a directly constructed
state, not against a sequence of production verbs — asserting otherwise
would require a test that writes cargo straight into the fleet document,
which is the shape of test this chain has already been burned by.
`remainingAtEta`, `take`, and the reason code are all computed from
`freeHoldAtResolve` read fresh at resolve, never from a value cached at
commit, so every clamp already floors and reports correctly against this new
source of mid-run free-hold movement — nothing above required correction,
only the retired claim of invariance.

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

#### Scenario: A station-keeping settlement landing mid-run widens free hold and changes no take
- **GIVEN** a mine run committed for a `tons` that `freeHoldAtCommit`
  admitted at commit, against a fleet simultaneously holding a
  `stationkeep` park while docked to the mined feature
- **WHEN** that hold settles inside the run's window — by `release` or by
  the automatic past-dry-instant fold — debiting the fleet's `fuel`
- **THEN** `freeHoldAtResolve`, read fresh with that settlement applied, is
  strictly greater than `freeHoldAtCommit` — the equality this requirement
  previously claimed no longer holds
- **AND** the take is still the full requested `tons` and the resolved
  action's reason code is still `clean`, because a widened free hold can
  never bind `take = min(tons, remainingAtEta, freeHoldAtResolve)` when
  `tons` was already admitted against the narrower commit-time figure

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

### Requirement: A Client-Supplied Feature Id Is Validated Before Resolution
The system SHALL validate a mine commit's client-supplied `featureId` in
two phases. A **lexical phase**, run before the string is parsed for the
belt-member separator `#` at all, rejects it outright when it: contains a
`/` character; is exactly `.` or `..`; matches the regular expression
`^__.*__$` (Firestore's reserved document-id pattern); or exceeds
`MineParams.MaxFeatureIdBytes` (default 256 bytes, measured as UTF-8
bytes, below Firestore's 1500-byte document-id limit). A **resolution
phase**, run only for a string the lexical phase passed, after the `#`
separator is parsed but before the resulting prefix is used to resolve any
target, rejects it when it: contains more than one `#`; carries a `#`
whose suffix is not a base-10 integer within `[0, AsteroidsPerBelt)`; or
carries a `#` whose prefix does not resolve, in the fleet's own current
system's `interior.Features`, to an existing feature of the belt type.
Each rejection carries its own distinguishable reason and creates no
action.

These checks do not depend on the docked-to-the-named-feature precondition
for their correctness — they SHALL remain in force unchanged if a future
change ever writes `attachedTo` from anything other than a resolved
body-table id — but they SHALL run only after, never before, the ownership
check ("Mine Command Requires Fleet Ownership") and the not-docked
rejection ("Mine Commit Preconditions"'s docked-state check): an invalid
or unresolvable `featureId` rejected any earlier would let a caller probe
the shape or existence of a foreign fleet's docked target before ownership
is established, turning this endpoint into an existence oracle.

Each of these rejections SHALL report a reason distinct from the
not-docked, unknown-kind, and station-not-mineable reasons and SHALL
surface as `400 Bad Request` carrying that reason. Because the
docked-state check runs first and a fleet's `attachedTo` is today written
only from a resolved body-table id, these rejections are reachable only
for a fleet whose stored `attachedTo` is exactly the submitted `featureId`;
their acceptance evidence is service-level, with the stored attachment
supplied by the test fixture, not an end-to-end commit.

Once a target resolves, the run's ledger key SHALL be composed from the
**resolved** feature's own id (the named feature itself, or, for a member
id, its resolved parent belt feature — see "Belt Member Targets Resolve
Through Their Parent Belt Feature") and the acting fleet's own stored
`systemId` — never from the client-supplied `featureId` string verbatim,
and never from a client-supplied system identifier — the same doctrine
`goods-sale`'s "Sale Resolves the Station From the Acting Fleet's Own
System, Never a Client-Supplied Identifier" already applies to sale.

#### Scenario: A featureId containing a path separator is rejected before parsing
- **GIVEN** a fleet the requester owns whose stored `attachedTo` is
  exactly the submitted `featureId`, which contains a `/` character
- **WHEN** a mine commit is submitted naming that `featureId`
- **THEN** the commit fails with `400 Bad Request` and the id-validation
  reason — distinct from the not-docked and unknown-kind reasons — no
  action is created, and the string is never parsed for a `#` separator

#### Scenario: A featureId of exactly `.` or `..` is rejected before parsing
- **GIVEN** a fleet the requester owns whose stored `attachedTo` is
  exactly the submitted `featureId`, which is exactly `.` or `..`
- **WHEN** a mine commit is submitted naming that `featureId`
- **THEN** the commit fails with `400 Bad Request` and the id-validation
  reason — distinct from the not-docked and unknown-kind reasons — and no
  action is created

#### Scenario: A reserved dunder-pattern featureId is rejected before parsing
- **GIVEN** a fleet the requester owns whose stored `attachedTo` is
  exactly the submitted `featureId`, which matches the regular expression
  `^__.*__$`
- **WHEN** a mine commit is submitted naming that `featureId`
- **THEN** the commit fails with `400 Bad Request` and the id-validation
  reason — distinct from the not-docked and unknown-kind reasons — and no
  action is created

#### Scenario: An overlong featureId is rejected before parsing
- **GIVEN** a fleet the requester owns whose stored `attachedTo` is
  exactly the submitted `featureId`, whose UTF-8 byte length exceeds
  `MineParams.MaxFeatureIdBytes`
- **WHEN** a mine commit is submitted naming that `featureId`
- **THEN** the commit fails with `400 Bad Request` and the id-validation
  reason — distinct from the not-docked and unknown-kind reasons — and no
  action is created

#### Scenario: A featureId at the maximum configured length is not rejected on length grounds
- **GIVEN** a fleet the requester owns whose stored `attachedTo` is
  exactly the submitted `featureId` — a resolvable, resource-bearing
  feature's own id whose UTF-8 byte length is exactly
  `MineParams.MaxFeatureIdBytes`
- **WHEN** a mine commit is submitted naming that `featureId` and a kind
  that feature carries
- **THEN** the commit is accepted and an action is created

#### Scenario: A featureId one byte past the maximum configured length is rejected
- **GIVEN** the same fleet and the same `featureId` extended by one ASCII
  byte, with `attachedTo` set to the extended string
- **WHEN** a mine commit is submitted naming that extended `featureId`
- **THEN** the commit fails with `400 Bad Request` and the overlong-id
  reason — distinct from the not-docked, unknown-kind, and every other
  id-validation reason — and no action is created

#### Scenario: A featureId with more than one member separator is rejected
- **GIVEN** a fleet the requester owns whose stored `attachedTo` is
  exactly the submitted `featureId`, which contains more than one `#`
  character
- **WHEN** a mine commit is submitted naming that `featureId`
- **THEN** the commit fails with `400 Bad Request` and the id-validation
  reason — distinct from the not-docked and unknown-kind reasons — and no
  action is created

#### Scenario: A member suffix outside the valid index range is rejected
- **GIVEN** a fleet the requester owns whose stored `attachedTo` is
  exactly the submitted `featureId`, which carries a `#` whose suffix is
  not a base-10 integer, or is a base-10 integer outside
  `[0, AsteroidsPerBelt)`
- **WHEN** a mine commit is submitted naming that `featureId`
- **THEN** the commit fails with `400 Bad Request` and the id-validation
  reason — distinct from the not-docked and unknown-kind reasons — and no
  action is created

#### Scenario: A member prefix that does not resolve to a belt feature is rejected
- **GIVEN** a fleet the requester owns whose stored `attachedTo` is
  exactly the submitted `featureId`, which carries a `#` whose prefix does
  not resolve, in the fleet's own current system, to an existing feature,
  or resolves to a feature that is not of the belt type
- **WHEN** a mine commit is submitted naming that `featureId`
- **THEN** the commit fails with `400 Bad Request` and the id-validation
  reason — distinct from the not-docked and unknown-kind reasons — and no
  action is created

#### Scenario: An unresolvable member rejection never precedes ownership or the not-docked rejection
- **WHEN** a mine commit is submitted for a fleet the requester does not
  own, or for a fleet not docked to the named target, and the commit's
  `featureId` is also malformed or unresolvable as a member id
- **THEN** the ownership check or the not-docked rejection fires first,
  and the malformed-id rejection is never reached — a caller can never
  learn whether a foreign fleet's target id would have resolved

#### Scenario: A resolved run's ledger key never contains the raw client string or a client-supplied system id
- **WHEN** a mine commit resolves against a belt member id
- **THEN** the appended ledger key's feature component is the resolved
  parent belt feature's own id, and its system component is the acting
  fleet's own stored `systemId` — neither is read from the request body

### Requirement: Belt Member Targets Resolve Through Their Parent Belt Feature
The system SHALL, when a mine commit's `featureId` denotes a belt member id
(`<beltFeatureId>#<k>`, per `system-interior`'s "A Belt's Members Are
Discrete Mineable Bodies On a Shared Radius") that has already passed the
validation defined in "A Client-Supplied Feature Id Is Validated Before
Resolution," resolve mineability, resource kinds, and the run's
ledger key alike from the **parent belt feature** — located by looking up,
in `interior.Features`, the feature named by the member id's validated
prefix — rather than by searching `interior.Features` for the member id
itself, which never appears there (belt members are synthesized only into
the system's body table, never persisted as `interior.Features` entries).
A member's `startTons` for a given `kind` SHALL be computed exactly as the
parent belt feature's own richness-derived starting tonnage for that
`kind` is computed for a direct mine of the belt feature (see "ETA From
Tonnage Target") — a member draws no different tonnage or richness of its
own; the belt is one lode, per `system-interior`'s "A Belt's Members Are
Discrete Mineable Bodies On a Shared Radius." A mine run resolved through a
member id SHALL use the ledger key `${systemId}::${parentBeltFeatureId}::
${kind}` (per "Ledger Key Is System-And-Kind-Qualified, Channel Scope Is
Per-System"), where `parentBeltFeatureId` is the resolved parent's own id
and `systemId` is the acting fleet's own stored system id — never the
member id, and never a client-supplied system identifier — so a run
committed through a member and a run committed by naming the belt feature
directly fold the identical ledger key and deplete the identical lode.

#### Scenario: A fleet docked to a belt member can mine its inherited resource kind
- **WHEN** a fleet's effective state is `docked` to a belt member id (e.g.
  `feat-belt-0#3`) and it commits a mine run naming a `kind` its parent
  belt feature carries
- **THEN** the commit succeeds, resolving the requested kind's richness and
  computing `startTons` from the parent belt feature, never by searching
  `interior.Features` for the member id itself

#### Scenario: A member's mine run depletes the same lode as its parent belt feature
- **WHEN** a fleet mines a kind through a belt member's id, and a mine run
  against that same belt feature's own id (whether earlier, later, or by a
  different fleet) targets the same kind
- **THEN** both runs fold and append to the identical
  `${systemId}::${beltFeatureId}::${kind}` ledger key, and each depletes
  what the other can still yield

#### Scenario: Naming the belt feature while docked to one of its members is rejected as not docked
- **WHEN** a fleet is docked to a belt member and commits a mine run naming
  the parent belt feature's own id rather than the member it is actually
  docked to
- **THEN** the commit fails with the existing not-docked rejection (the
  fleet's stored `attachedTo` names the member, not the belt feature)

