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
`fleet-movement`'s "Station-Keeping Hold and Release Are Fleet Verbs",
added by `add-stationkeep-hold-verb`) requires only that the fleet's
effective park mode be `orbit`, and, per that same capability's "A fleet's
attachment survives hold, release, and force-demotion", never alters
`attachedTo` — so a fleet mining a feature (`docked`, i.e. `attachedTo`
naming that feature) can be held into `stationkeep` without ever ceasing
to be docked to it. That hold's own settlement — `release` called mid-run,
or the automatic past-dry-instant fold, which can fire on any read or
write that observes it — debits the fleet's `fuel` cargo between this
run's commit and its resolve. This is exactly the "future verb that can
mutate cargo while a fleet is docked to a mined feature" this requirement
previously held open as unreachable; `freeHoldAtResolve` therefore no
longer always equals `freeHoldAtCommit` — it can be strictly larger, by
exactly a station-keeping settlement's `fuel` debit, if one lands inside
the run's window. This does not change the clamp math above:
`remainingAtEta`, `take`, and the reason code are all computed from
`freeHoldAtResolve` read fresh at resolve, never from a value cached at
commit, so the `holdFull` branch, and every other clamp, already floors
and reports correctly against this new source of mid-run free-hold
movement — nothing above required correction, only the retired claim of
invariance.

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

#### Scenario: A station-keeping settlement landing mid-run widens free hold before resolve
- **WHEN** a mine run's fleet is held into `stationkeep` after the run's
  commit, and that hold settles — by `release` or by the automatic
  past-dry-instant fold — before the run resolves, debiting the fleet's
  `fuel` cargo
- **THEN** `freeHoldAtResolve` reflects the widened free hold from that
  debit, potentially exceeding `freeHoldAtCommit`, and the take and clamp
  reason code are computed correctly against that fresh value
