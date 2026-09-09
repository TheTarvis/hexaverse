# Security review — `add-vitals-strip` (chain link 2a)

**Verdict: SECURITY-CLEAR.** No new disclosure surface. Two MINOR
spec-hygiene findings, no BLOCKER, no MAJOR.

The change adds no endpoint, no field, no input, no persistence, no auth
path, and issues no read (`system-console`'s *The Strip Issues No Read of Its
Own*, tasks.md:89). Everything it renders is already served to this
requester and already rendered somewhere on this screen today. Threat
modelling is therefore confined to the three questions the brief names.

## The three questions

**1. Can the strip render a figure the requester is not entitled to? No.**
Every fleet-scoped cell reads "the acting fleet", and the acting fleet has
exactly three setting paths, all own-fleet-only and all enumerated in this
change's own `system-space-view` MODIFIED (*Toggle-to-Deselect…*, delta
lines 213–221): the roster row, the fleet's own rendered mark, and the new
chevron. The same requirement states that "an own fleet's or a foreign
contact's rendered position is never a member of this selection set", and
the live *Contacts…* requirement (`openspec/specs/system-space-view/
spec.md:370–375`) already forbids a contact from carrying owner identity or
fleet facts at all. There is no spec path by which a foreign fleet becomes
the acting fleet, so no strip cell can be pointed at one. Credits are
"the requester's own corporation's credit balance"; the clock is ambient.

**2. Is anything shipped and hidden client-side? No.** The chevron's
membership is "every fleet the requester owns", and the strip's inputs are
pinned by this change's `system-space-view` fan-in MODIFIED (delta lines
41–46) to "the own-fleets read, the corporation session read, and the world
clock" — the own-fleets read being the corporation-scoped
`GET /v1/fleets?mine=true` form the same requirement mandates (delta lines
13–20). The chevron is therefore the *unfiltered* corp-scoped server
response, not a wider list narrowed in the browser; the "filtered to this
system on the client" step is presentational narrowing of an
already-server-scoped set, and the chevron's explicit "SHALL NOT be filtered
to the open system" clause widens back to that same server-scoped set, never
past it. Server-side projection intact.

**3. Does re-homing the balance weaken it? No.** The sourcing clause
survives the move with its two load-bearing halves: requester-own scope
("the requester's own corporation's credit balance"), and the ambient
corporation session read as the sole source ("sourced from the ambient
corporation session read the surrounding layout makes and supplied to the
strip by the mounting view"). The `corporation-spawn` balance-bearing
session-bootstrap anchor moved out of the requirement body but is preserved
verbatim in this change's own `system-space-view` fan-in MODIFIED (delta
lines 33–36), including "never from a fifth read issued by this view".
Post-settlement freshness survives (sale and refuel update scenarios, plus
the *Sell Commit* / *Refuel Commit* MODIFIEDs re-pointing their refresh at
the strip), as does the explicit-unavailable state and its refusal to fall
back to `figure-formatting`'s generic `—` (reinforced by the
`figure-formatting` MODIFIED's new scenario). No fabricated or stale figure
is permitted.

**The second near-miss check.** All seven scenarios of the removed *Credit
Balance Readout* are accounted for: six travel to `system-console`, the
seventh re-anchors under the new `docked-fleet-actions` *A Failed Command Is
Announced to Assistive Technology* (RULING 11). No other rejection-reason or
error-copy requirement is orphaned — *Rejection Reasons Map to Player-Facing
Copy, Not Raw Server Text* (`openspec/specs/docked-fleet-actions/spec.md:656`)
and *Running Mine Gates the Fleet Panel's Commands* (:682) are untouched, and
both *Sell Commit* and *Refuel Commit* keep their mapped-copy clauses in the
MODIFIED text. One near-miss remains on the **other** removed requirement —
see MINOR 2.

## Findings

### MINOR 1 — the hold cell drops the "owner-only" qualifier the panel's readout carried

**Lands on:** `openspec/changes/add-vitals-strip/specs/system-console/spec.md`,
*The Hold Cell Shows Used, Total and Free Tonnage Over a Kind-Segmented
Gauge* (line 220).

The removed panel requirement scoped its source explicitly
(`openspec/specs/docked-fleet-actions/spec.md:138–139`):

> "The system SHALL show, for the acting (**own**) fleet, a cargo hold
> readout derived from the fleet read's **owner-only** roster fields"

The re-homed version says only "the acting fleet's used capacity, total
capacity and free hold … the served cargo pool". Not exploitable today —
the server serves roster fields only to the owner, audience fog 404s a
foreign fleet outside the live sensor union, and no path makes a foreign
fleet acting. It is a lost qualifier of exactly the kind the handoffs
README's lesson four is about, and link 2b's selected-entity tab is the next
surface to inherit this wording while pointing at an arbitrary selected
entity. Cheapest fix is one word in the requirement body:

```
The system SHALL show the acting fleet's — always an own fleet — used
capacity, total capacity and free hold, each derived from that fleet read's
owner-only roster fields and presented per `figure-formatting` as a tonnage
```

### MINOR 2 — the REMOVED block claims three scenarios travel; only two do

**Lands on:** `openspec/changes/add-vitals-strip/specs/docked-fleet-actions/
spec.md:90–97`, REMOVED *Fleet Panel Cargo Hold Readout*, which states:

> "Re-homed as `system-console`'s *The Hold Cell Shows Used, Total and Free
> Tonnage Over a Kind-Segmented Gauge*, which carries **all three** of this
> requirement's scenarios adapted to the strip."

Two travel (contents-and-capacity, unloaded-reads-absent). The third —
*The hold visibly fills when a mine run resolves*
(`openspec/specs/docked-fleet-actions/spec.md:173–177`) — has no counterpart
in `system-console`, which specifies the post-settlement refresh for credits
(sale, refuel) but never for the hold after a mine resolution. The blast
radius is small: *Realtime Refetch Rules While the Space View Is Open* still
lands the resolved cargo, and the strip is a pure projection of supplied
values, so a stale hold is unlikely rather than permitted-by-omission. But
this is the integrity clause for the mine→hold path and it currently has no
home. Paste-ready, under the `system-console` hold requirement:

```
#### Scenario: The hold visibly fills when a mine run resolves
- **WHEN** a running mine's ETA passes and the space view's refetch lands
  the updated fleet read
- **THEN** the strip's hold cell shows the credited cargo — its used, free
  and per-kind segments all reflecting the resolved run — without a page
  navigation
```

and correct the REMOVED reason to "carries this requirement's three
scenarios adapted to the strip" only once that scenario exists (otherwise
say "two of three, the third re-expressed as …").

## Adjacent, not security (for the spec-fidelity reviewer, not me)

Two prose clauses of *Credit Balance Readout* did not travel: "the announced
copy uses the same `figure-formatting` presentation as the visual readout",
and the "never a placeholder that a mounting view supplying no balance at all
would render indistinguishably and permanently" half of the unavailable rule.
Both are a11y/fidelity, not disclosure or integrity.

## Severity roll-up

- BLOCKER: none
- MAJOR: none
- MINOR: 2 (owner-only qualifier on the hold cell; the mine-resolve refresh
  scenario with no home, plus the inaccurate REMOVED reason)

**Verdict: SECURITY-CLEAR.** No backend follow-up change is warranted; I
found nothing needing a server-side fix.
