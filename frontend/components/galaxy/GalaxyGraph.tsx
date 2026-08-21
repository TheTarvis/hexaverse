'use client'

// The 3D galaxy renderer: react-force-graph-3d (three.js) driven by the real
// #0001 (x,y,z) positions, wired to the owned CameraRig (spec #0002).
//
// SSR-guarded: react-force-graph-3d is dynamically imported client-only (three
// needs `document`/WebGL). The glow texture is a lazy SSR-safe singleton and the
// camera rig is only constructed after the graph mounts on the client.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import * as THREE from 'three'
import type { Galaxy, GalaxyNode } from '@/lib/types/galaxy'
import type { Fleet } from '@/lib/types/fleet'
import { REGION_PALETTE } from './region-palette'
import { glowTexture } from './glow-texture'
import { CameraRig } from './camera-rig'
import { TransitLayer } from './transit-layer'
import type { NodePositions } from './transit-geometry'

// Client-only. Typed loosely — react-force-graph-3d's generics don't add value
// here and the ref surface we use is a small, hand-declared slice (FgRef).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ForceGraph3D = dynamic(() => import('react-force-graph-3d'), { ssr: false }) as any

type Neuterable = { enabled: boolean; enableDamping?: boolean }
interface FgRef {
  scene: () => THREE.Scene
  camera: () => THREE.PerspectiveCamera
  renderer: () => THREE.WebGLRenderer
  controls: () => Neuterable
  refresh: () => void
  // add-renderer-availability-states (design.md "render-loop suspension is
  // an implementation detail"): the accessors GalaxyView's guard calls to
  // save CPU while the canvas region is unavailable/interrupted. Declared
  // here for legibility, NOT for compile-time enforcement — `ForceGraph3D`
  // is cast `as any` above, so TypeScript never structurally checks this
  // interface against the library's real type (design.md Risks, "kickoff
  // review" correction). The guard degrades to "interrupted state shown,
  // loop not paused" via optional-call if the library ever renames/drops
  // these.
  pauseAnimation?: () => void
  resumeAnimation?: () => void
}

// Imperative handle handed up to GalaxyView so the ⌖ recenter control and the
// wake-focus glide can drive the camera without prop-drilling three internals.
export interface GalaxyGraphController {
  recenter: () => void
  focusSystem: (id: string) => void
  // Glide to an arbitrary point in graph space — a fleet out on a lane sits
  // between stars, so focusing it needs a point, not a system (#0008).
  focusPoint: (p: { x: number; y: number; z: number }) => void
  // add-renderer-availability-states (tasks.md 3.1/3.2): the seam GalaxyView's
  // guard uses to attach webglcontextlost/webglcontextrestored listeners to
  // the already-mounted FG3D renderer's canvas — never for creation-failure
  // detection (design.md: that's the probe/boundary's job; construction
  // failure never reaches this controller, since `onReady` is never called
  // when construction throws). Null only if the renderer never exposed a
  // `domElement` — should not happen once `onReady` has fired.
  canvas: () => HTMLCanvasElement | null
  // Save CPU while nothing is drawable; correctness never depends on this
  // (design.md, "render-loop suspension is an implementation detail").
  // Degrades silently to a no-op if the library's `pauseAnimation` accessor
  // is absent.
  pause: () => void
  resume: () => void
}

interface GalaxyGraphProps {
  galaxy: Galaxy
  selectedId: string | null
  onSelect: (node: GalaxyNode | null) => void
  onReady?: (controller: GalaxyGraphController) => void
  // Systems hosting the requester's own fleets — drawn with a presence marker
  // (#0002 Follow-ups 2026-07-11: own fleets show on the galaxy tier).
  fleetSystemIds?: string[]
  // Fleets out on a lane (laneTransit / laneHold) — drawn crawling their route by
  // the TransitLayer (#0008). A travelling fleet is NOT in a system, so it must
  // not also show up as a presence pip on the star it left.
  transitFleets?: Fleet[]
  // Clicked a fleet's lane marker. The markers are scene objects the force graph
  // doesn't know about, so the click is raycast here.
  onSelectFleet?: (fleetId: string) => void
  // The live world clock, ticking per frame — the transit layer's animation input.
  worldTime?: number
  // The fleet/home system the ⌖ recenter snaps to when one exists (else the
  // whole-galaxy framing) — resolves the M2 "no fleet to snap to" TODO.
  homeSystemId?: string | null
}

const DBLCLICK_MS = 350

export function GalaxyGraph({
  galaxy,
  selectedId,
  onSelect,
  onReady,
  fleetSystemIds,
  transitFleets,
  onSelectFleet,
  worldTime = 0,
  homeSystemId,
}: GalaxyGraphProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const fgRef = useRef<FgRef | null>(null)
  const rigRef = useRef<CameraRig | null>(null)
  const gridRef = useRef<THREE.GridHelper | null>(null)
  const transitRef = useRef<TransitLayer | null>(null)
  const readyRef = useRef(false)
  const [sceneReady, setSceneReady] = useState(false)
  const lastClickRef = useRef<{ id: string; t: number }>({ id: '', t: 0 })
  const [size, setSize] = useState({ w: 0, h: 0 })

  // Keep the latest selection in a ref so nodeThreeObject (rebuilt on refresh)
  // reads the current value without being recreated every render.
  const selectedRef = useRef<string | null>(selectedId)
  selectedRef.current = selectedId

  // Which systems host an own fleet — read through a ref so makeNode (rebuilt on
  // refresh) sees the current set without being recreated every render.
  const fleetSet = useMemo(() => new Set(fleetSystemIds ?? []), [fleetSystemIds])
  const fleetSetRef = useRef(fleetSet)
  fleetSetRef.current = fleetSet

  // The recenter/home target, read through a ref so the controller handed up at
  // init reflects the fleet's system even though it loads after the rig mounts.
  const homeIdRef = useRef<string | null>(homeSystemId ?? null)
  homeIdRef.current = homeSystemId ?? null

  const graphData = useMemo(
    () => ({ nodes: galaxy.nodes, links: galaxy.links.map((l) => ({ ...l })) }),
    [galaxy],
  )

  const nodeById = useMemo(() => new Map(galaxy.nodes.map((n) => [n.id, n])), [galaxy])

  // Star positions for the transit layer. One stable Map, refilled when the galaxy
  // read changes (a newly revealed system), so the layer built at init keeps a
  // valid reference without being torn down.
  const nodePosRef = useRef<NodePositions>(new Map())
  useEffect(() => {
    const m = nodePosRef.current
    m.clear()
    for (const n of galaxy.nodes) m.set(n.id, { x: n.x, y: n.y, z: n.z })
  }, [galaxy])

  const laneCount = useMemo(() => {
    const counts = new Map<string, number>()
    for (const l of galaxy.links) {
      counts.set(l.source, (counts.get(l.source) ?? 0) + 1)
      counts.set(l.target, (counts.get(l.target) ?? 0) + 1)
    }
    return counts
  }, [galaxy])

  // ---- measure the container ----
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ---- build a node's sprite group (additive glow: halo + core) ----
  const makeNode = useCallback(
    (node: GalaxyNode) => {
      const style = REGION_PALETTE[node.region]
      const selected = selectedRef.current === node.id
      // The star map is common knowledge — every system renders fully visible
      // (#0006). Subspace tier is surfaced in the inspector, not by dimming the
      // graph; any explored-vs-charted emphasis is an M7 board-view decision.
      const dim = 1
      const sel = selected ? 1.5 : 1

      const group = new THREE.Group()

      const halo = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTexture(),
          color: new THREE.Color(style.color),
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          transparent: true,
          opacity: 0.32 * dim * (selected ? 1.4 : 1),
        }),
      )
      const hs = (5 + style.size * 8) * sel
      halo.scale.set(hs, hs, 1)

      const core = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTexture(),
          color: new THREE.Color(style.color).lerp(new THREE.Color('#ffffff'), 0.5),
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          transparent: true,
          opacity: 0.95 * dim,
        }),
      )
      const cs = (2.2 + style.size * 3) * sel
      core.scale.set(cs, cs, 1)

      group.add(halo)
      group.add(core)

      // Own-fleet presence marker — a bright cyan pip lifted above the star on
      // +Z so it reads as "a hull is on station here" from the oblique disk view
      // (#0002 Follow-ups 2026-07-11). A freshly spawned player sees it at home.
      if (fleetSetRef.current.has(node.id)) {
        const pip = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: glowTexture(),
            color: new THREE.Color('#67e8f9'),
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            transparent: true,
            opacity: 0.98,
          }),
        )
        const ps = 3.6
        pip.scale.set(ps, ps, 1)
        pip.position.set(0, 0, 6 + style.size * 4)
        group.add(pip)
      }
      return group
    },
    [],
  )

  // Rebuild node sprites when the selection OR the own-fleet set changes so both
  // the highlight and the fleet marker show ON the graph (spec acceptance:
  // selection + fleet presence indicated on the graph, not only the inspector).
  useEffect(() => {
    fgRef.current?.refresh?.()
  }, [selectedId, fleetSet])

  const linkColor = useCallback(
    (link: { source: GalaxyNode | string; target: GalaxyNode | string }) => {
      const a = typeof link.source === 'object' ? link.source : nodeById.get(link.source)
      const b = typeof link.target === 'object' ? link.target : nodeById.get(link.target)
      const seam = a?.region === 'barrier' || b?.region === 'barrier'
      // Every lane we receive renders at full strength: lane-reveal-by-presence
      // is now enforced server-side (#0006) — the galaxy read only ships the
      // requester's charted lanes, so there are no unknown lanes to dim here.
      if (seam) return `rgba(244,114,182,0.5)`
      return `rgba(150,185,230,0.42)`
    },
    [nodeById],
  )

  // ---- construct the camera rig once the graph has mounted on the client ----
  useEffect(() => {
    if (size.w === 0 || readyRef.current) return
    let raf = 0
    const tryInit = () => {
      const fg = fgRef.current
      const wrap = wrapRef.current
      if (fg && wrap) {
        const camera = fg.camera()
        const renderer = fg.renderer()
        const internal = fg.controls()
        if (camera && renderer?.domElement) {
          const rig = new CameraRig(camera, renderer.domElement, wrap, internal)
          rigRef.current = rig
          // Frame on the fleet's home if we already know it (spawn stashes it
          // synchronously), else the whole disk; the wake-focus glide in
          // GalaxyView re-centres once the fleet read settles.
          const homeAtInit = homeIdRef.current ? nodeById.get(homeIdRef.current) : null
          if (homeAtInit) rig.recenter({ x: homeAtInit.x, y: homeAtInit.y, z: homeAtInit.z }, 0)
          else rig.frameBounds(galaxy.bounds)

          // reference grid on the z=0 galactic disk — reads depth at a glance.
          const scene = fg.scene()
          if (scene && !gridRef.current) {
            const span = Math.max(
              galaxy.bounds.x[1] - galaxy.bounds.x[0],
              galaxy.bounds.y[1] - galaxy.bounds.y[0],
            )
            const grid = new THREE.GridHelper(span * 1.4, 26, 0x33415e, 0x1b2440)
            grid.rotation.x = Math.PI / 2 // XZ plane -> XY disk
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

          // The travelling-fleet overlay lives in the same scene (#0008).
          if (scene && !transitRef.current) {
            transitRef.current = new TransitLayer(scene, nodePosRef.current)
            setSceneReady(true)
          }

          readyRef.current = true
          onReady?.({
            // ⌖ recenter snaps to the fleet's system when one exists, else the
            // whole disk (homeIdRef stays fresh as the fleet read settles).
            recenter: () => {
              const hn = homeIdRef.current ? nodeById.get(homeIdRef.current) : null
              if (hn) rig.recenter({ x: hn.x, y: hn.y, z: hn.z })
              else rig.frameBounds(galaxy.bounds)
            },
            // Glide a specific system to centre (the wake-focus handoff #0009).
            focusSystem: (id: string) => {
              const n = nodeById.get(id)
              if (n) rig.focus({ x: n.x, y: n.y, z: n.z })
            },
            // Glide to a bare point — a fleet mid-lane (the roster's "show me").
            focusPoint: (p) => rig.focus(p),
            // add-renderer-availability-states: the already-mounted renderer's
            // canvas — the seam GalaxyView's guard attaches
            // webglcontextlost/webglcontextrestored listeners to.
            canvas: () => renderer.domElement ?? null,
            // Optional-call degradation, not a cast: an absent accessor on the
            // library's real ref just means the loop keeps running while the
            // interrupted state is shown — never a crash (design.md Risks).
            pause: () => fg.pauseAnimation?.(),
            resume: () => fg.resumeAnimation?.(),
          })
          return
        }
      }
      raf = requestAnimationFrame(tryInit)
    }
    raf = requestAnimationFrame(tryInit)
    return () => {
      if (raf) cancelAnimationFrame(raf)
    }
  }, [size.w, galaxy.bounds, onReady, nodeById])

  // ---- the travelling-fleet overlay ----------------------------------------
  // Rebuild the trails when the set of trips changes (a departure, a redirect, an
  // arrival)…
  const transit = useMemo(() => transitFleets ?? [], [transitFleets])
  useEffect(() => {
    if (!sceneReady) return
    transitRef.current?.setFleets(transit)
  }, [sceneReady, transit])

  // …and slide the markers along their lanes on every clock tick. This is an
  // imperative scene write, NOT a React render of the force graph — the position
  // is computed from (route, legEtas, worldTime), so it keeps crawling between
  // reads.
  useEffect(() => {
    if (!sceneReady) return
    transitRef.current?.update(worldTime)
  }, [sceneReady, worldTime])

  // Lane markers are clickable: raycast them on the canvas ourselves, since the
  // force graph only hit-tests its own nodes. A drag (orbit/pan) must never
  // select, so a press that travels more than a few pixels isn't a click; and a
  // hover over a marker shows the pointer cursor, the only affordance a bare
  // sprite can offer.
  const selectFleetRef = useRef(onSelectFleet)
  selectFleetRef.current = onSelectFleet
  useEffect(() => {
    const fg = fgRef.current
    const canvas = fg?.renderer()?.domElement
    if (!sceneReady || !fg || !canvas) return

    const raycaster = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    let downAt: { x: number; y: number } | null = null

    const hitAt = (e: PointerEvent | MouseEvent): string | null => {
      const layer = transitRef.current
      if (!layer) return null
      const r = canvas.getBoundingClientRect()
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      raycaster.setFromCamera(ndc, fg.camera())
      return layer.pick(raycaster)
    }

    const onDown = (e: PointerEvent) => {
      downAt = { x: e.clientX, y: e.clientY }
    }
    const onUp = (e: PointerEvent) => {
      const from = downAt
      downAt = null
      if (!from) return
      if (Math.hypot(e.clientX - from.x, e.clientY - from.y) > 4) return // a drag
      const id = hitAt(e)
      if (id) {
        e.stopPropagation()
        selectFleetRef.current?.(id)
      }
    }
    const onMove = (e: PointerEvent) => {
      if (downAt) return
      canvas.style.cursor = hitAt(e) ? 'pointer' : ''
    }

    // Capture phase: the marker sits above the graph, so a hit is ours before the
    // force graph treats the same press as a background click.
    canvas.addEventListener('pointerdown', onDown, { capture: true })
    canvas.addEventListener('pointerup', onUp, { capture: true })
    canvas.addEventListener('pointermove', onMove)
    return () => {
      canvas.removeEventListener('pointerdown', onDown, { capture: true })
      canvas.removeEventListener('pointerup', onUp, { capture: true })
      canvas.removeEventListener('pointermove', onMove)
      canvas.style.cursor = ''
    }
  }, [sceneReady])

  // Tear the rig (and the overlay) down on unmount.
  useEffect(() => {
    return () => {
      rigRef.current?.dispose()
      rigRef.current = null
      transitRef.current?.dispose()
      transitRef.current = null
      readyRef.current = false
      // renderer().dispose() (called by the FG3D/react-kapsule chain) frees
      // programs and render lists but does not release the GL context itself
      // — that's left to GC timing. Force it here so a lost -> retry -> lost
      // cycle never leaves more than one live context per canvas (module 1.7).
      // Deliberately read at cleanup time, not captured at effect-setup time:
      // FG3D attaches this ref asynchronously (after its dynamic import
      // resolves), so a captured value would be null at mount.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      fgRef.current?.renderer()?.forceContextLoss?.()
    }
  }, [])

  const handleNodeClick = useCallback(
    (node: GalaxyNode) => {
      // react-force-graph has no node dblclick; detect it from click timing.
      // Double-click -> glide the star to centre preserving angle/zoom.
      const now = performance.now()
      const last = lastClickRef.current
      if (last.id === node.id && now - last.t < DBLCLICK_MS) {
        lastClickRef.current = { id: '', t: 0 }
        onSelect(node)
        rigRef.current?.focus({ x: node.x, y: node.y, z: node.z }, 600)
        return
      }
      lastClickRef.current = { id: node.id, t: now }
      onSelect(selectedRef.current === node.id ? null : node)
    },
    [onSelect],
  )

  return (
    <div ref={wrapRef} data-testid="galaxy-graph" className="absolute inset-0">
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
          nodeLabel={(n: GalaxyNode) => n.name}
          linkColor={linkColor}
          linkWidth={0.5}
          linkOpacity={0.8}
          onNodeClick={handleNodeClick}
          onBackgroundClick={() => onSelect(null)}
        />
      )}
      {/* controls hint */}
      <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 font-mono text-[11px] tracking-wider text-white/35">
        drag to orbit · two-finger swipe to pan · pinch to zoom · double-click to
        focus · ⌖ recenter
      </div>
      {/* keep laneCount referenced for potential future glyphs without recompute churn */}
      <span className="hidden" data-lane-index={laneCount.size} />
    </div>
  )
}

export default GalaxyGraph
