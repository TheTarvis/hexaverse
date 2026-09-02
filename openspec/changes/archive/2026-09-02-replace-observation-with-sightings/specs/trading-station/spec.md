## REMOVED Requirements

### Requirement: Station Excluded From the Fog/Scan Feature Source
**Reason**: Superseded — `observation.InteriorSource`, the feature-level fog
source this requirement names, and the per-feature observation model it
protects a station from being minted into, are both deleted whole by
`replace-observation-with-sightings` (design.md Decisions 1 and 4): a
system's bodies, stations included, now ship in full to every authenticated
requester unconditionally, and live disclosure is ship-only and persists
nothing per-feature. `proximity-disclosure`'s own occlusion rule ("The Star
Occludes Both Live Channels and the Focused Scan") occludes only by the
star, never by an arbitrary body, so there is no successor
feature-observation-and-occlusion seam left for a station to be excluded
from — this requirement's own scenarios describe a mechanism that no
longer exists and cannot be exercised.
**Migration**: None. A station's disclosure is now governed uniformly by
`system-interior`'s "Bodies Are Public; Ships Are Disclosed" (every body
ships in full, unconditionally, station included), and any sightline
question is governed by `proximity-disclosure`'s star-only occlusion rule
exactly like any other non-star body — there is nothing left for a station
to opt out of. This capability's other requirements (station identity,
placement, and the station-store-outage degradation) are unaffected and
this spec is not emptied by the removal.

### Requirement: Home Station Visible On First Board Read, No Scan Required
**Reason**: Superseded — this requirement's own Purpose statement names its
scope as the read where a station "splices into the system-interior read
at the service seam," i.e. `GET /v1/systems/:systemId` — the same read
`system-interior`'s "Bodies Are Public; Ships Are Disclosed"
(`replace-observation-with-sightings`) now serves unconditionally, with no
per-requester tier gate computed over any body. This requirement's own
*A system below the configured minimum tier omits its station* scenario is
therefore no longer true of that read: a station is a body spliced into
the interior, and the interior omits no body for lack of charted
knowledge. The tier gate survives, unaffected, for this capability's
separate **direct** station-read endpoint
(`GET /v1/systems/:systemId/station`), already governed by the sibling
requirement "Station Existence Hidden Below the Visibility Gate". Restated
below, scoped to the direct read alone, with the surviving scenarios
carried forward.
**Migration**: None — no backwards compatibility is retained (solo
project; see docs/plans/continous_space/README.md ground rules).

## ADDED Requirements

### Requirement: Home Station Visible On the Direct Station Read, No Scan Required
The system SHALL include a system's station in a **direct** station read
(`GET /v1/systems/:systemId/station`) whenever the requester's graph-tier
knowledge of that system is at least a configured minimum visibility tier
(`market.Params.MinVisibilityTier`, defaulted to `rumored` — the same tier
`market-price-board` gates on), independent of sensor coverage or any
scan. This gate applies to the direct station-read endpoint alone: the
system-interior/board read (`GET /v1/systems/:systemId`) serves a system's
station unconditionally to every authenticated requester, per
`system-interior`'s "Bodies Are Public; Ships Are Disclosed" — a station is
a body spliced into that interior, not a second disclosure surface with
its own tier rule. Since spawn always sets a corporation's home system to
at least `explored`, a freshly spawned corporation sees its home station on
the very first direct station read regardless of where its rim-ring hull
was placed.

#### Scenario: A freshly spawned corporation's first direct station read shows its home station
- **WHEN** a freshly spawned corporation reads its home system's station
  directly for the first time, having performed no scan
- **THEN** the home station appears in the response

#### Scenario: A system at exactly the configured minimum tier includes its station on a direct read
- **WHEN** a requester's graph tier for a station-bearing system is exactly
  the configured minimum visibility tier
- **THEN** a direct station read for that system includes the station

#### Scenario: The board read serves the station regardless of tier
- **WHEN** a requester's graph tier for a station-bearing system is below
  the configured minimum visibility tier (e.g., merely `starVisible`)
- **THEN** the system-interior/board read for that system still includes
  the station in full, because body disclosure on that read is
  unconditional and computes no tier gate
