'use client'

// SPIKE — the polar system board. Route: /spike/polar-board
//
// An A/B bench between two lattices for the system interior, in the spirit of
// the WebGL board spike's original SVG-vs-GL wipe: the SAME origin and
// destination, in the SAME pixel space, solved once on lib/hex's cube lattice
// (production) and once on ./polar (the candidate), drawn over each other.
//
// It exists to settle a specific complaint — that travelling across a system
// makes sharp left and right turns where real trajectories are smooth arcs —
// with a number instead of an impression. That number is MAX TURN: the
// sharpest heading change anywhere along the committed path. Load the
// "Across the star" preset and read the two figures.
//
// Nothing here is wired to production. See ./polar.ts for what the lattice
// claims and why.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Button } from '@/components/catalyst/button'
import { Heading, Subheading } from '@/components/catalyst/heading'
import { Text } from '@/components/catalyst/text'
import { Select } from '@/components/catalyst/select'
import { BAND_STYLE, VOID, rgba } from '@/components/board/board-palette'
import { line as hexLine, ringHexes, routeAround } from '@/lib/hex'
import { HEX_SIZE, hexPolygonPoints, hexToPixel, hexesWithinRadius, pixelToHex } from '@/lib/hex/pixel'
import {
  DEFAULT_SCHEDULE,
  RADIAL_UNIT,
  arcPath,
  SCHEDULE_PRESETS,
  cellCount,
  coreCrossings,
  hexCellCount,
  isotropy,
  maxTurnDeg,
  orbAngleAt,
  pathLength,
  pathPoints,
  pointToCell,
  polarToPoint,
  slotsForRing,
  smoothPath,
  type Point,
  type SlotSchedule,
} from './polar'
import { buildMockPolarSystem, type BodyKind } from './mock-system'

// Path accents. Raw colour strings are unavoidable for SVG stroke/fill, the
// same documented exception board-palette.ts carries.
const POLAR_STROKE = '#7dd3fc' // sky — the candidate lattice
const HEX_STROKE = '#fbbf24' // amber — production cube lattice
const MARKER_STROKE = '#ffffff'

type LatticeMode = 'polar' | 'hex' | 'both'

const BODY_TINT: Record<BodyKind, string> = {
  star: BAND_STYLE.core.tint,
  rocky: BAND_STYLE.inner.tint,
  gas_giant: BAND_STYLE.mid.tint,
  ice: BAND_STYLE.outer.tint,
  belt: BAND_STYLE.outer.tint,
  moon: BAND_STYLE.inner.tint,
}

// Presets are the cases worth arguing about, in board pixels. "Across the
// star" is the headline: the cube solve has to detour around the core
// (lib/hex routeAround) and takes a hard corner doing it, while a polar path
// physically cannot cross the centre.
const PRESETS: Record<string, { origin: Point; dest: Point; note: string }> = {
  'Across the star': {
    origin: polarToPoint(11, Math.PI * 0.92),
    dest: polarToPoint(11, -Math.PI * 0.08),
    note: 'The cube solve detours around the core and corners hard. The arc sweeps past it.',
  },
  'Inbound transfer': {
    origin: polarToPoint(13, Math.PI * 0.25),
    dest: polarToPoint(3, Math.PI * 1.15),
    note: 'The case polar LOSES. Descending 10 rings while sweeping 162° aliases the two axes against each other, and the ring drops land unevenly. Cube staircases uniformly and smooths flatter.',
  },
  'Tangential burn': {
    origin: polarToPoint(8, Math.PI * 0.1),
    dest: polarToPoint(8, Math.PI * 0.75),
    note: 'Same ring, quarter way around. The arc stays on the ring; the chord cuts inside it.',
  },
  'Steep radial': {
    origin: polarToPoint(15, 0),
    dest: polarToPoint(2, Math.PI * 0.15),
    note: 'Almost pure radial: ring changes every step, angle barely moves, so it stays clean. Nearly a tie with cube.',
  },
  'Rim to core': {
    origin: polarToPoint(14, Math.PI * 1.4),
    dest: { x: 0, y: 0 },
    note: 'The one case a polar path is allowed to reach ring 0 — and it goes straight in.',
  },
}

// --- control primitives (mirroring the WebGL bench) --------------------------

function Row({ label, value, children }: { label: string; value?: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-t border-zinc-200 py-2 dark:border-white/10">
      <span className="w-24 shrink-0 font-mono text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        {label}
      </span>
      <div className="flex flex-1 items-center gap-2">{children}</div>
      {value !== undefined && (
        <span className="w-14 shrink-0 text-right font-mono text-[11px] tabular-nums text-zinc-600 dark:text-zinc-300">
          {value}
        </span>
      )}
    </div>
  )
}

function Slider({
  min,
  max,
  step,
  value,
  onChange,
  testId,
}: {
  min: number
  max: number
  step: number
  value: number
  onChange: (v: number) => void
  testId: string
}) {
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      data-testid={testId}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full accent-sky-500"
    />
  )
}

// Scoreboard cell — the measured comparison, one metric per row.
function Metric({
  label,
  polar,
  hex,
  headline = false,
  testId,
}: {
  label: string
  polar: string
  hex: string
  headline?: boolean
  testId: string
}) {
  return (
    <div className="flex items-baseline gap-2 border-t border-zinc-200 py-2 dark:border-white/10">
      <span className="flex-1 font-mono text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        {label}
      </span>
      <span
        data-testid={`${testId}-polar`}
        className={`w-16 text-right font-mono tabular-nums text-sky-600 dark:text-sky-300 ${headline ? 'text-lg' : 'text-[11px]'}`}
      >
        {polar}
      </span>
      <span
        data-testid={`${testId}-hex`}
        className={`w-16 text-right font-mono tabular-nums text-amber-600 dark:text-amber-400 ${headline ? 'text-lg' : 'text-[11px]'}`}
      >
        {hex}
      </span>
    </div>
  )
}

function toPolyline(points: Point[]): string {
  return points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
}

// px quantizes a projected coordinate before it reaches an SVG attribute.
//
// Not cosmetic. Node (the SSR pass) and Chrome (hydration) disagree in the last
// ULP of Math.cos/Math.sin, so the same cell projected on both sides produced
// y1="-42.83999999999999" against y1="-42.83999999999998" and React reported a
// hydration mismatch on every tick mark. Rounding at the render boundary makes
// both sides emit the same string.
//
// Worth dwelling on, because it is exactly the hazard that argues for keeping
// the lattice integer: trig is not bit-reproducible across engines, and Node vs
// Chrome is a far friendlier pair than Go vs JS. It cost nothing here ONLY
// because every use of trig in this spike is projection — no rule, no stored
// value, and no ETA is downstream of a cosine. Move a cosine into the solve and
// this stops being a rendering warning and becomes the client and the server
// disagreeing about where a fleet is.
function px(n: number): number {
  return Number(n.toFixed(3))
}

export default function PolarBoardSpikePage() {
  const [mode, setMode] = useState<LatticeMode>('both')
  const [maxRing, setMaxRing] = useState(16)
  const [scheduleName, setScheduleName] = useState('Isotropic')
  const [innerSlots, setInnerSlots] = useState(DEFAULT_SCHEDULE.innerSlots)
  const [showCells, setShowCells] = useState(true)
  const [speed, setSpeed] = useState(1)
  const [seedTick, setSeedTick] = useState(0)
  const [presetName, setPresetName] = useState<string>('Across the star')
  const [origin, setOrigin] = useState<Point>(PRESETS['Across the star'].origin)
  const [dest, setDest] = useState<Point>(PRESETS['Across the star'].dest)

  // The preset picks the doubling bands; the slider overrides the base count so
  // the sliver effect can be walked into deliberately.
  const sched: SlotSchedule = useMemo(
    () => ({ innerSlots, doubleAt: (SCHEDULE_PRESETS[scheduleName] ?? DEFAULT_SCHEDULE).doubleAt }),
    [innerSlots, scheduleName],
  )

  const applySchedule = useCallback((name: string) => {
    setScheduleName(name)
    const preset = SCHEDULE_PRESETS[name]
    if (preset) setInnerSlots(preset.innerSlots)
  }, [])

  const seed = 0x51a2c0de + seedTick * 7919
  const system = useMemo(() => buildMockPolarSystem(seed, maxRing, sched), [seed, maxRing, sched])

  // Bench clock. Production world time always runs at scale 1 off the server
  // anchor; the multiplier is a bench affordance for reading motion.
  const [worldTime, setWorldTime] = useState(0)
  const speedRef = useRef(speed)
  speedRef.current = speed
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = now - last
      last = now
      setWorldTime((t) => t + dt * speedRef.current)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const extent = maxRing * RADIAL_UNIT + RADIAL_UNIT
  const viewBox = `${px(-extent)} ${px(-extent)} ${px(extent * 2)} ${px(extent * 2)}`

  // --- the two solves ---------------------------------------------------------
  //
  // Same endpoints, same pixel space, each lattice snapping to its own nearest
  // cell. That snap is the honest comparison: it is what each lattice would
  // actually have committed for this order.

  const polarSolve = useMemo(() => {
    const from = pointToCell(origin, sched)
    const to = pointToCell(dest, sched)
    const path = arcPath(from, to, sched)
    const pts = pathPoints(path, sched)
    return {
      path,
      pts,
      smooth: smoothPath(pts),
      cells: path.length,
      length: pathLength(pts),
      turn: maxTurnDeg(pts),
      smoothTurn: maxTurnDeg(smoothPath(pts)),
      core: coreCrossings(path),
    }
  }, [origin, dest, sched])

  const hexSolve = useMemo(() => {
    const from = pixelToHex(origin)
    const to = pixelToHex(dest)
    const path = routeAround(from, to)
    const pts = path.map((h) => hexToPixel(h.q, h.r))
    return {
      path,
      pts,
      smooth: smoothPath(pts),
      cells: path.length,
      length: pathLength(pts),
      turn: maxTurnDeg(pts),
      smoothTurn: maxTurnDeg(smoothPath(pts)),
      core: path.filter((h) => h.q === 0 && h.r === 0).length,
      // The undetoured line, drawn faint, to show what the detour cost.
      direct: hexLine(from, to).map((h) => hexToPixel(h.q, h.r)),
    }
  }, [origin, dest])

  const iso = useMemo(() => isotropy(maxRing, sched), [maxRing, sched])

  // --- static layers (time-independent; memoized so the frame loop is cheap) ---

  const polarLattice = useMemo(() => {
    if (mode === 'hex') return null
    const rings: ReactNode[] = []
    for (let ring = 1; ring <= maxRing; ring++) {
      rings.push(
        <circle
          key={`r${ring}`}
          cx={0}
          cy={0}
          r={px(ring * RADIAL_UNIT)}
          fill="none"
          stroke={rgba(BAND_STYLE.outer.tint, 0.16)}
          strokeWidth={1}
        />,
      )
      if (!showCells) continue
      // Slot ticks: short radial marks, so the angular quantization is visible
      // without drawing every cell boundary out to the rim.
      const slots = slotsForRing(ring, sched)
      for (let s = 0; s < slots; s++) {
        const a = (Math.PI * 2 * s) / slots
        const inner = polarToPoint(ring - 0.16, a)
        const outer = polarToPoint(ring + 0.16, a)
        rings.push(
          <line
            key={`t${ring}-${s}`}
            x1={px(inner.x)}
            y1={px(inner.y)}
            x2={px(outer.x)}
            y2={px(outer.y)}
            stroke={rgba(BAND_STYLE.outer.tint, 0.1)}
            strokeWidth={0.7}
          />,
        )
      }
    }
    return <g data-testid="polar-lattice">{rings}</g>
  }, [mode, maxRing, sched, showCells])

  const hexLattice = useMemo(() => {
    if (mode === 'polar' || !showCells) return null
    return (
      <g data-testid="hex-lattice">
        {hexesWithinRadius(maxRing).map((h) => (
          <polygon
            key={`${h.q},${h.r}`}
            points={hexPolygonPoints(hexToPixel(h.q, h.r), HEX_SIZE - 1)}
            fill="none"
            stroke={rgba(BAND_STYLE.inner.tint, 0.09)}
            strokeWidth={0.7}
          />
        ))}
      </g>
    )
  }, [mode, maxRing, showCells])

  // The breathing comparator: hex ring N's cell centres, which oscillate
  // between N*(sqrt3/2) and N in radius, against the true circle at N.
  const breathing = useMemo(() => {
    if (mode !== 'both') return null
    const ring = Math.min(9, maxRing)
    return (
      <g data-testid="breathing-overlay">
        <polygon
          points={toPolyline(ringHexes(ring).map((h) => hexToPixel(h.q, h.r)))}
          fill="none"
          stroke={rgba(HEX_STROKE, 0.35)}
          strokeWidth={1.4}
          strokeDasharray="4 4"
        />
        <circle
          cx={0}
          cy={0}
          r={px(ring * RADIAL_UNIT)}
          fill="none"
          stroke={rgba(POLAR_STROKE, 0.4)}
          strokeWidth={1.4}
        />
      </g>
    )
  }, [mode, maxRing])

  // --- animated layer ---------------------------------------------------------

  const bodies = useMemo(
    () =>
      system.bodies.map((b) => {
        // Continuous angle on a fixed radius: uniform rate, no breathing.
        const angle = orbAngleAt(b.orbit, worldTime, sched)
        const p = polarToPoint(b.orbit.ring, angle)
        return (
          <circle
            key={b.id}
            cx={px(p.x)}
            cy={px(p.y)}
            r={b.size}
            fill={rgba(BODY_TINT[b.kind], b.kind === 'star' ? 0.95 : 0.8)}
            stroke={rgba(BODY_TINT[b.kind], 0.9)}
            strokeWidth={b.kind === 'star' ? 0 : 0.8}
          />
        )
      }),
    [system, worldTime, sched],
  )

  const handleStageClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const rect = e.currentTarget.getBoundingClientRect()
      const x = ((e.clientX - rect.left) / rect.width) * extent * 2 - extent
      const y = ((e.clientY - rect.top) / rect.height) * extent * 2 - extent
      // Shift-click moves the origin; a plain click retargets.
      if (e.shiftKey) setOrigin({ x, y })
      else setDest({ x, y })
      setPresetName('custom')
    },
    [extent],
  )

  const applyPreset = useCallback((name: string) => {
    const p = PRESETS[name]
    if (!p) return
    setPresetName(name)
    setOrigin(p.origin)
    setDest(p.dest)
  }, [])

  const showPolar = mode !== 'hex'
  const showHex = mode !== 'polar'

  return (
    <div className="mx-auto flex max-w-[1500px] flex-col gap-5 p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Heading>Polar board bench</Heading>
          <Text className="max-w-3xl">
            The same order solved on two lattices. Production&apos;s cube grid (
            <span className="font-mono text-xs">lib/hex</span>, amber) plots a chord, staircases it between two of six
            axial directions, and detours around the star. The polar candidate (
            <span className="font-mono text-xs">./polar</span>, sky) lerps in (ring, angle) instead, so the same
            interpolation yields a transfer arc. Click to retarget, shift-click to move the origin.
          </Text>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        {/* --- the stage ------------------------------------------------------ */}
        <div
          data-testid="board-stage"
          className="relative aspect-square w-full overflow-hidden rounded-lg ring-1 ring-zinc-200 dark:ring-white/10"
          style={{ backgroundColor: VOID }}
        >
          <svg
            viewBox={viewBox}
            onClick={handleStageClick}
            data-testid="board-svg"
            className="absolute inset-0 h-full w-full cursor-crosshair"
          >
            {hexLattice}
            {polarLattice}
            {breathing}
            <g>{bodies}</g>

            {/* The hex solve: faint direct line, then the committed detour. */}
            {showHex && (
              <g data-testid="hex-path">
                <polyline
                  points={toPolyline(hexSolve.direct)}
                  fill="none"
                  stroke={rgba(HEX_STROKE, 0.22)}
                  strokeWidth={1.5}
                  strokeDasharray="3 5"
                />
                <polyline
                  points={toPolyline(hexSolve.pts)}
                  fill="none"
                  stroke={rgba(HEX_STROKE, 0.45)}
                  strokeWidth={1.2}
                />
                <polyline
                  points={toPolyline(hexSolve.smooth)}
                  fill="none"
                  stroke={HEX_STROKE}
                  strokeWidth={2.5}
                  strokeLinejoin="round"
                />
              </g>
            )}

            {showPolar && (
              <g data-testid="polar-path">
                <polyline
                  points={toPolyline(polarSolve.pts)}
                  fill="none"
                  stroke={rgba(POLAR_STROKE, 0.45)}
                  strokeWidth={1.2}
                />
                <polyline
                  points={toPolyline(polarSolve.smooth)}
                  fill="none"
                  stroke={POLAR_STROKE}
                  strokeWidth={2.5}
                  strokeLinejoin="round"
                />
              </g>
            )}

            {/* Endpoints. */}
            <circle cx={px(origin.x)} cy={px(origin.y)} r={7} fill="none" stroke={MARKER_STROKE} strokeWidth={2} />
            <circle cx={px(dest.x)} cy={px(dest.y)} r={4} fill={MARKER_STROKE} />
          </svg>
        </div>

        {/* --- controls ------------------------------------------------------- */}
        <aside className="flex flex-col gap-5">
          <section>
            <Subheading>Verdict</Subheading>
            <Text className="mb-1 text-xs">
              Sky is polar, amber is cube. The complaint made numeric: the sharpest heading change the path ever asks
              for, measured after the SAME Chaikin smoothing on both — because raw cell centres staircase on every
              lattice, so the cells row scores the quantizer, not the trajectory.
            </Text>
            <Metric
              label="Turn (drawn)"
              headline
              polar={`${polarSolve.smoothTurn.toFixed(1)}°`}
              hex={`${hexSolve.smoothTurn.toFixed(1)}°`}
              testId="metric-turn"
            />
            <Metric
              label="Turn (cells)"
              polar={`${polarSolve.turn.toFixed(0)}°`}
              hex={`${hexSolve.turn.toFixed(0)}°`}
              testId="metric-rawturn"
            />
            <Metric
              label="Cells"
              polar={String(polarSolve.cells)}
              hex={String(hexSolve.cells)}
              testId="metric-cells"
            />
            <Metric
              label="Distance"
              polar={(polarSolve.length / RADIAL_UNIT).toFixed(1)}
              hex={(hexSolve.length / RADIAL_UNIT).toFixed(1)}
              testId="metric-length"
            />
            <Metric
              label="Core hits"
              polar={String(polarSolve.core)}
              hex={String(hexSolve.core)}
              testId="metric-core"
            />
            <p className="border-t border-zinc-200 pt-2 font-mono text-[10px] leading-relaxed text-zinc-500 dark:border-white/10 dark:text-zinc-400">
              Distance is in radial units (≈ tiles). The arc is longer than the chord between the same endpoints — that
              gap is the movement-tuning bill a polar migration sends, and it is why delta-v wants to be the cost model
              rather than tile count. Cube scores a flat 60° on the cells row for every order, because its staircase
              always alternates between two of six axial directions; polar&apos;s varies with how the two axes alias
              against each other, and &quot;Inbound transfer&quot; is the case where it loses.
            </p>
          </section>

          <section>
            <Subheading>Case</Subheading>
            <Row label="Preset">
              <Select
                value={presetName}
                onChange={(e) => applyPreset(e.target.value)}
                data-testid="ctl-preset"
              >
                {presetName === 'custom' && <option value="custom">custom</option>}
                {Object.keys(PRESETS).map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </Select>
            </Row>
            <p className="py-2 text-xs text-zinc-600 dark:text-zinc-300">
              {PRESETS[presetName]?.note ?? 'Click the board to retarget; shift-click to move the origin.'}
            </p>
            <Row label="Lattice">
              <Select value={mode} onChange={(e) => setMode(e.target.value as LatticeMode)} data-testid="ctl-mode">
                <option value="both">both</option>
                <option value="polar">polar only</option>
                <option value="hex">cube only</option>
              </Select>
            </Row>
            <Row label="Cells" value={showCells ? 'on' : 'off'}>
              <Button plain onClick={() => setShowCells((v) => !v)} data-testid="ctl-cells">
                {showCells ? 'Hide' : 'Show'}
              </Button>
            </Row>
          </section>

          <section>
            <Subheading>Slot schedule</Subheading>
            <Text className="mb-1 text-xs">
              Constant slot count per band, doubling at set radii, so radial neighbours stay 1:1 inside a band and 2:1
              at a boundary. Push the slider and watch isotropy collapse — that is the finding.
            </Text>
            <Row label="Schedule">
              <Select
                value={scheduleName}
                onChange={(e) => applySchedule(e.target.value)}
                data-testid="ctl-schedule"
              >
                {Object.keys(SCHEDULE_PRESETS).map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </Select>
            </Row>
            <Row label="Inner slots" value={String(innerSlots)}>
              <Slider min={6} max={48} step={6} value={innerSlots} onChange={setInnerSlots} testId="ctl-inner-slots" />
            </Row>
            <Row label="Isotropy" value={`${iso.min.toFixed(2)}–${iso.max.toFixed(2)}`}>
              <span className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400">
                tangential ÷ radial; 1.00 is square
              </span>
            </Row>
            <Row label="Ring 1" value={`${slotsForRing(1, sched)} / 6`}>
              <span className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400">polar / cube</span>
            </Row>
            <Row label="Census" value={`${cellCount(maxRing, sched)}`}>
              <span className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400">
                vs {hexCellCount(maxRing)} hexes
              </span>
            </Row>
            <p className="border-t border-zinc-200 pt-2 font-mono text-[10px] leading-relaxed text-zinc-500 dark:border-white/10 dark:text-zinc-400">
              Cube scores a flat 1.05 at every ring by construction — that is the whole reason hex grids exist, and
              it is the real thing a polar migration trades away. More inner slots does NOT buy inner detail: ring 1
              has only 2·π·unit of circumference, so 24 slots there are slivers at aspect 0.26. The honest lever for
              inner detail is radial spacing, not slot count — a separate question this bench does not answer.
            </p>
          </section>

          <section>
            <Subheading>System</Subheading>
            <Row label="Board radius" value={String(maxRing)}>
              <Slider min={8} max={22} step={1} value={maxRing} onChange={setMaxRing} testId="ctl-radius" />
            </Row>
            <Row label="Speed" value={`${speed}×`}>
              <Slider min={0} max={8} step={0.5} value={speed} onChange={setSpeed} testId="ctl-speed" />
            </Row>
            <Row label="Seed">
              <Button plain onClick={() => setSeedTick((n) => n + 1)} data-testid="ctl-reseed">
                Regenerate
              </Button>
            </Row>
            <Row label="Bodies" value={String(system.bodies.length)}>
              <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">{system.name}</span>
            </Row>
            <p className="border-t border-zinc-200 pt-2 font-mono text-[10px] leading-relaxed text-zinc-500 dark:border-white/10 dark:text-zinc-400">
              In &quot;both&quot; mode the dashed amber hexagon against the sky circle at ring 9 is the breathing: cube
              ring centres swing between 0.87N and N in radius, so a body advancing one cell per step speeds up and
              slows down six times per revolution. Periods here follow ring^1.5, which a uniform cube ring walk cannot
              express at all.
            </p>
          </section>
        </aside>
      </div>
    </div>
  )
}
