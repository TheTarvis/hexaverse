## MODIFIED Requirements

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
