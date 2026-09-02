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
