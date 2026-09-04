// Scan-target domain types (openspec change `add-scan-and-sightings-surface`,
// `focused-scan`: *Eligible Scan Targets Are Served Per Fleet, To Their Owner
// Alone*). Wire shape pinned by link8b-impl-contract.md §1.1/1.7.
//
// NO `worldTime` FIELD — task 3.7/9.2b. No client requirement measures
// anything against a scan-target read's world time: a running sweep's
// countdown measures against the view's own scale-correct projected world
// time, and the inbox supplies the ETA and committed time. Adding one here
// would be this chain's own signature defect (an unconsumed served field)
// committed inside the change written to prevent it.

export type ScanTargetKind = 'body' | 'fleet'

export interface ScanTarget {
  hostId: string
  kind: ScanTargetKind
  durationMs: number
}

export interface ScanTargetList {
  targets: ScanTarget[]
}
