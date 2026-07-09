'use client'

// SPIKE (throwaway) — 3D variant of /spike/galaxy. Same mock data + glass panels,
// rendered with react-force-graph-3d so you can ORBIT and read depth/distance.
// The glow is preserved WITHOUT shaders: a 2D radial gradient is baked into a sprite
// texture and drawn with additive blending. Route: /spike/galaxy-3d
//
// Now also prototypes the GRAPH-TIER MOVEMENT VERB (see docs/plans/movement-galaxy.md):
// a "you are here" fleet → select a system → preview the lane route + per-leg/total ETA
// → commit → the fleet crawls node-to-node over real time, revealing as it goes.
// Cost is length-weighted (Dijkstra over 3D lane distance); ETA is shown, not eyeballed.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import * as THREE from 'three'
import { generateMockGalaxy, type MockSystem, type Region } from './mock-galaxy'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ForceGraph3D = dynamic(() => import('react-force-graph-3d'), { ssr: false }) as any

const REGION: Record<Region, { label: string; color: string }> = {
  star_rich: { label: 'Star-rich', color: '#ffd27d' },
  normal: { label: 'Normal', color: '#7dd3fc' },
  dead: { label: 'Dead zone', color: '#8b98a9' },
  barrier: { label: 'Barrier', color: '#f472b6' },
}

// --- movement tuning (spike-only, arbitrary but tuned to "feel" like commitment) ---
const ETA_UNITS_PER_MIN = 3 // lane-length units → in-fiction minutes
const ANIM_MS_PER_UNIT = 8 // lane-length units → real ms of crawl
const ANIM_MS_MIN = 1500
const ANIM_MS_MAX = 9000

function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)

function fmtEta(min: number): string {
  const m = Math.max(1, Math.round(min))
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

type Coord = { x: number; y: number; z: number }
type Adj = Map<string, { to: string; w: number }[]>

// Dijkstra over the lane graph, weighted by 3D lane length. Returns the node path,
// cumulative distance at each node, and the total — or null if no lane route exists.
function shortestPath(
  adj: Adj,
  nodeById: Map<string, Coord>,
  from: string,
  to: string,
): { path: string[]; cum: number[]; total: number } | null {
  const dist = new Map<string, number>([[from, 0]])
  const prev = new Map<string, string>()
  const visited = new Set<string>()
  const pq: [number, string][] = [[0, from]]
  while (pq.length) {
    pq.sort((a, b) => a[0] - b[0]) // fine at spike node counts
    const [d, u] = pq.shift()!
    if (visited.has(u)) continue
    visited.add(u)
    if (u === to) break
    for (const { to: v, w } of adj.get(u) ?? []) {
      const nd = d + w
      if (nd < (dist.get(v) ?? Infinity)) {
        dist.set(v, nd)
        prev.set(v, u)
        pq.push([nd, v])
      }
    }
  }
  if (!dist.has(to)) return null
  const path = [to]
  let c = to
  while (c !== from) {
    const p = prev.get(c)
    if (p === undefined) return null
    path.unshift(p)
    c = p
  }
  const cum = [0]
  for (let i = 1; i < path.length; i++) {
    const a = nodeById.get(path[i - 1])!
    const b = nodeById.get(path[i])!
    cum.push(cum[i - 1] + Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z))
  }
  return { path, cum, total: cum[cum.length - 1] }
}

// Lazy singleton glow texture (client-only — needs document). The SAME radial
// gradient as the 2D spike, baked once and tinted per node via material.color.
let _glow: THREE.Texture | null = null
function glowTexture(): THREE.Texture {
  if (_glow) return _glow
  const size = 128
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.14, 'rgba(255,255,255,0.85)')
  g.addColorStop(0.4, 'rgba(255,255,255,0.18)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const t = new THREE.Texture(c)
  t.needsUpdate = true
  _glow = t
  return t
}

// The travelling fleet marker — a bright, always-on-top mote that rides the lanes.
function makeTraveler(): THREE.Sprite {
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture(),
      color: new THREE.Color('#aef4ff'),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false, // draw over nodes so you never lose the fleet
      transparent: true,
      opacity: 1,
    }),
  )
  s.scale.set(16, 16, 1)
  s.renderOrder = 999
  return s
}

// rumored = undiscovered but lane-adjacent to something you've seen → the "edge of
// known space beckoning" fog tier (docs/plans/fog-of-war.md: neighbours auto-Rumored).
type GraphNode = MockSystem & { fx?: number; fy?: number; fz?: number; rumored?: boolean }
type Transit = { path: string[]; cum: number[]; total: number; durationMs: number; startMs: number }
type Vec = { x: number; y: number; z: number }
type FgRef = {
  zoomToFit: (ms: number, px: number) => void
  scene: () => THREE.Scene
  refresh: () => void
  camera: () => THREE.PerspectiveCamera
  cameraPosition: (pos: Vec, lookAt?: Vec, ms?: number) => void
  controls: () => {
    target?: THREE.Vector3
    update?: () => void
    screenSpacePanning?: boolean
    enableDamping?: boolean
    dampingFactor?: number
    minPolarAngle?: number
    maxPolarAngle?: number
    mouseButtons?: { LEFT?: number; MIDDLE?: number; RIGHT?: number }
    touches?: { ONE?: number; TWO?: number }
    // OrbitControls bakes its orbit basis from camera.up ONCE in its constructor;
    // these private quats let us re-derive it for Z-up after the fact (see below).
    _quat?: THREE.Quaternion
    _quatInverse?: THREE.Quaternion
  }
}

export default function Galaxy3DSpikePage() {
  const galaxy = useMemo(() => generateMockGalaxy(), [])
  const [selected, setSelected] = useState<GraphNode | null>(null)
  const [fleetAt, setFleetAt] = useState(galaxy.homeId)
  const [transit, setTransit] = useState<Transit | null>(null)
  const [revealVersion, setRevealVersion] = useState(0)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const wrapRef = useRef<HTMLDivElement>(null)
  const fgRef = useRef<FgRef | null>(null)
  const travelerRef = useRef<THREE.Sprite | null>(null)
  const gridRef = useRef<THREE.GridHelper | null>(null)
  const stemRef = useRef<THREE.Line | null>(null)
  const focusedRef = useRef(false)
  const lastClickRef = useRef<{ id: string; t: number }>({ id: '', t: 0 })

  // Pin nodes to their generated 3D positions so orbit reveals the real spatial
  // structure (flattened disk, clusters, seam) rather than a re-solved layout.
  const graphData = useMemo(() => {
    const nodes = galaxy.systems.map((s) => ({ ...s, fx: s.x, fy: s.y, fz: s.z })) as GraphNode[]
    // seed the initial rumored ring so the first paint already shows the frontier
    const byId = new Map(nodes.map((n) => [n.id, n]))
    for (const l of galaxy.lanes) {
      const a = byId.get(l.source)
      const b = byId.get(l.target)
      if (!a || !b) continue
      if (a.discovered && !b.discovered) b.rumored = true
      if (b.discovered && !a.discovered) a.rumored = true
    }
    return { nodes, links: galaxy.lanes.map((l) => ({ ...l })) }
  }, [galaxy])

  const nodeById = useMemo(() => new Map(graphData.nodes.map((n) => [n.id, n])), [graphData])

  const adjacency = useMemo(() => {
    const map = new Map<string, GraphNode[]>()
    for (const s of graphData.nodes) map.set(s.id, [])
    for (const l of galaxy.lanes) {
      const a = nodeById.get(l.source)
      const b = nodeById.get(l.target)
      if (a && b) {
        map.get(a.id)!.push(b)
        map.get(b.id)!.push(a)
      }
    }
    return map
  }, [galaxy, graphData, nodeById])

  // Aim the camera at a system and pivot the orbit controls on it — so you orbit
  // *your star*, not the empty galactic centre.
  const focusOn = useCallback(
    (nodeId: string, ms = 0) => {
      const fg = fgRef.current
      const n = nodeById.get(nodeId)
      if (!fg?.controls || !n) return false
      const c = fg.controls()
      if (!c?.target) return false // controls not mounted yet — let the caller retry
      const dist = 240
      // oblique framing (with Z-up): sit above and to one side so the disk reads at an
      // angle, star centred, galaxy sprawling behind it.
      fg.cameraPosition(
        { x: n.x + dist * 0.15, y: n.y - dist * 0.6, z: n.z + dist * 0.7 },
        { x: n.x, y: n.y, z: n.z },
        ms,
      )
      c.target.set(n.x, n.y, n.z)
      c.update?.()
      return true
    },
    [nodeById],
  )

  // Fly to a system and make it the orbit target, but PRESERVE the current viewing
  // angle and zoom (unlike focusOn's fixed oblique reset) — the camera just glides so
  // the star lands centred. Used by double-click. Keeping the camera→target offset
  // means orbit/pan/zoom now pivot on the new star with no jump.
  const focusNode = useCallback(
    (nodeId: string, ms = 600) => {
      const fg = fgRef.current
      const n = nodeById.get(nodeId)
      const cam = fg?.camera?.()
      if (!fg?.controls || !n || !cam) return
      const c = fg.controls()
      if (!c?.target) return
      const offset = cam.position.clone().sub(c.target) // current angle + distance
      const target = new THREE.Vector3(n.x, n.y, n.z)
      const pos = target.clone().add(offset)
      fg.cameraPosition({ x: pos.x, y: pos.y, z: pos.z }, { x: n.x, y: n.y, z: n.z }, ms)
      c.target.set(n.x, n.y, n.z)
      c.update?.()
    },
    [nodeById],
  )

  // Recompute the rumored ring from current discovery — called as the fleet reveals
  // systems in transit, so the frontier tier keeps up.
  const recomputeFog = useCallback(() => {
    for (const n of graphData.nodes) {
      n.rumored = !n.discovered && (adjacency.get(n.id) ?? []).some((m) => m.discovered)
    }
  }, [graphData, adjacency])

  // Pathfinding runs over *charted* lanes only — a lane is known once either endpoint
  // has been reached (presence). So you can route across explored space and one hop
  // past its frontier (to a Rumored neighbour), never blind-jump to an uncharted star.
  const knownAdj = useMemo<Adj>(() => {
    const adj: Adj = new Map()
    for (const nd of graphData.nodes) adj.set(nd.id, [])
    for (const l of galaxy.lanes) {
      const a = nodeById.get(l.source)
      const b = nodeById.get(l.target)
      if (!a || !b) continue
      if (!a.discovered && !b.discovered) continue // uncharted — subspace-invisible
      const w = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
      adj.get(a.id)!.push({ to: b.id, w })
      adj.get(b.id)!.push({ to: a.id, w })
    }
    return adj
    // revealVersion: recompute as travel charts new lanes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [galaxy, graphData, nodeById, revealVersion])

  // Live route preview from the fleet to the selected system (idle only).
  const preview = useMemo(() => {
    if (transit || !selected || selected.id === fleetAt) return null
    return shortestPath(knownAdj, nodeById, fleetAt, selected.id)
  }, [transit, selected, fleetAt, knownAdj, nodeById])

  // Lanes to highlight: the active transit route, else the preview route.
  const routeKeys = useMemo(() => {
    const src = transit?.path ?? preview?.path
    const set = new Set<string>()
    if (src) for (let i = 0; i < src.length - 1; i++) set.add(pairKey(src[i], src[i + 1]))
    return set
  }, [transit, preview])
  const routeSig = useMemo(() => [...routeKeys].sort().join(','), [routeKeys])

  const stats = useMemo(() => {
    const counts: Record<Region, number> = { star_rich: 0, normal: 0, dead: 0, barrier: 0 }
    let discovered = 0
    for (const s of graphData.nodes) {
      counts[s.region]++
      if (s.discovered) discovered++
    }
    return { total: graphData.nodes.length, lanes: galaxy.lanes.length, counts, discovered }
    // revealVersion forces a recount as the fleet reveals systems in transit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphData, galaxy, revealVersion])

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Open focused on the home star (once), retrying until the graph/controls exist.
  // Also set world up = Z: the XY galactic disk is the ground, so orbiting reads as a
  // turntable over it rather than tumbling a plane on edge (see camera-and-input.md).
  useEffect(() => {
    if (focusedRef.current || size.w === 0) return
    let raf = 0
    const tryFocus = () => {
      const fg = fgRef.current
      const cam = fg?.camera?.()
      const ctrls = fg?.controls?.()
      if (fg && cam && ctrls?.target) {
        // World up = Z (the XY disk is the ground). But OrbitControls computes its
        // orbit basis (`_quat`) from camera.up ONCE, in its constructor — which ran
        // while up was still the default +Y. So setting cam.up alone leaves the
        // controls orbiting around Y (poles sitting *in* the disk plane) while the
        // camera merely *renders* Z-up: that mismatch is the "horizontal drag does
        // nothing, then flips above/below the plane at the limit" bug. Re-derive the
        // control quats so the orbit poles sit at ±Z, straight over the disk.
        cam.up.set(0, 0, 1)
        if (ctrls._quat && ctrls._quatInverse) {
          ctrls._quat.setFromUnitVectors(cam.up, new THREE.Vector3(0, 1, 0))
          ctrls._quatInverse.copy(ctrls._quat).invert()
        }
        // Gesture map tuned for the Mac trackpad: left-drag orbits (the one easy
        // one-finger gesture goes to the verb with no other easy input), two-finger
        // swipe pans (handled by the wheel interceptor below), pinch zooms. Right-drag
        // also pans — redundant with swipe, so its two-finger-click clumsiness is moot.
        // screenSpacePanning=false keeps that pan parallel to the ground plane (derived
        // from object.up × cameraRight, up is Z) so gliding holds a constant height
        // instead of climbing toward the camera when pitched.
        ctrls.screenSpacePanning = false
        ctrls.mouseButtons = {
          LEFT: THREE.MOUSE.ROTATE,
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.PAN,
        }
        ctrls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }
        // Pitch UNCLAMPED — full pole-to-pole orbit (min 0 / max π): the camera can
        // tumble over the top and under the disk to view it from below. OrbitControls'
        // makeSafe() keeps the exact poles gimbal-stable. (Trying this vs. the earlier
        // "never go under the disk" clamp — see camera-and-input.md.)
        ctrls.minPolarAngle = 0
        ctrls.maxPolarAngle = Math.PI
        // Damping smooths the Mac trackpad's inertial scroll into a glide, and is
        // driven each frame by force-graph's own controls.update() loop.
        ctrls.enableDamping = true
        ctrls.dampingFactor = 0.12
        focusOn(galaxy.homeId, 0)
        focusedRef.current = true
      } else {
        raf = requestAnimationFrame(tryFocus)
      }
    }
    raf = requestAnimationFrame(tryFocus)
    return () => {
      if (raf) cancelAnimationFrame(raf)
    }
  }, [size.w, size.h, galaxy.homeId, focusOn])

  // Two-finger trackpad swipe → ground-plane pan. macOS delivers a swipe as a plain
  // `wheel` event and a pinch as `wheel` + ctrlKey; OrbitControls reads *any* wheel as
  // zoom, which is why swipe zoomed. We intercept in the CAPTURE phase on the wrapper
  // (runs before the canvas's own OrbitControls listener, so we can preempt it): plain
  // wheel → pan the focus across the disk; ctrl+wheel (pinch) → fall through to zoom.
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return // pinch — leave it for OrbitControls to zoom
      const fg = fgRef.current
      const cam = fg?.camera?.()
      const ctrls = fg?.controls?.()
      if (!cam || !ctrls?.target) return
      e.preventDefault()
      e.stopPropagation()
      // world-units-per-pixel, scaled by the camera's HEIGHT above the disk — not its
      // slant distance to the focus. At a grazing pitch the slant distance stays large
      // while the camera sits low, so distance-based scaling flings the near-field
      // foreground past you (the "too glidy when flat" feel). Height collapses as you
      // flatten out, so pan slows to match; at top-down height ≈ distance, so the
      // looking-down feel is unchanged.
      // abs() so swipe-pan keeps working when orbited under the disk (z < target.z)
      const height = Math.max(1, Math.abs(cam.position.z - ctrls.target.z))
      const perPx = (2 * height * Math.tan(((cam.fov ?? 50) / 2) * (Math.PI / 180))) / (el.clientHeight || 1)
      // camera right + forward, both flattened onto the z=0 ground plane (up = Z)
      const right = new THREE.Vector3().setFromMatrixColumn(cam.matrix, 0)
      right.z = 0
      right.normalize()
      const forward = new THREE.Vector3(-right.y, right.x, 0) // = worldUp(Z) × right
      // grab-the-map feel: content follows the fingers. Flip a sign here if it inverts.
      const move = right
        .multiplyScalar(-e.deltaX * perPx)
        .add(forward.multiplyScalar(e.deltaY * perPx))
      cam.position.add(move)
      ctrls.target.add(move)
      ctrls.update?.() // we moved camera+target equally, so the orbit offset is preserved
    }
    el.addEventListener('wheel', onWheel, { capture: true, passive: false })
    return () => el.removeEventListener('wheel', onWheel, { capture: true })
  }, [])

  // Re-apply link colours when the highlighted route changes (preview or commit).
  useEffect(() => {
    fgRef.current?.refresh?.()
  }, [routeSig])

  // Place / animate the fleet marker. Idle → sit at the current node. In transit →
  // interpolate along the lane path over real time, revealing each node as it's reached.
  useEffect(() => {
    let raf = 0
    let cancelled = false

    const scenePos = (id: string) => {
      const n = nodeById.get(id)
      return n ? new THREE.Vector3(n.x, n.y, n.z) : null
    }

    const run = () => {
      const scene = fgRef.current?.scene?.()
      if (!scene) {
        raf = requestAnimationFrame(run) // wait for the graph to mount
        return
      }
      if (!travelerRef.current) {
        travelerRef.current = makeTraveler()
        scene.add(travelerRef.current)
      }
      // reference plane through the galactic disk (z=0) — orient yourself in 3D.
      // GridHelper spans x/z at y=0; rotate onto x/y at z=0 to match our flat disk.
      if (!gridRef.current) {
        const grid = new THREE.GridHelper(1300, 26, 0x33415e, 0x1b2440)
        grid.rotation.x = Math.PI / 2
        grid.renderOrder = -1
        const dim = (m: THREE.Material) => {
          m.transparent = true
          m.opacity = 0.5
          m.depthWrite = false
        }
        const mat = grid.material
        if (Array.isArray(mat)) mat.forEach(dim)
        else dim(mat)
        gridRef.current = grid
        scene.add(grid)
      }
      // a vertical stem from the selected node to the plane — reads its height at a glance
      if (!stemRef.current) {
        const geom = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(),
          new THREE.Vector3(),
        ])
        const line = new THREE.Line(
          geom,
          new THREE.LineBasicMaterial({
            color: 0x7dd3fc,
            transparent: true,
            opacity: 0.45,
            depthWrite: false,
          }),
        )
        line.visible = false
        stemRef.current = line
        scene.add(line)
      }
      const sprite = travelerRef.current

      if (!transit) {
        const p = scenePos(fleetAt)
        if (p) sprite.position.copy(p)
        return
      }

      const { path, cum, total, durationMs, startMs } = transit
      let revealIdx = 0
      const step = () => {
        if (cancelled) return
        const t = Math.min(1, (performance.now() - startMs) / durationMs)
        const travelled = t * total
        let i = 0
        while (i < path.length - 2 && cum[i + 1] <= travelled) i++
        const a = scenePos(path[i])
        const b = scenePos(path[i + 1])
        if (a && b) {
          const seg = cum[i + 1] - cum[i]
          const f = seg > 0 ? Math.min(1, Math.max(0, (travelled - cum[i]) / seg)) : 1
          sprite.position.copy(a.clone().lerp(b, f))
        }
        let revealed = false
        while (revealIdx < path.length && cum[revealIdx] <= travelled + 1e-6) {
          const n = nodeById.get(path[revealIdx])
          if (n && !n.discovered) {
            n.discovered = true
            revealed = true
          }
          revealIdx++
        }
        if (revealed) {
          recomputeFog()
          fgRef.current?.refresh?.()
          setRevealVersion((v) => v + 1)
        }
        if (t < 1) {
          raf = requestAnimationFrame(step)
        } else {
          const dest = path[path.length - 1]
          const n = nodeById.get(dest)
          if (n && !n.discovered) {
            n.discovered = true
            recomputeFog()
            fgRef.current?.refresh?.()
            setRevealVersion((v) => v + 1)
          }
          setFleetAt(dest)
          setTransit(null)
        }
      }
      raf = requestAnimationFrame(step)
    }

    run()
    return () => {
      cancelled = true
      if (raf) cancelAnimationFrame(raf)
    }
  }, [transit, fleetAt, nodeById, recomputeFog])

  // Point the selected-node stem at the current selection (or hide it).
  useEffect(() => {
    const line = stemRef.current
    if (!line) return
    const n = selected ? nodeById.get(selected.id) : null
    if (!n) {
      line.visible = false
      return
    }
    const pos = line.geometry.attributes.position as THREE.BufferAttribute
    pos.setXYZ(0, n.x, n.y, n.z)
    pos.setXYZ(1, n.x, n.y, 0)
    pos.needsUpdate = true
    line.visible = true
  }, [selected, nodeById])

  const plotCourse = (destId: string) => {
    const r = shortestPath(knownAdj, nodeById, fleetAt, destId)
    if (!r) return
    const durationMs = Math.min(ANIM_MS_MAX, Math.max(ANIM_MS_MIN, r.total * ANIM_MS_PER_UNIT))
    setSelected(null) // orders given — clear the selection, get out of the view's way
    setTransit({ ...r, durationMs, startMs: performance.now() })
  }

  const makeNode = (node: GraphNode) => {
    // Every star burns at full brightness: stars are common knowledge across
    // light-years (telescope/spectroscopy), so the galaxy map is *geography, not fog*.
    // Fog lives at the hex-board tier (a system's actual contents). What IS gated up
    // here is the subspace LANE network — charted by presence (see linkVisibility +
    // the charted-only pathfinding), never the stars themselves.
    const dim = 1
    const color = REGION[node.region].color
    const group = new THREE.Group()

    // soft halo (additive, low opacity so dense clusters don't blow to white)
    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture(),
        color: new THREE.Color(color),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        opacity: 0.3 * dim,
      }),
    )
    const hs = (2 + node.val * 1.3) * 2.4
    halo.scale.set(hs, hs, 1)

    // crisp bright core (keeps each system a distinct point)
    const core = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture(),
        color: new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.5),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        opacity: 0.95 * dim,
      }),
    )
    const cs = (1.4 + node.val * 0.5) * 2.0
    core.scale.set(cs, cs, 1)

    group.add(halo)
    group.add(core)
    return group
  }

  // A lane is only *drawn* once charted (an endpoint reached) — the road network
  // grows by presence. Uncharted lanes are hidden entirely (linkVisibility below).
  const laneCharted = (l: { source: GraphNode; target: GraphNode }) =>
    l.source.discovered || l.target.discovered

  const linkColor = (link: { source: GraphNode; target: GraphNode }) => {
    const a = link.source
    const b = link.target
    if (routeKeys.has(pairKey(a.id, b.id))) {
      // active route glows brighter than a mere preview
      return transit ? 'rgba(174,244,255,0.95)' : 'rgba(125,211,252,0.7)'
    }
    const both = a.discovered && b.discovered // explored↔explored vs a frontier stub
    const seam = a.region === 'barrier' || b.region === 'barrier'
    if (seam) return `rgba(244,114,182,${both ? 0.5 : 0.24})`
    return `rgba(150,185,230,${both ? 0.42 : 0.22})`
  }

  const fleetName = nodeById.get(fleetAt)?.name ?? '—'
  const destName = transit ? nodeById.get(transit.path[transit.path.length - 1])?.name ?? '—' : null

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#05070d] text-white">
      <div ref={wrapRef} className="absolute inset-0">
        {size.w > 0 && (
          <ForceGraph3D
            ref={fgRef}
            width={size.w}
            height={size.h}
            graphData={graphData}
            backgroundColor="#05070d"
            showNavInfo={false}
            controlType="orbit"
            cooldownTicks={0}
            enableNodeDrag={false}
            nodeThreeObject={makeNode}
            nodeLabel={(n: GraphNode) =>
              n.discovered ? n.name : n.rumored ? `${n.name} · charted lane` : `${n.name} · uncharted`
            }
            linkVisibility={laneCharted}
            linkColor={linkColor}
            linkWidth={(l: { source: GraphNode; target: GraphNode }) =>
              routeKeys.has(pairKey(l.source.id, l.target.id)) ? 2 : 0.5
            }
            linkOpacity={0.8}
            onNodeClick={(node: GraphNode) => {
              // force-graph has no node double-click event — detect it from click
              // timing. Double-click a star → fly to it and make it the camera target;
              // single click → toggle selection (open/close the inspector).
              const now = performance.now()
              const last = lastClickRef.current
              if (last.id === node.id && now - last.t < 350) {
                lastClickRef.current = { id: '', t: 0 }
                setSelected(node)
                focusNode(node.id, 600)
                return
              }
              lastClickRef.current = { id: node.id, t: now }
              setSelected((cur) => (cur?.id === node.id ? null : node))
            }}
            onBackgroundClick={() => setSelected(null)}
          />
        )}
      </div>

      {/* --- title --- */}
      <div className="pointer-events-none absolute left-6 top-5">
        <div className="font-mono text-[11px] tracking-[0.35em] text-white/40">HEXAVERSE</div>
        <div className="font-mono text-lg tracking-[0.25em] text-white/85">GALAXY // SECTOR-0 · 3D</div>
      </div>

      {/* --- left: intel panel --- */}
      <aside className="absolute left-6 top-24 w-64 rounded-xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-md">
        <h2 className="mb-3 font-mono text-[10px] tracking-[0.3em] text-white/45">GALAXY INTEL</h2>
        <div className="grid grid-cols-2 gap-2">
          <StatTile label="Systems" value={stats.total} />
          <StatTile label="Lanes" value={stats.lanes} />
          <StatTile
            label="Charted"
            value={`${Math.round((stats.discovered / stats.total) * 100)}%`}
          />
          <StatTile label="Sector" value="0" />
        </div>

        <h3 className="mb-2 mt-4 font-mono text-[10px] tracking-[0.3em] text-white/45">FLEET</h3>
        <div className="flex items-center gap-2">
          <div className="flex-1 rounded-lg border border-cyan-300/20 bg-cyan-300/[0.06] px-3 py-2 text-xs">
            {transit ? (
              <span className="text-cyan-200/90">
                In transit → <span className="text-white">{destName}</span>
              </span>
            ) : (
              <span className="text-white/70">
                Docked · <span className="text-white">{fleetName}</span>
              </span>
            )}
          </div>
          <button
            className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-2 text-xs text-white/70 hover:bg-white/10"
            title="Recenter on fleet"
            onClick={() => focusOn(fleetAt, 600)}
          >
            ⌖
          </button>
        </div>

        <h3 className="mb-2 mt-4 font-mono text-[10px] tracking-[0.3em] text-white/45">REGIONS</h3>
        <ul className="space-y-1.5">
          {(Object.keys(REGION) as Region[]).map((r) => (
            <li key={r} className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-2 text-white/70">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ background: REGION[r].color, boxShadow: `0 0 8px ${REGION[r].color}` }}
                />
                {REGION[r].label}
              </span>
              <span className="font-mono tabular-nums text-white/50">{stats.counts[r]}</span>
            </li>
          ))}
        </ul>
      </aside>

      {/* --- right: system inspector --- */}
      <aside className="absolute right-6 top-24 w-72 rounded-xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-md">
        <h2 className="mb-3 font-mono text-[10px] tracking-[0.3em] text-white/45">SYSTEM</h2>
        {!selected ? (
          <p className="text-sm text-white/40">Select a system to inspect it — or to plot a course.</p>
        ) : (
          <div>
            <div className="text-lg text-white/90">{selected.name}</div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span
                className="rounded-full px-2 py-0.5 text-[11px]"
                style={{
                  background: rgba(REGION[selected.region].color, 0.15),
                  color: REGION[selected.region].color,
                }}
              >
                {REGION[selected.region].label}
              </span>
              {selected.id === fleetAt && (
                <span className="rounded-full bg-cyan-300/15 px-2 py-0.5 text-[11px] text-cyan-200">
                  Fleet here
                </span>
              )}
              {!selected.discovered &&
                (selected.rumored ? (
                  <span className="rounded-full bg-sky-300/15 px-2 py-0.5 text-[11px] text-sky-200">
                    Charted lane
                  </span>
                ) : (
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-white/50">
                    Uncharted
                  </span>
                ))}
            </div>
            <dl className="mt-3 space-y-1 font-mono text-[11px] text-white/50">
              <div className="flex justify-between">
                <dt>coords</dt>
                <dd className="tabular-nums text-white/70">
                  {selected.x.toFixed(0)}, {selected.y.toFixed(0)}, {selected.z.toFixed(0)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt>lanes</dt>
                <dd className="tabular-nums text-white/70">{adjacency.get(selected.id)?.length ?? 0}</dd>
              </div>
            </dl>

            {/* --- course plotter (the movement verb) --- */}
            <div className="mt-4">
              {selected.id === fleetAt ? (
                <p className="text-xs text-white/40">The fleet is already here.</p>
              ) : transit ? (
                <p className="text-xs text-cyan-200/70">Fleet in transit — arrival first.</p>
              ) : preview ? (
                <button
                  className="w-full rounded-lg border border-cyan-300/30 bg-cyan-300/10 px-3 py-2 text-left text-xs text-cyan-100 hover:bg-cyan-300/20"
                  onClick={() => plotCourse(selected.id)}
                >
                  <div className="font-medium">Plot course →</div>
                  <div className="mt-0.5 font-mono text-[11px] text-cyan-200/70">
                    {preview.path.length - 1} lane{preview.path.length - 1 === 1 ? '' : 's'} · ETA{' '}
                    {fmtEta(preview.total / ETA_UNITS_PER_MIN)}
                  </div>
                </button>
              ) : (
                <p className="text-xs text-white/40">
                  Uncharted — no known lane. Reach a neighbour to chart the roads onward.
                </p>
              )}
            </div>

            <h3 className="mb-2 mt-4 font-mono text-[10px] tracking-[0.3em] text-white/45">
              CONNECTIONS
            </h3>
            <ul className="space-y-1">
              {(adjacency.get(selected.id) ?? []).map((n) => (
                <li key={n.id}>
                  <button
                    className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs text-white/70 hover:bg-white/10"
                    onClick={() => setSelected(n)}
                  >
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ background: REGION[n.region].color }}
                    />
                    <span className="flex-1 truncate">{n.name}</span>
                    <span className="text-white/35">{REGION[n.region].label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>

      {/* --- controls hint --- */}
      <div className="pointer-events-none absolute bottom-5 left-1/2 -translate-x-1/2 font-mono text-[11px] tracking-wider text-white/35">
        drag to orbit · two-finger swipe to pan · pinch to zoom · double-click to focus · ⌖ recenter · click → plot course
      </div>
    </div>
  )
}

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
      <div className="font-mono text-lg tabular-nums text-white/90">{value}</div>
      <div className="font-mono text-[9px] tracking-[0.2em] text-white/40">{label.toUpperCase()}</div>
    </div>
  )
}
