// Sighting domain types (openspec change `add-scan-and-sightings-surface`,
// `sighting-records`: *A Sighting Record Is Addressable On the Wire Without
// Naming Its Target*). Wire shape pinned by link8b-impl-contract.md §1.2/1.7.
//
// `actionId` and `corporationId` ARE served but deliberately absent here:
// nothing on the client reads either (the row<->ghost match is on the
// record's own `id`, and the settled report addresses its action through the
// inbox's own id) — carrying them would be the exact consumer-less field the
// change's own orphan audit (tasks.md 9.2) forbids.
//
// `position`/`velocity` are ALWAYS present on the wire, even for a clean
// sweep — none of `sightings.Sighting`'s Go fields carry `omitempty`, so a
// clean-sweep record decodes to the zero value and serves
// `{"X":0,"Y":0,"Z":0}` / `false` / `0` / `null`. The client branches on
// `cleanSweep`, NEVER on a field's presence: a presence check would
// misclassify a genuine record positioned at the origin as a clean sweep,
// which is exactly the case the origin-omission rule (task 7.5) exists for.
//
// `emitting` IS served (backend `sightings.Sighting.Emitting`) but is
// deliberately absent here (task 9.2a orphan audit): no scenario in
// `sighting-log` or `system-space-view` names a consumer for it — a sighting
// is a frozen glimpse, not a live disclosure state, and nothing on this
// surface reads whether the swept target was emitting. Carrying it would be
// the exact consumer-less field the audit exists to catch.

import type { Vec3 } from './fleet'

export interface Sighting {
  id: string
  systemId: string
  asOf: number
  hostId: string
  cleanSweep: boolean
  position: Vec3
  velocity: Vec3
  hullCount: number
  hullTypes: string[] | null
}

export interface SightingPage {
  sightings: Sighting[]
  nextCursor: string
}
