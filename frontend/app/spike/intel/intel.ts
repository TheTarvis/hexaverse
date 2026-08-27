// SPIKE — the sighting/knowledge model for /spike/intel.
//
// The question this spike answers: is "a pile of timestamped ghosts" fun to
// look at? The fog design (docs/plans/continous_space/README.md, "Fog,
// stealth & intel") replaces coverage unions with one record type — the
// SIGHTING, a timestamped fact — and two visibility bands: a passive bubble
// around your assets, and active scan pulses that mint records. This module
// is the pure half: a scripted enemy patrol (closed-form in t, riding the
// space-3d sim), the knowledge fold, and the pulse/echo solver.
//
// Pure math only — no three.js, no React, no Date.now/Math.random. Reuses
// ../space-3d/sim read-only (generation, orbits, burns); none of its command
// flow. Fixed iteration counts on every float path, same as the sim.

import {
  defaultOrbit,
  dist,
  norm,
  resolveShip,
  shipPosition,
  shipVelocity,
  solveBurn,
} from '../space-3d/sim'
import type { ShipState, SystemDef, Vec3 } from '../space-3d/sim'

// Tuning dials — all placeholder, sized against the sim's system scale
// (planets at radius ~20–150, insertion orbits ~5–11).
export const BUBBLE_RADIUS = 30 // passive live-detection range around your ship
export const SCAN_SPEED = 25 // pulse wavefront speed, u/s — a burning ship can outrun it
export const SCAN_MAX_RANGE = 240
export const PATROL_ACCEL = 8
export const PATROL_DWELL = 45 // sim-seconds parked between patrol legs

// Sim clock rendered as the gossip timestamp: "I saw it at 0:02:31".
export function fmtTime(t: number): string {
  const s = Math.max(Math.floor(t), 0)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return `${h}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

// --- the scripted patrol -----------------------------------------------------

// A deterministic enemy: dwell parked at each stop, then burn to the next,
// forever. The timeline is lazily extended (each leg's burn is solved from
// the previous leg's settled state), so the whole flight plan is a pure
// function of t — the same closed-form contract as everything else.
export interface Patrol {
  system: SystemDef
  stops: string[]
  dwell: number
  accel: number
  // segments[i] is in force for t < segments[i].until; parked segments end at
  // their departure time, burn segments at their arrival.
  segments: { until: number; state: ShipState }[]
  cursor: number // index into stops for the NEXT destination
}

export function makePatrol(
  system: SystemDef,
  stops: string[],
  dwell: number = PATROL_DWELL,
  accel: number = PATROL_ACCEL
): Patrol {
  const first: ShipState = { mode: 'idle', at: defaultOrbit(system, stops[0]) }
  return { system, stops, dwell, accel, segments: [{ until: dwell, state: first }], cursor: 1 }
}

export function patrolState(patrol: Patrol, t: number): ShipState {
  while (t >= patrol.segments[patrol.segments.length - 1].until) {
    const last = patrol.segments[patrol.segments.length - 1]
    if (last.state.mode === 'idle') {
      const depart = last.until
      const from = shipPosition(patrol.system, last.state, depart)
      const burn = solveBurn(
        patrol.system,
        from,
        { kind: 'body', bodyId: patrol.stops[patrol.cursor % patrol.stops.length] },
        depart,
        patrol.accel,
        norm(shipVelocity(patrol.system, last.state, depart))
      )
      patrol.cursor++
      patrol.segments.push({ until: burn.arrive, state: { mode: 'burn', burn } })
    } else {
      // Fold the finished burn into its insertion orbit and dwell there.
      const settled = resolveShip(patrol.system, last.state, last.until)
      patrol.segments.push({ until: last.until + patrol.dwell, state: settled })
    }
  }
  for (const seg of patrol.segments) {
    if (t < seg.until) return seg.state
  }
  return patrol.segments[patrol.segments.length - 1].state
}

export function patrolPosition(patrol: Patrol, t: number): Vec3 {
  return shipPosition(patrol.system, patrolState(patrol, t), t)
}

// --- sightings ---------------------------------------------------------------

// THE intel atom: a timestamped fact. A glimpse is position-only — worthless
// the moment they move. A track carries the captured motion state, which the
// closed-form world extrapolates PERFECTLY — until the target's next burn.
export interface Sighting {
  quality: 'glimpse' | 'track'
  origin: 'contact' | 'departure' | 'scan' // what minted it — bubble entry, bubble exit, or an echo
  asOf: number // sim time the data describes
  receivedAt: number // when you learned it (echo transit for a track)
  pos: Vec3 // subject position at asOf
  state: ShipState | null // track only: the captured motion state
}

// A glimpse just holds its last-known point (the ghost icon + age label carry
// the staleness — a growing "could-be" shell was tried and cut); a track
// extrapolates the captured state on its rail.
export function predictedPosition(system: SystemDef, sighting: Sighting, t: number): Vec3 {
  return sighting.state ? shipPosition(system, sighting.state, t) : sighting.pos
}

// --- the scan pulse ----------------------------------------------------------

// An expanding wavefront. Because the world is closed-form, the whole echo is
// solved AT EMISSION: when the front sweeps the target (asOf), what it saw,
// and when the return trip lands the record in your hands (receivedAt).
export interface Pulse {
  origin: Vec3 // frozen at emission — the pulse doesn't ride your orbit
  emittedAt: number
  echo: Sighting | null // null = clean miss, resolves at clearAt
  clearAt: number // wavefront reaches max range
}

const PULSE_MARCH_STEPS = 96
const PULSE_BISECT_ITERS = 24

export function emitPulse(system: SystemDef, patrol: Patrol, origin: Vec3, t: number): Pulse {
  const maxFlight = SCAN_MAX_RANGE / SCAN_SPEED
  const clearAt = t + maxFlight
  // Fixed-step march for the first wavefront crossing, then a capped bisect.
  // A target outrunning the sample density can slip through — fine for the
  // spike (and thematic: burns can outrun the pulse).
  const gap = (tau: number) => dist(origin, patrolPosition(patrol, t + tau)) - SCAN_SPEED * tau
  let hitTau: number | null = null
  for (let i = 1; i <= PULSE_MARCH_STEPS; i++) {
    const tau = (i / PULSE_MARCH_STEPS) * maxFlight
    if (gap(tau) <= 0) {
      let lo = ((i - 1) / PULSE_MARCH_STEPS) * maxFlight
      let hi = tau
      for (let k = 0; k < PULSE_BISECT_ITERS; k++) {
        const mid = (lo + hi) / 2
        if (gap(mid) <= 0) hi = mid
        else lo = mid
      }
      hitTau = hi
      break
    }
  }
  if (hitTau === null) return { origin, emittedAt: t, echo: null, clearAt }

  const asOf = t + hitTau
  const state = resolveShip(system, patrolState(patrol, asOf), asOf)
  const pos = shipPosition(system, state, asOf)
  return {
    origin,
    emittedAt: t,
    clearAt,
    echo: { quality: 'track', origin: 'scan', asOf, receivedAt: asOf + dist(origin, pos) / SCAN_SPEED, pos, state },
  }
}

// --- the knowledge fold ------------------------------------------------------

// Everything you know about the enemy: live contact (in-bubble right now),
// the latest sighting (what the ghost renders), the record log (the sighting
// cards — the sellable-intel UI preview), and the in-flight pulse.
export interface Knowledge {
  live: boolean
  latest: Sighting | null
  log: Sighting[] // newest first, capped
  pulse: Pulse | null
}

export type IntelEvent = 'contact' | 'lost' | 'echo' | 'scan-clear'

export const emptyKnowledge = (): Knowledge => ({ live: false, latest: null, log: [], pulse: null })

const LOG_CAP = 12

export function inBubble(system: SystemDef, patrol: Patrol, you: ShipState, t: number): boolean {
  return dist(shipPosition(system, you, t), patrolPosition(patrol, t)) <= BUBBLE_RADIUS
}

// Bubble transitions are found by sweeping FIXED samples across the interval
// since the previous step — a fast ship can cross the whole bubble between
// two 5 Hz ticks (especially at 64× time), and a silent ship that transited
// your passive bubble MUST still be flagged. A transit faster than the sample
// spacing can still slip through; fine for the spike.
const SWEEP_SAMPLES = 24

// One knowledge step covering (prevT, t]. Sighting positions are sampled, not
// exact crossings — good enough for the spike.
export function stepKnowledge(
  system: SystemDef,
  patrol: Patrol,
  you: ShipState,
  knowledge: Knowledge,
  t: number,
  prevT: number = t
): { knowledge: Knowledge; events: IntelEvent[] } {
  const events: IntelEvent[] = []
  let { live, latest, log, pulse } = knowledge

  const mint = (origin: 'contact' | 'departure', asOf: number) => {
    const sighting: Sighting = {
      quality: 'glimpse',
      origin,
      asOf,
      receivedAt: asOf,
      pos: patrolPosition(patrol, asOf),
      state: null,
    }
    latest = sighting
    log = [sighting, ...log].slice(0, LOG_CAP)
  }

  const span = Math.max(t - prevT, 0)
  const times =
    span > 0 ? Array.from({ length: SWEEP_SAMPLES + 1 }, (_, i) => prevT + (span * i) / SWEEP_SAMPLES) : [t]
  const inside = times.map((ts) => inBubble(system, patrol, you, ts))
  const nowIn = inside[inside.length - 1]

  if (!live) {
    const entry = inside.findIndex(Boolean)
    if (entry >= 0) {
      events.push('contact')
      mint('contact', times[entry])
      if (nowIn) {
        live = true
      } else {
        // The whole transit happened between ticks: flag the departure too.
        let lastIn = entry
        while (lastIn + 1 < inside.length && inside[lastIn + 1]) lastIn++
        events.push('lost')
        mint('departure', times[lastIn])
      }
    }
  } else if (!nowIn) {
    // Was live at prevT; walk forward to the last sampled in-bubble moment.
    let lastIn = 0
    while (lastIn + 1 < inside.length && inside[lastIn + 1]) lastIn++
    live = false
    events.push('lost')
    mint('departure', times[lastIn])
  }

  if (pulse) {
    if (pulse.echo && t >= pulse.echo.receivedAt) {
      latest = pulse.echo
      log = [pulse.echo, ...log].slice(0, LOG_CAP)
      pulse = null
      events.push('echo')
    } else if (!pulse.echo && t >= pulse.clearAt) {
      pulse = null
      events.push('scan-clear')
    }
  }

  return { knowledge: { live, latest, log, pulse }, events }
}
