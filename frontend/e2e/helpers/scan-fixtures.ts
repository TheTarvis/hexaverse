import crypto from 'node:crypto'
import { expect, type Page } from '@playwright/test'
import { resolveE2EConfig } from '../config/env'

/**
 * Shared drivers and fixtures for the focused-scan / sighting-log e2e suite
 * (openspec change `add-scan-and-sightings-surface`, tasks.md 10.2a/b/c,
 * 10.3-10.7). A NEW file rather than an edit to `helpers/space-view.ts`:
 * that file's exports are already consumed by several immutable specs, and
 * this change's own fixture needs (a Firestore-emulator seeding helper, the
 * sighting document-id digest) belong together and are specific to this
 * capability.
 */

// --- the sighting document-id digest (link8b-impl-contract.md §1.3) -------

const DIGEST_DOMAIN = 'sighting/v1\x00'

/**
 * The SAME derivation `backend/sightings/mint.go` (task 2.1) computes:
 * hex(sha256("sighting/v1\x00" + actionId + "\x00" + targetId)[:16]).
 * Verified against the architect's own pinned table
 * (link8b-impl-contract.md §1.3):
 *   sightingDocumentId('act-1', 'tgt-1') === 'ae80c6d8304786e06ab71baee15cf787'
 *
 * Used by 10.2b/10.2c to seed a sighting fixture at the EXACT path the real
 * resolver would mint it at, so the test asserts against a genuine,
 * reachable document rather than a document only the test itself could ever
 * produce.
 */
export function sightingDocumentId(actionId: string, targetId: string): string {
  const hash = crypto.createHash('sha256')
  hash.update(DIGEST_DOMAIN + actionId + '\x00' + targetId)
  return hash.digest('hex').slice(0, 32)
}

// --- capturing the woken corporation's id ----------------------------------

/**
 * Records the corporation id from `POST /v1/corporations`'s response (the
 * spawn endpoint `wakeNewCorp` already drives) — needed because 10.2b/10.2c
 * seed a fixture into THIS corporation's own pile
 * (`corporations/{cid}/sightings/{digestId}`), and no test id anywhere
 * exposes the corp id to the DOM.
 *
 * Call BEFORE `wakeNewCorp`, mirroring `captureInteriors`'s own convention.
 */
export function captureCorporationId(page: Page): { id: string | null } {
  const box = { id: null as string | null }
  page.on('response', async (res) => {
    if (res.request().method() !== 'POST') return
    if (!/\/v1\/corporations$/.test(new URL(res.url()).pathname)) return
    if (!res.ok()) return
    try {
      const body = (await res.json()) as { corporation?: { id?: string } }
      if (body?.corporation?.id) box.id = body.corporation.id
    } catch {
      // A non-JSON or already-consumed body is not this helper's concern.
    }
  })
  return box
}

// --- seeding a sighting document directly via the Firestore emulator ------

export interface Vec3Like {
  X: number
  Y: number
  Z: number
}

export interface SeedSightingFixture {
  corporationId: string
  actionId: string
  targetId: string
  systemId: string
  hostId: string
  asOf: number
  position: Vec3Like
  velocity: Vec3Like
  hullCount: number
  hullTypes: string[]
  emitting?: boolean
}

/** One Firestore REST "value" — the typed-value wire shape the emulator's documents:commit / PATCH endpoints require. */
type FirestoreValue =
  | { stringValue: string }
  | { integerValue: string }
  | { doubleValue: number }
  | { booleanValue: boolean }
  | { nullValue: null }
  | { arrayValue: { values: FirestoreValue[] } }
  | { mapValue: { fields: Record<string, FirestoreValue> } }

function fsString(v: string): FirestoreValue {
  return { stringValue: v }
}
function fsInt(v: number): FirestoreValue {
  return { integerValue: String(Math.trunc(v)) }
}
function fsBool(v: boolean): FirestoreValue {
  return { booleanValue: v }
}
function fsVec3(v: Vec3Like): FirestoreValue {
  return { mapValue: { fields: { x: { doubleValue: v.X }, y: { doubleValue: v.Y }, z: { doubleValue: v.Z } } } }
}
function fsStringArray(vs: string[]): FirestoreValue {
  return { arrayValue: { values: vs.map(fsString) } }
}

/**
 * Writes a sighting document directly through the Firestore EMULATOR's REST
 * API (task 10.2c), at the exact path 2.1's digest derivation produces for
 * `(fixture.actionId, fixture.targetId)` — a declared TEST fixture, not a
 * route the product itself serves (the resolve transaction is the only
 * production writer). Fields mirror `sightings.Sighting`'s own Firestore
 * schema (`backend/sightings/model.go`) exactly: `targetId` IS written (the
 * store's own field), even though no wire read ever serves it back — the
 * cleanSweep marker is explicitly `false`, so the record is target-naming.
 *
 * REST endpoint shape: `PATCH .../documents/{path}?updateMask.fieldPaths=...`
 * — a PATCH with an explicit field mask creates-or-overwrites exactly the
 * named fields, which is what a fresh fixture document needs.
 */
export async function seedSightingFixture(fixture: SeedSightingFixture): Promise<string> {
  const cfg = resolveE2EConfig()
  if (!cfg.emulator) {
    throw new Error(
      '[e2e] seedSightingFixture requires the local Firestore emulator (E2E_ENV=local) — ' +
        'there is no production write path for a target-naming sighting fixture.',
    )
  }
  const docId = sightingDocumentId(fixture.actionId, fixture.targetId)
  const path = `corporations/${fixture.corporationId}/sightings/${docId}`
  const base = `http://${cfg.emulator.host}:${cfg.emulator.firestorePort}/v1/projects/${cfg.emulator.projectId}/databases/(default)/documents/${path}`

  const fields: Record<string, FirestoreValue> = {
    corporationId: fsString(fixture.corporationId),
    actionId: fsString(fixture.actionId),
    targetId: fsString(fixture.targetId),
    systemId: fsString(fixture.systemId),
    hostId: fsString(fixture.hostId),
    asOf: fsInt(fixture.asOf),
    position: fsVec3(fixture.position),
    velocity: fsVec3(fixture.velocity),
    emitting: fsBool(fixture.emitting ?? false),
    hullCount: fsInt(fixture.hullCount),
    hullTypes: fsStringArray(fixture.hullTypes),
    cleanSweep: fsBool(false),
  }
  const mask = Object.keys(fields).map((f) => `updateMask.fieldPaths=${encodeURIComponent(f)}`).join('&')

  const res = await fetch(`${base}?${mask}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  })
  if (!res.ok) {
    throw new Error(
      `[e2e] seedSightingFixture: PATCH ${path} failed: ${res.status} ${res.statusText} — ${await res.text()}`,
    )
  }
  return docId
}

// --- scan-control drivers ---------------------------------------------------

export interface ServedScanTarget {
  hostId: string
  kind: 'body' | 'fleet'
  durationMs: number
}

/**
 * Records every `GET .../scan-targets` response body, keyed by fleet id —
 * the wire end of "the served list IS the fixture" (link8b-impl-contract.md
 * §4.1: "Do not hand-build the target").
 */
export function captureScanTargets(page: Page): Map<string, ServedScanTarget[]> {
  const seen = new Map<string, ServedScanTarget[]>()
  page.on('response', async (res) => {
    const m = /^\/v1\/fleets\/([^/]+)\/scan-targets$/.exec(new URL(res.url()).pathname)
    if (!m || res.request().method() !== 'GET' || !res.ok()) return
    try {
      const body = (await res.json()) as { targets: ServedScanTarget[] }
      if (Array.isArray(body.targets)) seen.set(m[1], body.targets)
    } catch {
      // Not this helper's concern.
    }
  })
  return seen
}

/**
 * Opens the scan control and returns the served target with the LARGEST
 * `durationMs` — the farthest eligible host, maximising the countdown
 * window a test has to observe (link8b-impl-contract.md §4.1). Fails
 * loudly (not a skip) if the served set is empty: a freshly spawned fleet
 * with nothing in reach is a product finding.
 */
export async function openScanControlAndPickFarthestTarget(
  page: Page,
  fleetId: string,
  targetsByFleet: Map<string, ServedScanTarget[]>,
): Promise<ServedScanTarget> {
  const targets = await servedScanTargets(page, fleetId, targetsByFleet)
  return targets.reduce((a, b) => (b.durationMs > a.durationMs ? b : a))
}

/**
 * Opens the scan control and returns the served target with the SMALLEST
 * `durationMs` — the ATTACHED host (distance ~0 from a docked fleet, so only
 * the base duration applies; ≥3s per link8b-impl-contract.md, plenty to
 * observe the countdown).
 *
 * REVISED 2026-09-03 (test-dispute adjudicated: a genuine arrangement
 * defect, not a spec misread). "Farthest" is the WRONG pick for a docked
 * fleet: the farthest served target sits at (or near) the focused-scan range
 * boundary, and a live run showed exactly that host drift out of range
 * between the served-list read and the commit — the control correctly
 * rejected the commit ("That host is out of sensor range."), and the retry
 * loop then hung to this suite's own 30-minute timeout re-picking the same
 * boundary host every time. A docked fleet always has a zero-distance,
 * never-drifting target available (the attached host itself — the same
 * zero-distance guarantee the self-sweep and belt-member exclusions exploit
 * elsewhere in this suite): picking the NEAREST target is picking that host.
 */
export async function openScanControlAndPickNearestTarget(
  page: Page,
  fleetId: string,
  targetsByFleet: Map<string, ServedScanTarget[]>,
): Promise<ServedScanTarget> {
  const targets = await servedScanTargets(page, fleetId, targetsByFleet)
  return targets.reduce((a, b) => (b.durationMs < a.durationMs ? b : a))
}

/**
 * The served scan-target set for `fleetId`, waited-for and validated —
 * shared by both "pick a target" drivers above.
 */
async function servedScanTargets(
  page: Page,
  fleetId: string,
  targetsByFleet: Map<string, ServedScanTarget[]>,
): Promise<ServedScanTarget[]> {
  // Explicit timeout (SDET fix, 2026-09-03): an action with no timeout of
  // its own is bounded only by the whole test's budget, so a failure here
  // reads as a 30-minute silence instead of a fast, named one (this is
  // exactly what happened when a caller left the sighting log open and a
  // later pick hung — see scan-journey.spec.ts's own fix for the root
  // cause). The log is the console dock's Log tab now: expanded, the dock
  // covers the canvas's lowest 220 px, where `scan-control` may sit, so a
  // caller collapses the dock before picking a target.
  await page.getByTestId('scan-control').scrollIntoViewIfNeeded({ timeout: 10_000 })
  // REVISED 2026-09-03 (test-dispute adjudicated: the SDET's own bug, not a
  // spec misread). Polling on `.length > 0` could never distinguish "no
  // response captured yet" from "a response arrived with targets: []" — both
  // read as 0, so a genuinely empty (but real) served set timed out with
  // this generic message instead of ever reaching the specific, already-
  // written "EMPTY — product finding" throw two lines below. Polling on
  // `.has(fleetId)` (has a response for this fleet arrived AT ALL) lets that
  // throw fire the instant an empty set is actually served, rather than
  // masking it behind a 30s timeout.
  await expect
    .poll(() => targetsByFleet.has(fleetId), {
      timeout: 30_000,
      message: `no scan-targets response was captured for fleet ${fleetId} yet`,
    })
    .toBe(true)

  // REVISED 2026-09-03 (test-dispute adjudicated: a genuine arrangement
  // defect, not a spec misread). A caller landing right after
  // `burnToSelectionAndDock` can race the arrival's own attachment-
  // triggered scan-targets refetch: the scan control mounts and fires ITS
  // OWN read the instant it renders, which can capture the MID-BURN empty
  // response (nothing in range while under way) before the refetch that
  // follows attachment replaces it with the real, post-arrival set — the
  // `.has(fleetId)` poll above is satisfied by that first, stale, empty
  // response and never waits for a fresher one. Give a NON-EMPTY response
  // up to ~15s to arrive before accepting whatever is latest as the real
  // current set; a genuinely empty set (nothing in range at all) still
  // throws below exactly as before, just never on the strength of a
  // response captured before arrival.
  try {
    await expect
      .poll(() => (targetsByFleet.get(fleetId) ?? []).length > 0, { timeout: 15_000 })
      .toBe(true)
  } catch {
    // Still empty after waiting for a fresher read — handled by the
    // empty-set throw below, which is exactly what should fire for a
    // genuinely empty served set.
  }

  const targets = targetsByFleet.get(fleetId)!
  if (targets.length === 0) {
    throw new Error(
      `[e2e] fleet ${fleetId}'s served scan-target set is EMPTY — a freshly spawned fleet with nothing in ` +
        `reach is a product finding, not a reason to skip this journey.`,
    )
  }
  return targets
}

/** Selects `hostId` in the scan control's target select and commits the sweep. */
export async function commitScan(page: Page, hostId: string): Promise<void> {
  await page.getByTestId('scan-target-select').selectOption(hostId)
  await page.getByTestId('scan-commit-button').click()
}
