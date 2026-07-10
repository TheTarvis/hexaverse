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
import { REGION_PALETTE } from './region-palette'
import { glowTexture } from './glow-texture'
import { CameraRig } from './camera-rig'

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
}

// Imperative handle handed up to GalaxyView so the ⌖ recenter control can drive
// the camera without prop-drilling three internals.
export interface GalaxyGraphController {
  recenter: () => void
}

interface GalaxyGraphProps {
  galaxy: Galaxy
  selectedId: string | null
  onSelect: (node: GalaxyNode | null) => void
  onReady?: (controller: GalaxyGraphController) => void
}

const DBLCLICK_MS = 350

export function GalaxyGraph({ galaxy, selectedId, onSelect, onReady }: GalaxyGraphProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const fgRef = useRef<FgRef | null>(null)
  const rigRef = useRef<CameraRig | null>(null)
  const gridRef = useRef<THREE.GridHelper | null>(null)
  const readyRef = useRef(false)
  const lastClickRef = useRef<{ id: string; t: number }>({ id: '', t: 0 })
  const [size, setSize] = useState({ w: 0, h: 0 })

  // Keep the latest selection in a ref so nodeThreeObject (rebuilt on refresh)
  // reads the current value without being recreated every render.
  const selectedRef = useRef<string | null>(selectedId)
  selectedRef.current = selectedId

  const graphData = useMemo(
    () => ({ nodes: galaxy.nodes, links: galaxy.links.map((l) => ({ ...l })) }),
    [galaxy],
  )

  const nodeById = useMemo(() => new Map(galaxy.nodes.map((n) => [n.id, n])), [galaxy])

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
      return group
    },
    [],
  )

  // Rebuild node sprites when the selection changes so the highlight shows ON
  // the graph (spec acceptance: selection indicated on the graph, not only the
  // inspector).
  useEffect(() => {
    fgRef.current?.refresh?.()
  }, [selectedId])

  const linkColor = useCallback(
    (link: { source: GalaxyNode | string; target: GalaxyNode | string }) => {
      const a = typeof link.source === 'object' ? link.source : nodeById.get(link.source)
      const b = typeof link.target === 'object' ? link.target : nodeById.get(link.target)
      const seam = a?.region === 'barrier' || b?.region === 'barrier'
      // Lanes render at full strength — the star map is common knowledge (#0006);
      // lane-reveal-by-presence is an M8 (travel) concern.
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
          rig.frameBounds(galaxy.bounds)

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

          readyRef.current = true
          onReady?.({
            // TODO(travis-feel): no fleet exists at M2, so ⌖ recenter re-frames
            // the whole galaxy. When the fleet lands (M4+), snap to it instead.
            recenter: () => rig.frameBounds(galaxy.bounds),
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
  }, [size.w, galaxy.bounds, onReady])

  // Tear the rig down on unmount.
  useEffect(() => {
    return () => {
      rigRef.current?.dispose()
      rigRef.current = null
      readyRef.current = false
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
