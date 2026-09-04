## MODIFIED Requirements

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
