## REMOVED Requirements

### Requirement: Ambient Sensor Coverage From Own Units

**Reason**: Superseded by nothing. The live sensor coverage this requirement
computed was a union of lattice-hop discs centred on each own fleet's
`board.Cell`. A fleet no longer has a board cell — its stored state is
`space.ShipState` (design.md Decision 4) — so coverage has no centre to
compute from. `observation`'s live half is deleted outright by this change
(design.md Decision 11); disclosure-based coverage is link 5's work.

**Migration**: None — no backwards compatibility is retained (solo project;
see docs/plans/continous_space/README.md ground rules).

### Requirement: Running Scan Echo Disc

**Reason**: Superseded by nothing. The echo front this requirement grows was
measured in lattice hops from a fleet's board-cell emission point. Both the
scan verb that produced it and the board-cell geometry it was measured
against are removed by this change (design.md Decision 11); the sensor
channel itself is retained, unwritten, for link 5's focused scan (design.md
Open Question 4) — no verb in this change mints an echo of any shape.

**Migration**: None — no backwards compatibility is retained (solo project;
see docs/plans/continous_space/README.md ground rules).

### Requirement: Scan Resolution Mints the Reveal

**Reason**: Superseded by nothing. The scan action this requirement resolves
is deleted with `observation`'s live half (design.md Decision 11);
`fleet-movement`'s removed "Sensor Scan Order" requirement records the
verb's own deletion. Link 5's focused scan is this reveal mint's eventual
successor and is not specified by this change.

**Migration**: None — no backwards compatibility is retained (solo project;
see docs/plans/continous_space/README.md ground rules).

### Requirement: Path-Swept Ambient Reveal on Move Resolution

**Reason**: Superseded by nothing. The swept path this requirement folds over
is the sequence of `board.Cell`s a burn resolution walked; a burn's stored
geometry is now a `space.Burn` curve with no cell path at all (design.md
Decision 4). Ambient reveal has no consumer of this shape after this change.

**Migration**: None — no backwards compatibility is retained (solo project;
see docs/plans/continous_space/README.md ground rules).

### Requirement: Fleet Audience Visibility

**Reason**: Superseded by `fleet-movement`'s "Fleet Read Endpoints Serve Own
Fleets Only" — the lattice sensor-coverage union this requirement computed a
foreign fleet's visibility from is deleted along with the rest of
`observation`'s live half (design.md Decision 11). The successor requirement
states the interim (own fleets served in full; a foreign fleet omitted from
list reads and `404` on direct fetch) directly on `fleet-movement`, since
this capability no longer computes any fleet visibility at all.

**Migration**: None — no backwards compatibility is retained (solo project;
see docs/plans/continous_space/README.md ground rules).
