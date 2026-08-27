'use client'

// SPIKE — the 2D top-down view for /spike/stealth. Render-only SVG: shadow
// wedges and detection rings are annulus-and-wedge geometry that reads
// instantly from above, at a fraction of the 3D build cost (per the
// visualization-spikes doc). Everything drawn derives per-frame from the pure
// stealth/sim modules; the page owns all state. The rAF loop only starts once
// the SVG measures — in jsdom it never does, so tests render one static frame.

import { useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type React from 'react'
import { bodyPosition, orbitLocalPosition, resolveShip } from '../space-3d/sim'
import type { SystemDef } from '../space-3d/sim'
import type { SimClock } from '../space-3d/SpaceView'
import { patrolState } from '../intel/intel'
import type { Patrol } from '../intel/intel'
import { contact, occluders, parkingOrbitVisibility, project, shadowWedges, systemExtent } from './stealth'
import type { Dials, P2 } from './stealth'

export interface StealthViewProps {
  system: SystemDef
  clock: RefObject<SimClock>
  patrol: Patrol
  observer: P2
  marker: P2 | null
  dials: Dials
  arcBodyId: string
  onObserverMove: (p: P2) => void
  onPlaceMarker: (p: P2) => void
}

const CLICK_DRAG_TOLERANCE = 4 // world units of pointer travel that still count as a click

const hex = (color: number) => `#${color.toString(16).padStart(6, '0')}`
const pts = (points: P2[]) => points.map((p) => `${p.x.toFixed(2)},${p.z.toFixed(2)}`).join(' ')

export function StealthView({
  system,
  clock,
  patrol,
  observer,
  marker,
  dials,
  arcBodyId,
  onObserverMove,
  onPlaceMarker,
}: StealthViewProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [, setFrame] = useState(0)
  const dragging = useRef(false)
  const downAt = useRef<P2 | null>(null)

  // The rAF loop advances the shared sim clock (uncapped dt — closed-form
  // makes jumps safe) and re-renders; it starts only once the SVG measures,
  // so jsdom gets a single static render and no act() noise.
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    let raf = 0
    let last = 0
    let running = false
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      const dt = (now - last) / 1000
      last = now
      const sim = clock.current
      if (!sim.paused) sim.t += dt * sim.scale
      setFrame((f) => f + 1)
    }
    const check = () => {
      if (running || el.getBoundingClientRect().width === 0) return
      running = true
      last = performance.now()
      raf = requestAnimationFrame(loop)
    }
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => {
      ro.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [clock])

  const extent = useMemo(() => systemExtent(system), [system])
  const t = clock.current.t

  // Pointer → world through the viewBox (jsdom rects are 0-sized: guarded).
  const toWorld = (e: React.PointerEvent): P2 | null => {
    const el = svgRef.current
    if (!el) return null
    const rect = el.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return null
    return {
      x: -extent + ((e.clientX - rect.left) / rect.width) * 2 * extent,
      z: -extent + ((e.clientY - rect.top) / rect.height) * 2 * extent,
    }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    const world = toWorld(e)
    if (!world) return
    downAt.current = world
    const grabRadius = extent * 0.05
    dragging.current = Math.hypot(world.x - observer.x, world.z - observer.z) <= grabRadius
    if (dragging.current) (e.target as Element).setPointerCapture?.(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return
    const world = toWorld(e)
    if (world) onObserverMove(world)
  }
  const onPointerUp = (e: React.PointerEvent) => {
    const world = toWorld(e)
    const down = downAt.current
    downAt.current = null
    if (dragging.current) {
      dragging.current = false
      return
    }
    if (!world || !down) return
    if (Math.hypot(world.x - down.x, world.z - down.z) <= CLICK_DRAG_TOLERANCE) onPlaceMarker(world)
  }

  // Everything below derives from (system, t, observer, dials) — pure calls.
  const discs = occluders(system, t)
  const wedges = shadowWedges(observer, discs, extent * 3)
  const con = contact(system, patrol, observer, t, dials)
  const enemyState = resolveShip(system, patrolState(patrol, t), t)
  const burning = enemyState.mode === 'burn'
  const arcs = parkingOrbitVisibility(system, arcBodyId, observer, t)

  const ringPath = (bodyId: string): string => {
    const body = system.bodies.find((b) => b.id === bodyId)
    if (!body?.orbit) return ''
    const points: P2[] = []
    for (let i = 0; i <= 96; i++) {
      points.push(project(orbitLocalPosition(body.orbit, (i / 96) * body.orbit.period)))
    }
    return pts(points)
  }

  return (
    <svg
      ref={svgRef}
      data-testid="stealth-svg"
      viewBox={`${-extent} ${-extent} ${2 * extent} ${2 * extent}`}
      className="absolute inset-0 h-full w-full cursor-crosshair"
      style={{ background: '#05060a' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {/* Shadow wedges first — everything else draws on top of the dark. */}
      {wedges.map((w) => (
        <polygon key={w.id} data-testid={`wedge-${w.id}`} points={pts(w.points)} fill="#01030a" opacity={0.65} />
      ))}

      {/* Planet orbit rings (projected, so inclination reads as ellipses). */}
      {system.bodies
        .filter((b) => b.kind === 'planet')
        .map((b) => (
          <polyline key={`ring-${b.id}`} points={ringPath(b.id)} fill="none" stroke="#28324e" strokeWidth={extent * 0.0025} opacity={0.65} />
        ))}

      {/* The arc-painted parking orbit: green = eclipsed (hidden), amber = visible. */}
      {arcs.runs.map((run, i) => (
        <polyline
          key={`arc-${i}`}
          points={pts(run.points)}
          fill="none"
          stroke={run.eclipsed ? '#34d399' : '#f59e0b'}
          strokeWidth={extent * 0.006}
          opacity={0.9}
        />
      ))}

      {/* Bodies. */}
      {system.bodies.map((b) => {
        const p = project(bodyPosition(system, b.id, t))
        return <circle key={b.id} cx={p.x} cy={p.z} r={Math.max(b.size, extent * 0.004)} fill={hex(b.color)} />
      })}

      {/* The patrol fleet + its signature ring (pulsing while burning). */}
      <circle
        cx={con.pos.x}
        cy={con.pos.z}
        r={Math.max(con.signature, 0.5)}
        fill={burning ? '#ff9a3c' : 'none'}
        fillOpacity={burning ? 0.06 + 0.04 * Math.sin(t * 6) : 0}
        stroke="#ff9a3c"
        strokeWidth={extent * 0.004}
        strokeOpacity={burning ? 0.6 + 0.25 * Math.sin(t * 6) : 0.55}
      />
      <circle cx={con.pos.x} cy={con.pos.z} r={extent * 0.012} fill="#ff6b6b" />

      {/* Detection line while the observer sees the contact. */}
      {con.detected && (
        <line
          data-testid="detection-line"
          x1={observer.x}
          y1={observer.z}
          x2={con.pos.x}
          y2={con.pos.z}
          stroke="#ef4444"
          strokeWidth={extent * 0.004}
          strokeDasharray={`${extent * 0.02} ${extent * 0.012}`}
          opacity={0.85}
        />
      )}

      {/* The observer: bubble + crosshair handle (draggable). */}
      <circle
        cx={observer.x}
        cy={observer.z}
        r={dials.bubbleRadius}
        fill="#67e8f9"
        fillOpacity={0.05}
        stroke="#67e8f9"
        strokeWidth={extent * 0.003}
        strokeDasharray={`${extent * 0.015} ${extent * 0.01}`}
        strokeOpacity={0.6}
      />
      <g data-testid="observer-handle">
        <circle cx={observer.x} cy={observer.z} r={extent * 0.03} fill="#67e8f9" fillOpacity={0.12} stroke="#67e8f9" strokeWidth={extent * 0.004} />
        <line x1={observer.x - extent * 0.02} y1={observer.z} x2={observer.x + extent * 0.02} y2={observer.z} stroke="#67e8f9" strokeWidth={extent * 0.003} />
        <line x1={observer.x} y1={observer.z - extent * 0.02} x2={observer.x} y2={observer.z + extent * 0.02} stroke="#67e8f9" strokeWidth={extent * 0.003} />
      </g>

      {/* The station-keep marker. */}
      {marker && (
        <g data-testid="sk-marker">
          <rect
            x={marker.x - extent * 0.014}
            y={marker.z - extent * 0.014}
            width={extent * 0.028}
            height={extent * 0.028}
            transform={`rotate(45 ${marker.x} ${marker.z})`}
            fill="none"
            stroke="#fbbf24"
            strokeWidth={extent * 0.004}
          />
          <circle cx={marker.x} cy={marker.z} r={extent * 0.004} fill="#fbbf24" />
        </g>
      )}
    </svg>
  )
}
