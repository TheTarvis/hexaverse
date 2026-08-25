# Corporation Credits Specification

## Purpose

Give every corporation a currency: a materialized integer `credits` balance
on the corporation doc, mutated only inside a transaction that appends a
matching entry to an append-only trade ledger. The materialized balance is a
deliberate deviation from the action spine's fold-of-deltas pattern — a
credit ledger accrues entries forever — kept safe by a reconciliation
invariant (ledger fold equals stored balance, with a countable divergence
signal). Mutations are idempotent by a client-supplied operation key,
instant and location-independent (no action, no slot, no ETA), and balance
and ledger are disclosed to the owning corporation only.

## Requirements

### Requirement: Materialized Credit Balance, Initialized At Spawn
The system SHALL carry a whole-integer `credits` balance on every living
corporation's document, initialized on spawn asset healing to a configured
starting value (`market.Params.StartingCredits`), and SHALL never persist
or read that balance as negative: a debit that would take the balance below
zero SHALL be rejected in full, applying no partial amount.

#### Scenario: A fresh corporation's balance is the configured starting grant
- **WHEN** a corporation's spawn assets are healed for the first time
- **THEN** its `credits` balance is exactly the configured starting value

#### Scenario: An overdraw is rejected in full
- **WHEN** a debit against a corporation's balance would take it below zero
- **THEN** the debit is rejected entirely — no partial amount is applied and
  the stored balance is unchanged

#### Scenario: The balance never reads negative
- **WHEN** a corporation's balance is read at any point after any number of
  settled credits and debits
- **THEN** the value is zero or positive, never negative

### Requirement: Balance Mutations Are Transactional and Ledgered
The system SHALL mutate a corporation's credit balance only inside a single
transaction that, in the same commit, appends the corresponding trade-
ledger entry recording the resulting balance — there SHALL be no service
operation that changes the stored balance without simultaneously appending
that entry.

#### Scenario: A successful mutation lands the balance change and its ledger entry together
- **WHEN** a credit-mutating operation succeeds
- **THEN** the corporation's stored balance reflects the change and a
  matching ledger entry recording the resulting balance exists, both from
  the same transaction

#### Scenario: A failed mutation changes neither the balance nor the ledger
- **WHEN** a credit-mutating operation fails before its transaction commits
  (e.g., a business-rule rejection or a transaction conflict)
- **THEN** the corporation's stored balance and ledger are both left exactly
  as they were before the attempt

### Requirement: Append-Only Trade Ledger
The system SHALL record every credit balance mutation as an append-only
ledger entry carrying at minimum: an entry id, the corporation id, the
triggering account's identity, a nullable fleet id (the acting fleet, for
a fleet-scoped mutation such as a sale — null for a fleet-independent
mutation such as the starting grant), the world time of the mutation, an
entry kind (starting grant, sale proceeds, or **adjustment** — an
operator-attributed correction, extensible to future kinds), a nullable
counterparty, a nullable item reference, a nullable quantity, a nullable
unit price, the signed credit amount, and the resulting balance
immediately after the entry — and SHALL never update or delete a ledger
entry once appended. No amount recorded for a credit mutation SHALL ever
be zero. The nullable fleet id field is the one this capability's and
`goods-sale`'s replay-fingerprint checks compare against when a reused
operation key names a different fleet than the recorded entry.

#### Scenario: A sale-shaped entry records its trade detail
- **WHEN** a settled sale appends its ledger entry
- **THEN** the entry records the selling fleet's id, the counterparty (the
  station), item reference (the resource kind), quantity (tons sold), unit
  price, the signed (positive) amount, and the resulting balance

#### Scenario: A non-trade entry omits trade-specific fields
- **WHEN** the starting-grant entry is appended at spawn
- **THEN** the entry records its kind, the signed amount, and the resulting
  balance, with no counterparty, item reference, quantity, or unit price

### Requirement: Ledger-Balance Reconciliation Invariant
The fold (sum of signed amounts) of a corporation's complete trade ledger
SHALL at all times equal its stored credit balance. The system SHALL
provide a countable, attributable signal (a log line or metric naming the
corporation id) whenever a reconciliation check finds these two values
diverge. The routine reconciliation check SHALL run as a checkpointed,
windowed fold — never a from-genesis fold of a corporation's entire
ledger — whose cursor SHALL be a compound, stable ordering (world time,
then a tie-broken document identity), never the ledger entry's document
id alone, since that id is a caller-supplied operation key carrying no
chronological meaning. This invariant reconciles a corporation's own
stored balance against its own ledger fold only — it SHALL NOT be treated
as, or relied upon as, a correctness guarantee for `goods-sale`'s
cross-domain settlement (fleet cargo, NPC request remaining quantity);
those effects are outside this fold's scope by construction.

#### Scenario: A fresh corporation's ledger reconciles
- **WHEN** reconciliation runs for a corporation with only its starting-
  grant entry
- **THEN** the fold of its ledger equals its stored balance

#### Scenario: A divergence emits an attributable signal
- **WHEN** a reconciliation check is run against a corporation whose ledger
  fold and stored balance have been made (by fixture) to disagree
- **THEN** the check emits a log line or metric naming that corporation's
  id, distinguishable from a clean reconciliation result

#### Scenario: The windowed fold never skips or double-counts a same-tick entry
- **WHEN** two ledger entries share the identical world time and straddle a
  reconciliation checkpoint boundary
- **THEN** the windowed fold counts each entry exactly once, using a stable
  tiebreaker beyond world time alone

#### Scenario: A full-history audit is available when a windowed check is suspected unsound
- **WHEN** an operator suspects a corporation's checkpoint was advanced
  past an undetected divergence
- **THEN** a full, genesis-to-now fold (not windowed) can be run against
  that corporation on demand, independent of the routine checkpointed
  check

### Requirement: Reconciliation Runs On a Stated Cadence, Chained at Write Time, and Halts Mutation On Divergence
The system SHALL run the ledger-balance reconciliation check (see "Ledger-
Balance Reconciliation Invariant") on a stated periodic cadence, run
independently of any particular mutation, AND SHALL validate, inside every
settlement transaction, the transaction's computed new balance against
the previous ledger entry's recorded resulting balance before committing
— an O(1) write-time check that catches a divergence at the moment it
would occur rather than only on the next periodic fold. Upon a confirmed,
unresolved divergence for a corporation, the system SHALL reject further
credit-mutating operations for that corporation with a distinguishable
error until an operator resolves it via an `adjustment` ledger entry,
rather than continuing to mutate a balance already known to be wrong.

#### Scenario: A periodic reconciliation cycle runs without a mutation triggering it
- **WHEN** no credit-mutating operation occurs for a corporation during a
  reconciliation cycle
- **THEN** the cycle still runs and evaluates that corporation's
  reconciliation state

#### Scenario: A settlement transaction validates against the previous entry's resulting balance
- **WHEN** a settlement transaction computes its new balance
- **THEN** it compares that computed value against the previous ledger
  entry's recorded resulting balance before committing, catching a
  divergence at write time rather than only on the next periodic fold

#### Scenario: A corporation with a confirmed divergence has further mutations rejected
- **WHEN** a corporation's reconciliation state shows a confirmed,
  unresolved divergence
- **THEN** any further credit-mutating operation for that corporation is
  rejected with a distinguishable error until an operator appends an
  `adjustment` entry resolving it

### Requirement: Trade Entries Are Attributable To an Actor
Every ledger entry recording a credit mutation SHALL record the identity
of the requester (account) that triggered it, in addition to the
corporation id, so a post-incident investigation can distinguish which
account or channel produced a given entry — including when more than one
channel (e.g. the browser client and the claude-agent's token-passthrough
calls) acts on behalf of the same corporation.

#### Scenario: A ledger entry records the triggering account
- **WHEN** a credit-mutating operation settles
- **THEN** its ledger entry records the requesting account's identity
  alongside the corporation id

#### Scenario: Two channels acting for the same corporation are distinguishable
- **WHEN** two credit-mutating operations for the same corporation are
  triggered by two different accounts or channels
- **THEN** their ledger entries record different triggering-account
  identities, distinguishable from one another

### Requirement: Credit-Mutating Attempts Are Audit-Logged, Settled or Rejected
The system SHALL emit a structured audit log record for every
credit-mutating attempt, whether it settles or is rejected, distinct from
`request-authorization`'s general HTTP audit logging (which classifies
only a downstream `403` or a strict-tier `429`, and does not cover a
sale's `400`/`404`/`409` rejections) — recording at minimum the requester
identity, the corporation id, the operation key, the outcome
(settled/rejected), and the rejection reason when rejected.

#### Scenario: A settled mutation is audit-logged
- **WHEN** a credit-mutating operation settles
- **THEN** a structured audit record is emitted with the requester
  identity, corporation id, operation key, and a "settled" outcome

#### Scenario: A rejected mutation is audit-logged with its reason
- **WHEN** a credit-mutating operation is rejected for any reason
- **THEN** a structured audit record is emitted with the requester
  identity, corporation id, operation key, and the rejection reason

#### Scenario: Many rejected attempts remain individually countable by reason
- **WHEN** many credit-mutating attempts are rejected for varying reasons
  over time
- **THEN** each rejected attempt is individually queryable/countable by
  its recorded reason, rather than leaving only an unclassified log line

### Requirement: Credit Minting Rate Is Observable
The system SHALL make the rate at which credits are minted (the sum of
positive ledger entries per unit time, across all corporations) available
as a countable signal, since this version ships no credit sink
(proposal.md's Scope caveat) and this is the only inflation visibility
that exists this milestone.

#### Scenario: The credit-minting rate is queryable over a time window
- **WHEN** an operator queries the total positive ledger amount minted
  across all corporations over a given time window
- **THEN** the signal is available without requiring a full ledger scan
  of every corporation

### Requirement: Ledger Read Is Paginated
The ledger read SHALL be paginated (a page size limit and a cursor), never
a single unbounded response — a corporation's ledger has no upper bound on
entry count over its lifetime (see design.md Decision 8).

#### Scenario: A ledger with many entries is read in bounded pages
- **WHEN** an owner reads its ledger and the ledger holds more entries than
  one page's configured size
- **THEN** the response includes at most that page size, plus a cursor for
  the next page

### Requirement: Idempotent Credit Mutation By Operation Key
Every credit-mutating operation SHALL accept a caller-supplied operation
key. The dedup anchor for that operation SHALL be scoped to the mutating
corporation — the ledger entry's document id within that corporation's own
ledger subcollection (`corporations/{corpId}/ledger/{operationKey}`), never a
galaxy-global keyspace — so an operation key used by one corporation SHALL
have no effect of any kind on any other corporation's mutation carrying the
same key. A repeated call carrying an operation key already used **by the same
corporation** SHALL be a no-op returning that corporation's own original
recorded result, applying no second mutation.

#### Scenario: A fresh operation key mutates and records once
- **WHEN** a credit-mutating call is made with a not-previously-used
  operation key
- **THEN** the balance changes and exactly one ledger entry is recorded
  under that key

#### Scenario: A retried call with the same key is a no-op
- **WHEN** a credit-mutating call is retried with an operation key already
  recorded from an earlier, successful call
- **THEN** no second mutation is applied; the original recorded result is
  returned

#### Scenario: Two different operation keys apply independently
- **WHEN** two credit-mutating calls against the same corporation use two
  different operation keys
- **THEN** both mutations apply, each recorded under its own key

#### Scenario: The same operation key used by two corporations applies twice, independently
- **WHEN** corporation A settles a mutation with operation key K, and
  corporation B later submits its own mutation with the same key K
- **THEN** B's mutation applies in full and is recorded under B's own ledger
- **AND** B's response reports only B's own result — no field of A's entry
  (amount, unit price, quantity, counterparty, or resulting balance) appears
  in it, and A's balance and ledger are unchanged

#### Scenario: A replay never discloses another corporation's entry
- **WHEN** a replay is answered from an existing ledger entry
- **THEN** the entry read is always one under the requesting corporation's own
  ledger, resolved from `common.ActorCorp` — never from a key lookup that can
  reach an entry belonging to a different corporation

#### Scenario: A reused key with different parameters is a conflict, not a replay
- **WHEN** a credit-mutating call reuses an operation key already recorded for
  the same corporation, but names a different fleet, kind, tonnage, or station
  than the recorded entry
- **THEN** the response is a distinguishable conflict error, no mutation is
  applied, and the recorded entry's result is NOT returned as though it were
  this request's outcome

### Requirement: Operation Key Format Is Constrained and Its Namespace Reserved
An operation key SHALL be a string of 16 to 64 characters drawn only from
`[A-Za-z0-9_-]`. The system SHALL reject, with `400 Bad Request` and before
any state read or mutation, a request whose operation key is absent, empty,
outside that length range, or contains any other character. The system SHALL
additionally reject any caller-supplied operation key beginning with a
reserved prefix (`spawn:`, and any prefix the system itself derives for a
server-triggered mutation), so a client can never write to, read from, or
suppress a server-derived idempotency anchor.

#### Scenario: An empty or malformed operation key is rejected before any state is touched
- **WHEN** a credit-mutating call supplies an operation key that is empty,
  shorter than 16 or longer than 64 characters, or contains a character
  outside `[A-Za-z0-9_-]` (including `/`, `.`, or a `__…__` pattern)
- **THEN** the response is `400 Bad Request`, no document is read or written,
  and no ledger entry is created

#### Scenario: A reserved-prefix operation key is rejected
- **WHEN** a caller supplies an operation key beginning with `spawn:` or any
  other server-reserved prefix
- **THEN** the response is `400 Bad Request` and no ledger entry is created
- **AND** the corporation's opening-grant idempotency anchor remains
  unwritable by any client request

### Requirement: Credits Are Instant and Location-Independent
The system SHALL apply every credit mutation as an immediate, synchronous
effect of its triggering call — never through `action-dispatch` — creating
no action, claiming no actor-channel slot, and computing no ETA, regardless
of where the corporation's physical assets currently are.

#### Scenario: A settled mutation's balance change is visible immediately
- **WHEN** a credit-mutating call succeeds
- **THEN** the corporation's next balance read reflects the change with no
  waiting period or ETA

#### Scenario: A credit mutation creates no action
- **WHEN** a credit-mutating call succeeds
- **THEN** no entry appears in any actor's `action-dispatch` inbox for it

### Requirement: Owner-Only Balance and Ledger Disclosure
The system SHALL disclose a corporation's credit balance and trade ledger
only to a requester whose own corporation is the one being read. A request
for another corporation's balance or ledger SHALL be rejected, hiding
existence rather than disclosing any figure.

#### Scenario: An owner reads its own balance and ledger
- **WHEN** an authenticated corporation requests its own balance or ledger
- **THEN** the response includes the real balance and ledger entries

#### Scenario: A foreign corporation's balance and ledger are not disclosed
- **WHEN** an authenticated corporation requests another corporation's
  balance or ledger
- **THEN** the response discloses no figures (existence hidden, matching
  the fog convention already used elsewhere in this codebase)

#### Scenario: An unauthenticated request is rejected
- **WHEN** a balance or ledger request carries no valid bearer token
- **THEN** the response is `401 Unauthorized` and discloses no figures
