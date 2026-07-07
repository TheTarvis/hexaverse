'use client'

// SPIKE (throwaway) — SVG hex board for a single solar system's interior, now
// with the MOVEMENT verb from docs/plans/movement-board.md wired on top of the
// orbital model from docs/plans/hex-board.md. Stands in for the future
// `/spec system-interior` + `/spec movement-board` renderers so we can eyeball
// coast-&-thrust before the real thing exists.
//
// ORBITS (prototype): star fixed at center; planets/belts walk their hex ring's
// perimeter over time, QUANTIZED to the grid; inner rings step faster (differential
// rotation → conjunctions/windows). Moons ride their parent. Deterministic — any
// future position is exactly computable, which is what makes assisted intercept
// possible. Bodies dim outside the ship's scan bubble (fog, docs/plans/fog-of-war.md).
//
// MOVEMENT (this upgrade — replaces the old "thrust = hold position" stand-in):
//   • Coast = the resting state — ride your current orbit for free.
//   • Click a HEX  → plot a burn path, preview route + ETA, commit; the ship
//                     travels hex-by-hex over sim-time and COASTS the local orbit
//                     on arrival. (movement-board §"What thrust is")
//   • Click a BODY → because it's moving, you commit to an INTERCEPT: the game
//                     LEADS the target (its future position is deterministic),
//                     draws the predicted meeting point + ETA, burns to it, and
//                     DOCKS (rides the body, station-keeping free) on arrival.
//   • Re-task or Cancel underway; a cancelled burn resumes coasting from wherever
//     the ship is. Model = "game plots the path," not a physics/delta-v sim
//     (movement-board §"a game model, not a physics sim").
// Route: /spike/hex-board

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  generateMockSystem,
  hexDistance,
  ringOf,
  type Axial,
  type Body,
  type BodyType,
  type Band,
  type ResourceKind,
  type Tile,
} from './mock-system'

// pointy-top axial → pixel
const SIZE = 34
function hexToPixel(q: number, r: number) {
  return { x: SIZE * Math.sqrt(3) * (q + r / 2), y: SIZE * (3 / 2) * r }
}
function hexPoints(cx: number, cy: number, size: number): string {
  const pts: string[] = []
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30)
    pts.push(`${(cx + size * Math.cos(a)).toFixed(2)},${(cy + size * Math.sin(a)).toFixed(2)}`)
  }
  return pts.join(' ')
}
function toPts(hexes: Axial[]): string {
  return hexes
    .map((h) => {
      const p = hexToPixel(h.q, h.r)
      return `${p.x.toFixed(1)},${p.y.toFixed(1)}`
    })
    .join(' ')
}

// the 6 axial directions, and the ordered perimeter of the ring at distance R
const DIRS: Axial[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
]
function hexRing(R: number): Axial[] {
  if (R <= 0) return [{ q: 0, r: 0 }]
  const out: Axial[] = []
  let h: Axial = { q: DIRS[4].q * R, r: DIRS[4].r * R }
  for (let side = 0; side < 6; side++) {
    for (let step = 0; step < R; step++) {
      out.push(h)
      h = { q: h.q + DIRS[side].q, r: h.r + DIRS[side].r }
    }
  }
  return out
}

// straight hex line (cube lerp + round) — the burn path from ship to destination
function cubeRound(x: number, y: number, z: number): Axial {
  let rx = Math.round(x)
  let ry = Math.round(y)
  let rz = Math.round(z)
  const dx = Math.abs(rx - x)
  const dy = Math.abs(ry - y)
  const dz = Math.abs(rz - z)
  if (dx > dy && dx > dz) rx = -ry - rz
  else if (dy > dz) ry = -rx - rz
  else rz = -rx - ry
  return { q: rx, r: rz }
}
function hexLine(a: Axial, b: Axial): Axial[] {
  const N = hexDistance(a, b)
  if (N === 0) return [{ q: a.q, r: a.r }]
  const ax = a.q
  const az = a.r
  const ay = -a.q - a.r
  const bx = b.q
  const bz = b.r
  const by = -b.q - b.r
  const out: Axial[] = []
  for (let i = 0; i <= N; i++) {
    const t = i / N
    out.push(cubeRound(ax + (bx - ax) * t, ay + (by - ay) * t, az + (bz - az) * t))
  }
  return out
}

const BAND: Record<Band, { label: string; tint: string }> = {
  core: { label: 'Star', tint: '#ffd27d' },
  inner: { label: 'Inner (hot · metals)', tint: '#ff9a5c' },
  mid: { label: 'Mid (goldilocks)', tint: '#63e6a8' },
  outer: { label: 'Outer (cold · ice/gas)', tint: '#6ea0e6' },
}

const BODY: Record<BodyType, { label: string; color: string; glyph: 'disc' | 'giant' | 'diamond' | 'square' | 'dots' | 'star' }> = {
  star: { label: 'Star', color: '#ffd27d', glyph: 'star' },
  rocky: { label: 'Rocky planet', color: '#c98a5e', glyph: 'disc' },
  gas_giant: { label: 'Gas giant', color: '#d9a86a', glyph: 'giant' },
  ice: { label: 'Ice body', color: '#a9d8f0', glyph: 'disc' },
  belt: { label: 'Asteroid belt', color: '#9aa3b0', glyph: 'dots' },
  moon: { label: 'Moon', color: '#cfd6de', glyph: 'disc' },
  anomaly: { label: 'Anomaly', color: '#f472b6', glyph: 'diamond' },
  ruin: { label: 'Derelict / ruin', color: '#c4b5fd', glyph: 'square' },
}

const RES_LABEL: Record<ResourceKind, string> = {
  metals: 'Metals',
  volatiles: 'Volatiles',
  water: 'Water / ice',
  organics: 'Organics',
  research: 'Research',
  exotic: 'Exotic',
}

const HAZARD_LABEL: Record<string, string> = {
  radiation: 'Radiation',
  nebula: 'Nebula (scan −)',
  gravity_well: 'Gravity well',
  debris: 'Debris',
}

function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

// --- orbital / movement tuning ------------------------------------------------
const SPEED_BASE = 0.7 // phase units advanced per second at ×1
const SPEEDS = [0.5, 1, 2, 4]
const BURN_SPEED = 1.4 // ship burn rate, hexes per phase-unit (faster than any orbit)
const INTERCEPT_STEP = 0.25 // search granularity when leading a moving target
const MIN_PER_PHASE = 6 // mock: 1 orbit-t ≈ 6 sim-minutes, just to sell the async ETA

interface Orbiter {
  id: string
  body: Body
  ring: number
  ringHexes: Axial[]
  i0: number // starting index on the ring
  parent?: { id: string; dq: number; dr: number } // moons ride a parent
}

// Position of a body this frame. Motion is QUANTIZED for logic — `q,r` is the
// integer hex the body occupies (used by fog/selection/intercept) — but the pixel
// `x,y` is INTERPOLATED between the current hex and the next so the glyph glides.
interface OState {
  q: number
  r: number
  x: number
  y: number
}
function orbState(orb: Orbiter, phase: number, byId: Map<string, Orbiter>): OState {
  if (orb.parent) {
    const p = byId.get(orb.parent.id)
    const base = p ? orbState(p, phase, byId) : hexOState(orb.ringHexes[orb.i0])
    const off = hexToPixel(orb.parent.dq, orb.parent.dr)
    return { q: base.q + orb.parent.dq, r: base.r + orb.parent.dr, x: base.x + off.x, y: base.y + off.y }
  }
  const n = orb.ringHexes.length
  if (n <= 1) return hexOState(orb.ringHexes[0])
  const f = orb.i0 + phase / orb.ring
  const i = Math.floor(f)
  const frac = f - i
  const a = orb.ringHexes[((i % n) + n) % n]
  const b = orb.ringHexes[(((i + 1) % n) + n) % n]
  const pa = hexToPixel(a.q, a.r)
  const pb = hexToPixel(b.q, b.r)
  const near = frac < 0.5 ? a : b // logical hex = nearest of the two
  return { q: near.q, r: near.r, x: pa.x + (pb.x - pa.x) * frac, y: pa.y + (pb.y - pa.y) * frac }
}
function hexOState(h: Axial): OState {
  const p = hexToPixel(h.q, h.r)
  return { q: h.q, r: h.r, x: p.x, y: p.y }
}

// Assisted intercept — the deterministic "lead the target" solve. Walk future
// phase-steps; the first moment the ship (burning from `startHex` at BURN_SPEED)
// could already be there is the meeting. Because orbits are computable, this is
// exact truth, not an estimate. Returns the meet hex + arrival phase.
function solveIntercept(startHex: Axial, orb: Orbiter, startPhase: number, byId: Map<string, Orbiter>, radius: number) {
  const horizon = (2 * radius) / BURN_SPEED + 80
  for (let dP = 0; dP <= horizon; dP += INTERCEPT_STEP) {
    const P = startPhase + dP
    const s = orbState(orb, P, byId)
    const dist = hexDistance(startHex, { q: s.q, r: s.r })
    if (dist / BURN_SPEED <= dP) return { arrivePhase: P, meetHex: { q: s.q, r: s.r }, dist, reachable: true }
  }
  const s = orbState(orb, startPhase, byId)
  return { arrivePhase: startPhase, meetHex: { q: s.q, r: s.r }, dist: hexDistance(startHex, { q: s.q, r: s.r }), reachable: false }
}

// --- the ship: a small state machine (coast / burn / docked) ------------------
type Sel = { kind: 'body'; id: string } | { kind: 'tile'; q: number; r: number } | null

type ShipMode =
  | { kind: 'coast'; ring: number; ringHexes: Axial[]; i0: number; phase0: number }
  | { kind: 'burn'; path: Axial[]; startPhase: number; arrivePhase: number; dockBodyId?: string; target: Sel; label: string }
  | { kind: 'docked'; bodyId: string }

interface Plan {
  kind: 'intercept' | 'burn'
  path: Axial[]
  meetHex: Axial
  startPhase: number
  arrivePhase: number
  dist: number
  reachable: boolean
  dockBodyId?: string
  label: string
}

function shipPosAt(mode: ShipMode, phase: number, byId: Map<string, Orbiter>): OState {
  if (mode.kind === 'coast') {
    const { ring, ringHexes, i0, phase0 } = mode
    const n = ringHexes.length
    if (n <= 1 || ring <= 0) return hexOState(ringHexes[0])
    const f = i0 + (phase - phase0) / ring
    const i = Math.floor(f)
    const frac = f - i
    const a = ringHexes[((i % n) + n) % n]
    const b = ringHexes[(((i + 1) % n) + n) % n]
    const pa = hexToPixel(a.q, a.r)
    const pb = hexToPixel(b.q, b.r)
    const near = frac < 0.5 ? a : b
    return { q: near.q, r: near.r, x: pa.x + (pb.x - pa.x) * frac, y: pa.y + (pb.y - pa.y) * frac }
  }
  if (mode.kind === 'burn') {
    const { path, startPhase, arrivePhase } = mode
    const len = path.length
    if (len <= 1) return hexOState(path[0])
    const dur = arrivePhase - startPhase
    const frac = dur <= 0 ? 1 : Math.max(0, Math.min(1, (phase - startPhase) / dur))
    const f = frac * (len - 1)
    const i = Math.min(Math.floor(f), len - 2)
    const t = f - i
    const a = path[i]
    const b = path[i + 1]
    const pa = hexToPixel(a.q, a.r)
    const pb = hexToPixel(b.q, b.r)
    const near = t < 0.5 ? a : b
    return { q: near.q, r: near.r, x: pa.x + (pb.x - pa.x) * t, y: pa.y + (pb.y - pa.y) * t }
  }
  const orb = byId.get(mode.bodyId)
  if (!orb) return hexOState({ q: 0, r: 0 })
  return orbState(orb, phase, byId)
}

function sameSel(a: Sel, b: Sel): boolean {
  if (!a || !b) return false
  if (a.kind === 'body' && b.kind === 'body') return a.id === b.id
  if (a.kind === 'tile' && b.kind === 'tile') return a.q === b.q && a.r === b.r
  return false
}

export default function HexBoardSpikePage() {
  const system = useMemo(() => generateMockSystem(), [])

  // static pixel layout + fit viewBox
  const laid = useMemo(() => {
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    const withPx = system.tiles.map((t) => {
      const { x, y } = hexToPixel(t.q, t.r)
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
      return { t, x, y }
    })
    const pad = SIZE * 1.4
    const fit = { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 }
    return { withPx, fit }
  }, [system])

  const tileByKey = useMemo(() => {
    const m = new Map<string, Tile>()
    for (const t of system.tiles) m.set(`${t.q},${t.r}`, t)
    return m
  }, [system])

  // build orbiters from the generated bodies (star fixed, planets/belts orbit,
  // moons ride their planet)
  const { orbiters, orbById, trackRings } = useMemo(() => {
    const list: Orbiter[] = []
    const moonTiles: Tile[] = []
    for (const t of system.tiles) {
      if (!t.body) continue
      if (t.body.type === 'star') {
        list.push({ id: t.body.id, body: t.body, ring: 0, ringHexes: [{ q: 0, r: 0 }], i0: 0 })
      } else if (t.body.type === 'moon') {
        moonTiles.push(t)
      } else {
        const ringHexes = hexRing(t.ring)
        const i0 = Math.max(0, ringHexes.findIndex((h) => h.q === t.q && h.r === t.r))
        list.push({ id: t.body.id, body: t.body, ring: t.ring, ringHexes, i0 })
      }
    }
    const byId = new Map(list.map((o) => [o.id, o]))
    for (const t of moonTiles) {
      const parentId = t.body!.id.replace('moon-', 'planet-')
      const parent = byId.get(parentId)
      const pStart = parent ? parent.ringHexes[parent.i0] : { q: t.q, r: t.r }
      const orb: Orbiter = {
        id: t.body!.id,
        body: t.body!,
        ring: t.ring,
        ringHexes: [{ q: t.q, r: t.r }],
        i0: 0,
        parent: { id: parentId, dq: t.q - pStart.q, dr: t.r - pStart.r },
      }
      list.push(orb)
      byId.set(orb.id, orb)
    }
    const rings = Array.from(new Set(list.filter((o) => !o.parent && o.ring >= 1).map((o) => o.ring))).sort((a, b) => a - b)
    return { orbiters: list, orbById: byId, trackRings: rings }
  }, [system])

  // faint orbit-track hexagons (one per occupied ring)
  const trackPts = useMemo(
    () =>
      trackRings.map((R) => ({
        R,
        pts: toPts(hexRing(R)),
      })),
    [trackRings],
  )

  // --- animation clock --------------------------------------------------------
  const [phase, setPhase] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [speedIdx, setSpeedIdx] = useState(1)
  const rafRef = useRef<number | undefined>(undefined)
  const lastRef = useRef<number | undefined>(undefined)
  const phaseRef = useRef(0)
  const speed = SPEEDS[speedIdx]

  // --- the ship's mode --------------------------------------------------------
  // Starts COASTING on the rim orbit at the inbound-lane entry tile.
  const [shipMode, setShipMode] = useState<ShipMode>(() => {
    const ring = system.radius
    const ringHexes = hexRing(ring)
    const i0 = Math.max(0, ringHexes.findIndex((h) => h.q === system.entry.q && h.r === system.entry.r))
    return { kind: 'coast', ring, ringHexes, i0, phase0: 0 }
  })
  const shipModeRef = useRef(shipMode)
  shipModeRef.current = shipMode

  // A committed burn resolves over sim-time. When the clock reaches its arrival
  // phase we transition: DOCK (ride the body) for an intercept, else COAST the
  // orbit of whatever hex we settled on. (movement-board §"a queued action".)
  const maybeArrive = useCallback(() => {
    const m = shipModeRef.current
    if (m.kind !== 'burn') return
    if (phaseRef.current < m.arrivePhase) return
    if (m.dockBodyId) {
      setShipMode({ kind: 'docked', bodyId: m.dockBodyId })
      return
    }
    const dest = m.path[m.path.length - 1]
    const ring = ringOf(dest)
    if (ring <= 0) {
      setShipMode({ kind: 'coast', ring: 0, ringHexes: [{ q: 0, r: 0 }], i0: 0, phase0: m.arrivePhase })
      return
    }
    const ringHexes = hexRing(ring)
    const i0 = Math.max(0, ringHexes.findIndex((h) => h.q === dest.q && h.r === dest.r))
    setShipMode({ kind: 'coast', ring, ringHexes, i0, phase0: m.arrivePhase })
  }, [])

  useEffect(() => {
    if (!playing) return
    const tick = (ts: number) => {
      if (lastRef.current !== undefined) {
        const dp = ((ts - lastRef.current) / 1000) * speed * SPEED_BASE
        phaseRef.current += dp
        setPhase(phaseRef.current)
        maybeArrive()
      }
      lastRef.current = ts
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      lastRef.current = undefined
    }
  }, [playing, speed, maybeArrive])

  const stepForward = () => {
    phaseRef.current += 1
    setPhase(phaseRef.current)
    maybeArrive()
  }

  // ship position this frame + nose direction (from velocity, works in every mode)
  const shipState = shipPosAt(shipMode, phase, orbById)
  const shipHex = { q: shipState.q, r: shipState.r }
  const shipDeg = useMemo(() => {
    const ahead = shipPosAt(shipMode, phase + 0.05, orbById)
    const vx = ahead.x - shipState.x
    const vy = ahead.y - shipState.y
    if (Math.hypot(vx, vy) < 1e-3) return (Math.atan2(shipState.y, shipState.x) * 180) / Math.PI + 90
    return (Math.atan2(vy, vx) * 180) / Math.PI + 90
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shipMode, phase, shipState.x, shipState.y])

  // positions this frame — fog (dim) is measured from the ship's live hex
  const positioned = useMemo(
    () =>
      orbiters.map((orb) => {
        const s = orbState(orb, phase, orbById)
        const dim = hexDistance({ q: s.q, r: s.r }, shipHex) > system.scanRadius
        return { orb, ...s, dim }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orbiters, orbById, phase, system, shipHex.q, shipHex.r],
  )
  const posByKey = useMemo(() => {
    const m = new Map<string, (typeof positioned)[number]>()
    for (const p of positioned) m.set(`${p.q},${p.r}`, p)
    return m
  }, [positioned])

  // --- selection --------------------------------------------------------------
  const [sel, setSel] = useState<Sel>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const moved = useRef(0)
  const selBodyOrb = sel?.kind === 'body' ? orbById.get(sel.id) : undefined
  const selEntry = sel?.kind === 'body' ? positioned.find((p) => p.orb.id === sel.id) : undefined
  const selQR = selEntry ? { q: selEntry.q, r: selEntry.r } : sel?.kind === 'tile' ? { q: sel.q, r: sel.r } : undefined
  const selTile = selQR ? tileByKey.get(`${selQR.q},${selQR.r}`) : undefined
  const selBodyHere = sel?.kind === 'body' ? selBodyOrb?.body : selQR ? posByKey.get(`${selQR.q},${selQR.r}`)?.orb.body : undefined
  const clickTile = (t: Tile) => {
    if (moved.current >= 6) return
    // click the already-selected tile again → deselect (toggle)
    setSel((prev) => (prev?.kind === 'tile' && prev.q === t.q && prev.r === t.r ? null : { kind: 'tile', q: t.q, r: t.r }))
  }
  const clickBody = (id: string) => {
    if (moved.current >= 6) return
    setSel((prev) => (prev?.kind === 'body' && prev.id === id ? null : { kind: 'body', id }))
  }

  // --- movement plan (live preview for the current selection) -----------------
  // Recomputed every frame so an intercept LEADS the target visibly — the marker
  // tracks the meeting point as the world turns. Commit freezes it into a burn.
  const computePlan = (s: Sel, from: Axial, ph: number): Plan | null => {
    if (!s) return null
    if (s.kind === 'body') {
      const orb = orbById.get(s.id)
      if (!orb) return null
      const r = solveIntercept(from, orb, ph, orbById, system.radius)
      return {
        kind: 'intercept',
        path: hexLine(from, r.meetHex),
        meetHex: r.meetHex,
        startPhase: ph,
        arrivePhase: r.arrivePhase,
        dist: r.dist,
        reachable: r.reachable,
        dockBodyId: s.id,
        label: orb.body.name,
      }
    }
    const target = { q: s.q, r: s.r }
    const dist = hexDistance(from, target)
    return {
      kind: 'burn',
      path: hexLine(from, target),
      meetHex: target,
      startPhase: ph,
      arrivePhase: ph + dist / BURN_SPEED,
      dist,
      reachable: true,
      label: `hex ${s.q},${s.r}`,
    }
  }
  const plan = computePlan(sel, shipHex, phase)

  const commitPlan = (p: Plan) => {
    if (!p.reachable || p.dist === 0) return
    setShipMode(
      p.kind === 'intercept'
        ? { kind: 'burn', path: p.path, startPhase: p.startPhase, arrivePhase: p.arrivePhase, dockBodyId: p.dockBodyId, target: { kind: 'body', id: p.dockBodyId! }, label: p.label }
        : { kind: 'burn', path: p.path, startPhase: p.startPhase, arrivePhase: p.arrivePhase, target: { kind: 'tile', q: p.meetHex.q, r: p.meetHex.r }, label: p.label },
    )
    setSel(null) // orders given — clear the selection
  }
  const coastFromHere = () => {
    const ring = ringOf(shipHex)
    if (ring <= 0) {
      setShipMode({ kind: 'coast', ring: 0, ringHexes: [{ q: 0, r: 0 }], i0: 0, phase0: phaseRef.current })
      return
    }
    const ringHexes = hexRing(ring)
    const i0 = Math.max(0, ringHexes.findIndex((h) => h.q === shipHex.q && h.r === shipHex.r))
    setShipMode({ kind: 'coast', ring, ringHexes, i0, phase0: phaseRef.current })
  }

  // ship-mode derived facts for status + inspector
  const burning = shipMode.kind === 'burn'
  const burnTarget: Sel = burning ? shipMode.target : null
  const isBurningToSel = burning && sameSel(sel, burnTarget)
  const isDockedToSel = shipMode.kind === 'docked' && sel?.kind === 'body' && sel.id === shipMode.bodyId
  const burnEtaMin = burning ? Math.max(0, Math.round((shipMode.arrivePhase - phase) * MIN_PER_PHASE)) : 0
  const burnFrac = burning ? Math.max(0, Math.min(1, (phase - shipMode.startPhase) / Math.max(1e-6, shipMode.arrivePhase - shipMode.startPhase))) : 0
  const dockedName = shipMode.kind === 'docked' ? orbById.get(shipMode.bodyId)?.body.name : undefined
  const accent = shipMode.kind === 'burn' ? '#fbbf24' : shipMode.kind === 'docked' ? '#34d399' : '#7dd3fc'

  // --- pan / zoom -------------------------------------------------------------
  const [view, setView] = useState(() => laid.fit)
  const drag = useRef<{ x: number; y: number } | null>(null)
  const clampW = (w: number) => Math.max(laid.fit.w / 12, Math.min(laid.fit.w * 1.5, w))

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = svg.getBoundingClientRect()
      setView((v) => {
        const mx = v.x + ((e.clientX - rect.left) / rect.width) * v.w
        const my = v.y + ((e.clientY - rect.top) / rect.height) * v.h
        const step = Math.exp(Math.max(-0.5, Math.min(0.5, e.deltaY * 0.002)) * 0.6)
        const nw = clampW(v.w * step)
        const scale = nw / v.w
        return { x: mx - (mx - v.x) * scale, y: my - (my - v.y) * scale, w: nw, h: v.h * scale }
      })
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [laid.fit])

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    drag.current = { x: e.clientX, y: e.clientY }
    moved.current = 0
  }
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!drag.current || !svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    const dx = ((e.clientX - drag.current.x) / rect.width) * view.w
    const dy = ((e.clientY - drag.current.y) / rect.height) * view.h
    moved.current += Math.abs(e.clientX - drag.current.x) + Math.abs(e.clientY - drag.current.y)
    drag.current = { x: e.clientX, y: e.clientY }
    setView((v) => ({ ...v, x: v.x - dx, y: v.y - dy }))
  }
  const onPointerUp = () => {
    drag.current = null
  }
  const zoomBy = (factor: number) =>
    setView((v) => {
      const cx = v.x + v.w / 2
      const cy = v.y + v.h / 2
      const nw = clampW(v.w * factor)
      const nh = v.h * (nw / v.w)
      return { x: cx - nw / 2, y: cy - nh / 2, w: nw, h: nh }
    })

  // static terrain layer — memoized so it doesn't re-render every frame.
  const terrain = useMemo(
    () => (
      <>
        {laid.withPx.map(({ t, x, y }) => {
          const tint = BAND[t.band].tint
          const fillA = t.band === 'mid' ? 0.09 : 0.06
          return (
            <polygon
              key={`t-${t.q},${t.r}`}
              points={hexPoints(x, y, SIZE - 1)}
              fill={rgba(tint, fillA)}
              stroke={rgba(tint, 0.2)}
              strokeWidth={1}
              className="cursor-pointer transition-colors hover:fill-white/10"
              onClick={() => clickTile(t)}
            />
          )
        })}
        {laid.withPx.map(({ t, x, y }) =>
          t.hazard ? (
            <circle
              key={`h-${t.q},${t.r}`}
              cx={x + SIZE * 0.55}
              cy={y - SIZE * 0.75}
              r={3}
              fill={t.hazard === 'nebula' ? '#f472b6' : t.hazard === 'radiation' ? '#fbbf24' : '#94a3b8'}
              opacity={0.75}
              pointerEvents="none"
            />
          ) : null,
        )}
      </>
    ),
    [laid],
  )

  // live scan bubble — hexes within scan range of the ship's current hex
  const scanHexes = laid.withPx.filter(({ t }) => hexDistance({ q: t.q, r: t.r }, shipHex) <= system.scanRadius)

  // faint dashed track for the ship's current coast orbit (only while coasting)
  const coastTrackPts = shipMode.kind === 'coast' && shipMode.ring >= 1 ? toPts(hexRing(shipMode.ring)) : null

  // preview geometry (suppress when the plan just mirrors the active burn)
  const showPreview = !!plan && plan.reachable && plan.dist > 0 && !isBurningToSel && !isDockedToSel
  const meetPx = plan ? hexToPixel(plan.meetHex.q, plan.meetHex.r) : { x: 0, y: 0 }
  const planEtaMin = plan ? Math.max(0, Math.round((plan.arrivePhase - phase) * MIN_PER_PHASE)) : 0

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#05070d] text-white">
      <div className="absolute inset-0" style={{ background: 'radial-gradient(120% 90% at 50% 45%, rgba(60,80,140,0.10), rgba(5,7,13,0) 60%)' }} />

      <svg
        ref={svgRef}
        className="absolute inset-0 h-full w-full cursor-grab active:cursor-grabbing"
        style={{ touchAction: 'none' }}
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <defs>
          <radialGradient id="starGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fff7e0" stopOpacity="1" />
            <stop offset="30%" stopColor="#ffd27d" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#ffd27d" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* static terrain */}
        {terrain}

        {/* live scan bubble (follows the ship) */}
        {scanHexes.map(({ t, x, y }) => (
          <polygon key={`scan-${t.q},${t.r}`} points={hexPoints(x, y, SIZE - 1)} fill="rgba(125,211,252,0.06)" stroke="rgba(125,211,252,0.3)" strokeWidth={1} pointerEvents="none" />
        ))}

        {/* orbit tracks (predicted paths) */}
        {trackPts.map(({ R, pts }) => (
          <polygon
            key={`track-${R}`}
            points={pts}
            fill="none"
            stroke={selBodyOrb?.ring === R ? 'rgba(125,211,252,0.55)' : 'rgba(150,180,220,0.10)'}
            strokeWidth={selBodyOrb?.ring === R ? 1.6 : 1}
            pointerEvents="none"
          />
        ))}
        {/* the ship's own coast orbit */}
        {coastTrackPts && <polygon points={coastTrackPts} fill="none" stroke="rgba(125,211,252,0.16)" strokeWidth={1} strokeDasharray="4 5" pointerEvents="none" />}

        {/* active burn path — committed route the ship is flying now */}
        {burning && (
          <>
            <polyline points={toPts(shipMode.path)} fill="none" stroke="rgba(251,191,36,0.35)" strokeWidth={1.4} pointerEvents="none" />
            <polyline points={toPts([shipHex, shipMode.path[shipMode.path.length - 1]])} fill="none" stroke="rgba(251,191,36,0.15)" strokeWidth={1} strokeDasharray="2 4" pointerEvents="none" />
          </>
        )}

        {/* movement PREVIEW — dashed route + led meeting point + ETA for the
            current selection (assisted intercept for a body; direct for a hex) */}
        {showPreview && plan && (
          <g pointerEvents="none">
            <polyline points={toPts(plan.path)} fill="none" stroke="rgba(125,211,252,0.55)" strokeWidth={1.5} strokeDasharray="5 4" />
            <circle cx={meetPx.x} cy={meetPx.y} r={SIZE * 0.5} fill="none" stroke="#fbbf24" strokeWidth={1.4} strokeDasharray="3 3" opacity={0.9} />
            <line x1={meetPx.x - 6} y1={meetPx.y} x2={meetPx.x + 6} y2={meetPx.y} stroke="#fbbf24" strokeWidth={1.2} />
            <line x1={meetPx.x} y1={meetPx.y - 6} x2={meetPx.x} y2={meetPx.y + 6} stroke="#fbbf24" strokeWidth={1.2} />
            <text x={meetPx.x} y={meetPx.y - SIZE * 0.72} fill="#fde68a" fontSize={11} textAnchor="middle" className="font-mono">
              {plan.kind === 'intercept' ? 'LEAD' : 'DEST'} · ≈{planEtaMin}m · {plan.dist}h
            </text>
          </g>
        )}

        {/* selection highlight — circle glides with a body, hex outline for a tile */}
        {selEntry ? (
          <circle cx={selEntry.x} cy={selEntry.y} r={SIZE * 0.62} fill="none" stroke="#ffffff" strokeWidth={2} pointerEvents="none" />
        ) : sel?.kind === 'tile' ? (
          <polygon points={hexPoints(hexToPixel(sel.q, sel.r).x, hexToPixel(sel.q, sel.r).y, SIZE - 1)} fill="none" stroke="#ffffff" strokeWidth={2} pointerEvents="none" />
        ) : null}

        {/* moving bodies */}
        {positioned.map(({ orb, x, y, dim }) => (
          <BodyGlyph key={`b-${orb.id}`} type={orb.body.type} x={x} y={y} dim={dim} onClick={() => clickBody(orb.id)} />
        ))}

        {/* the player's ship — coast (cyan) / burn (amber, thruster lit) / docked (green) */}
        <g transform={`translate(${shipState.x}, ${shipState.y})`} pointerEvents="none">
          <circle r={SIZE * 0.42} fill="none" stroke={accent} strokeWidth={1.5} opacity={0.85} />
          {shipMode.kind === 'docked' && <circle r={SIZE * 0.52} fill="none" stroke={accent} strokeWidth={1} strokeDasharray="2 3" opacity={0.6} />}
          <g transform={`rotate(${shipDeg})`}>
            {burning && <path d="M 0,9 L 4,20 L 0,16 L -4,20 Z" fill="#fbbf24" opacity={0.9} />}
            <path d="M 0,-9 L 6,8 L 0,4 L -6,8 Z" fill={burning ? '#fde68a' : accent} />
          </g>
        </g>
      </svg>

      {/* --- title --- */}
      <div className="pointer-events-none absolute left-6 top-5">
        <div className="font-mono text-[11px] tracking-[0.35em] text-white/40">HEXAVERSE</div>
        <div className="font-mono text-lg tracking-[0.25em] text-white/85">
          SYSTEM // {system.name.toUpperCase()} · {system.starClass}-CLASS
        </div>
      </div>

      {/* --- left: system intel --- */}
      <aside className="absolute left-6 top-24 w-64 rounded-xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-md">
        <h2 className="mb-3 font-mono text-[10px] tracking-[0.3em] text-white/45">SYSTEM INTEL</h2>
        <div className="grid grid-cols-2 gap-2">
          <StatTile label="Bodies" value={orbiters.filter((o) => o.body.type !== 'belt').length} />
          <StatTile label="Orbits" value={trackRings.length} />
          <StatTile label="Char" value={system.character.replace('_', ' ')} />
          <StatTile label="Orbit-t" value={phase.toFixed(0)} />
        </div>
        <h3 className="mb-2 mt-4 font-mono text-[10px] tracking-[0.3em] text-white/45">ORBITAL BANDS</h3>
        <ul className="space-y-1.5">
          {(['inner', 'mid', 'outer'] as Band[]).map((b) => (
            <li key={b} className="flex items-center gap-2 text-xs">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: BAND[b].tint, boxShadow: `0 0 8px ${BAND[b].tint}` }} />
              <span className="text-white/70">{BAND[b].label}</span>
            </li>
          ))}
        </ul>
      </aside>

      {/* --- right: tile / body inspector + movement orders --- */}
      <aside className="absolute right-6 top-24 w-72 rounded-xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-md">
        <h2 className="mb-3 font-mono text-[10px] tracking-[0.3em] text-white/45">{sel?.kind === 'body' ? 'BODY' : 'TILE'}</h2>
        {!sel || !selTile ? (
          <p className="text-sm text-white/40">Select a body to intercept &amp; dock, or a hex to burn to.</p>
        ) : (
          <div>
            {selBodyHere ? (
              <>
                <div className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded-full" style={{ background: BODY[selBodyHere.type].color, boxShadow: `0 0 8px ${BODY[selBodyHere.type].color}` }} />
                  <span className="text-lg text-white/90">{selBodyHere.name}</span>
                </div>
                <div className="mt-1 text-[11px] text-white/50">{BODY[selBodyHere.type].label}</div>
              </>
            ) : (
              <div className="text-lg text-white/60">Empty space</div>
            )}

            <dl className="mt-3 space-y-1 font-mono text-[11px] text-white/50">
              <div className="flex justify-between">
                <dt>band</dt>
                <dd className="text-white/70">{BAND[selTile.band].label.split(' ')[0]}</dd>
              </div>
              <div className="flex justify-between">
                <dt>ring / orbit</dt>
                <dd className="tabular-nums text-white/70">{ringOf({ q: selTile.q, r: selTile.r })}</dd>
              </div>
              <div className="flex justify-between">
                <dt>axial (q,r) · live</dt>
                <dd className="tabular-nums text-white/70">
                  {selTile.q}, {selTile.r}
                </dd>
              </div>
              {selTile.hazard && (
                <div className="flex justify-between">
                  <dt>hazard</dt>
                  <dd className="text-amber-300/80">{HAZARD_LABEL[selTile.hazard]}</dd>
                </div>
              )}
            </dl>

            {selBodyHere && selBodyHere.resources.length > 0 && (
              <>
                <h3 className="mb-2 mt-4 font-mono text-[10px] tracking-[0.3em] text-white/45">RESOURCES</h3>
                <ul className="space-y-2">
                  {selBodyHere.resources.map((res) => (
                    <li key={res.kind}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="text-white/70">{RES_LABEL[res.kind]}</span>
                        <span className="font-mono tabular-nums text-white/45">{Math.round(res.richness * 100)}%</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                        <div className="h-full rounded-full" style={{ width: `${Math.round(res.richness * 100)}%`, background: BODY[selBodyHere.type].color }} />
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {/* --- movement orders --- */}
            <div className="mt-4 border-t border-white/10 pt-3">
              <h3 className="mb-2 font-mono text-[10px] tracking-[0.3em] text-white/45">MOVEMENT</h3>
              {isDockedToSel ? (
                <>
                  <p className="mb-2 text-xs text-emerald-300/80">Docked — riding {dockedName}. Station-keeping free.</p>
                  <OrderBtn tone="neutral" onClick={coastFromHere}>
                    Undock → coast
                  </OrderBtn>
                </>
              ) : isBurningToSel ? (
                <>
                  <p className="mb-2 font-mono text-[11px] text-amber-200/80">
                    In transit → {shipMode.kind === 'burn' ? shipMode.label : ''} · ETA ≈{burnEtaMin}m
                  </p>
                  <OrderBtn tone="neutral" onClick={coastFromHere}>
                    Cancel burn → coast
                  </OrderBtn>
                </>
              ) : plan ? (
                <>
                  {plan.reachable && plan.dist > 0 ? (
                    <p className="mb-2 font-mono text-[11px] text-white/60">
                      {plan.dist} hex · ETA ≈{planEtaMin}m{plan.kind === 'intercept' ? ' · leads target' : ''}
                    </p>
                  ) : (
                    <p className="mb-2 font-mono text-[11px] text-white/40">{plan.dist === 0 ? 'Already here.' : 'No intercept solution.'}</p>
                  )}
                  <OrderBtn tone={plan.kind === 'intercept' ? 'go' : 'go'} disabled={!plan.reachable || plan.dist === 0} onClick={() => commitPlan(plan)}>
                    {plan.kind === 'intercept' ? '⟡ Intercept & dock' : '▲ Burn here'}
                  </OrderBtn>
                  {burning && (
                    <div className="mt-1.5">
                      <OrderBtn tone="neutral" onClick={coastFromHere}>
                        Cancel current burn
                      </OrderBtn>
                    </div>
                  )}
                </>
              ) : null}
            </div>
          </div>
        )}
      </aside>

      {/* --- transport (orbit clock) --- */}
      <div className="absolute bottom-5 left-6 flex items-center gap-1.5">
        <ZoomBtn onClick={() => setPlaying((p) => !p)} label={playing ? 'Pause' : 'Play'}>
          {playing ? '❚❚' : '▶'}
        </ZoomBtn>
        <ZoomBtn onClick={stepForward} label="Step forward">
          ⏭
        </ZoomBtn>
        <ZoomBtn onClick={() => setSpeedIdx((i) => (i + 1) % SPEEDS.length)} label="Speed">
          ×{speed}
        </ZoomBtn>
        <button
          onClick={coastFromHere}
          disabled={shipMode.kind === 'coast'}
          aria-label="Coast"
          className={`flex h-8 items-center justify-center rounded-lg border px-3 font-mono text-xs backdrop-blur-md ${
            shipMode.kind === 'coast'
              ? 'cursor-default border-white/5 bg-white/[0.03] text-white/25'
              : 'border-cyan-300/40 bg-cyan-300/10 text-cyan-100 hover:bg-cyan-300/20'
          }`}
        >
          ◼ coast
        </button>
      </div>

      {/* --- flight status --- */}
      <div className="pointer-events-none absolute bottom-16 left-1/2 -translate-x-1/2 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 font-mono text-[11px] tracking-wider backdrop-blur-md" style={{ color: accent }}>
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: accent, boxShadow: `0 0 8px ${accent}` }} />
          {shipMode.kind === 'coast' && <span>COASTING · orbit r{shipMode.ring}</span>}
          {shipMode.kind === 'burn' && (
            <>
              <span>
                IN TRANSIT · {shipMode.label} · ETA ≈{burnEtaMin}m
              </span>
              <span className="inline-block h-1 w-16 overflow-hidden rounded-full bg-white/15">
                <span className="block h-full rounded-full" style={{ width: `${Math.round(burnFrac * 100)}%`, background: accent }} />
              </span>
            </>
          )}
          {shipMode.kind === 'docked' && <span>DOCKED · {dockedName} · station-keeping</span>}
        </div>
      </div>

      {/* --- hint --- */}
      <div className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 font-mono text-[11px] tracking-wider text-white/35">
        click a body → intercept &amp; dock · click a hex → burn there · coast is the resting state · scan follows the ship · scroll zoom · drag pan
      </div>

      {/* --- zoom controls --- */}
      <div className="absolute bottom-5 right-6 flex gap-1.5">
        <ZoomBtn onClick={() => zoomBy(0.8)} label="Zoom in">
          +
        </ZoomBtn>
        <ZoomBtn onClick={() => zoomBy(1.25)} label="Zoom out">
          −
        </ZoomBtn>
        <ZoomBtn onClick={() => setView(laid.fit)} label="Fit to screen">
          fit
        </ZoomBtn>
      </div>
    </div>
  )
}

function BodyGlyph({ type, x, y, dim, onClick }: { type: BodyType; x: number; y: number; dim: boolean; onClick: () => void }) {
  const { color, glyph } = BODY[type]
  const o = dim ? 0.45 : 1
  let visual: React.ReactNode
  if (glyph === 'star') {
    visual = (
      <>
        <circle cx={x} cy={y} r={SIZE * 1.05} fill="url(#starGlow)" opacity={o} />
        <circle cx={x} cy={y} r={SIZE * 0.42} fill="#fff7e0" opacity={o} />
      </>
    )
  } else if (glyph === 'dots') {
    const rocks = [
      [-0.4, -0.3],
      [0.2, -0.45],
      [0.45, 0.1],
      [-0.15, 0.35],
      [-0.5, 0.15],
      [0.1, 0.15],
    ]
    visual = (
      <g opacity={o}>
        {rocks.map(([dx, dy], i) => (
          <circle key={i} cx={x + dx * SIZE} cy={y + dy * SIZE} r={2.4} fill={color} />
        ))}
      </g>
    )
  } else if (glyph === 'giant') {
    visual = (
      <g opacity={o}>
        <circle cx={x} cy={y} r={SIZE * 0.5} fill={color} />
        <ellipse cx={x} cy={y} rx={SIZE * 0.78} ry={SIZE * 0.22} fill="none" stroke={rgba(color, 0.7)} strokeWidth={2} />
      </g>
    )
  } else if (glyph === 'diamond') {
    const s = SIZE * 0.4
    visual = <polygon points={`${x},${y - s} ${x + s},${y} ${x},${y + s} ${x - s},${y}`} fill={color} opacity={o} />
  } else if (glyph === 'square') {
    const s = SIZE * 0.32
    visual = <rect x={x - s} y={y - s} width={s * 2} height={s * 2} fill={color} opacity={o} transform={`rotate(45 ${x} ${y})`} />
  } else {
    const r = type === 'moon' ? SIZE * 0.22 : SIZE * 0.38
    visual = <circle cx={x} cy={y} r={r} fill={color} opacity={o} />
  }
  return (
    <g onClick={onClick} className="cursor-pointer">
      {visual}
      {/* transparent hit target so small glyphs are easy to click */}
      <circle cx={x} cy={y} r={SIZE * 0.5} fill="transparent" />
    </g>
  )
}

function ZoomBtn({ onClick, label, children }: { onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="flex h-8 min-w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.06] px-2 font-mono text-sm text-white/70 backdrop-blur-md hover:bg-white/[0.12] hover:text-white/90"
    >
      {children}
    </button>
  )
}

function OrderBtn({ tone, disabled, onClick, children }: { tone: 'go' | 'neutral'; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  const styles = disabled
    ? 'cursor-not-allowed border-white/5 bg-white/[0.03] text-white/25'
    : tone === 'go'
      ? 'border-amber-300/40 bg-amber-300/15 text-amber-100 hover:bg-amber-300/25'
      : 'border-white/15 bg-white/[0.06] text-white/70 hover:bg-white/[0.12] hover:text-white/90'
  return (
    <button onClick={onClick} disabled={disabled} className={`w-full rounded-lg border px-3 py-1.5 font-mono text-xs backdrop-blur-md ${styles}`}>
      {children}
    </button>
  )
}

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
      <div className="truncate font-mono text-lg capitalize tabular-nums text-white/90">{value}</div>
      <div className="font-mono text-[9px] tracking-[0.2em] text-white/40">{label.toUpperCase()}</div>
    </div>
  )
}
