'use client'

// SPIKE — signatures & shadows. Route: /spike/stealth
//
// The detection-asymmetry visualization from docs/plans/continous_space/
// visualization-spikes.md: a scripted patrol burns across the system trailing
// its "everyone can see this" signature ring, then parks and shrinks to a
// dot; a draggable observer's event log writes itself as the rings intersect
// (a preview of sighting-record UI); planets cast shadow wedges from the
// observer, a parking orbit is painted visible-vs-eclipsed, and clicking
// places a station-keep marker showing the Δv bill for holding a hidden
// spot. The three range dials are LIVE sliders — the ambush-vs-telegraph
// balance is felt, not argued. All logic is pure in ./stealth; the SVG view
// is render-only and needs no GL gate.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/catalyst/button'
import { Heading } from '@/components/catalyst/heading'
import { Text } from '@/components/catalyst/text'
import { Select } from '@/components/catalyst/select'
import { generateSystem, resolveShip } from '../space-3d/sim'
import type { SystemDef } from '../space-3d/sim'
import type { SimClock } from '../space-3d/SpaceView'
import { fmtTime, makePatrol, patrolState } from '../intel/intel'
import { DEFAULT_DIALS, contact, emptyWatch, markerInfo, parkingOrbitVisibility, stepWatch, systemExtent } from './stealth'
import type { Dials, P2, StealthEvent, WatchState } from './stealth'
import { StealthView } from './StealthView'

const SPEED_STEPS = [1, 4, 16, 64]
const INITIAL_SEED = 42
const PATROL_STOPS = ['p2', 'p4', 'p1']
const LOG_CAP = 12

// Out toward the rim, well clear of the patrol's opening dwell for any seed.
const initialObserver = (system: SystemDef): P2 => {
  const extent = systemExtent(system)
  return { x: extent * 0.7, z: extent * 0.5 }
}

function Readout({ label, value, testId, alert }: { label: string; value: string; testId: string; alert?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-zinc-200 py-1.5 dark:border-white/10">
      <span className="shrink-0 font-mono text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        {label}
      </span>
      <span
        data-testid={testId}
        className={`text-right font-mono text-[12px] tabular-nums ${
          alert ? 'font-semibold text-red-600 dark:text-red-400' : 'text-zinc-800 dark:text-zinc-200'
        }`}
      >
        {value}
      </span>
    </div>
  )
}

function Dial({
  label,
  value,
  min,
  max,
  step,
  onChange,
  testId,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  testId: string
}) {
  return (
    <label className="block border-t border-zinc-200 py-1.5 dark:border-white/10">
      <span className="flex items-baseline justify-between font-mono text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        {label}
        <span data-testid={`${testId}-value`} className="tabular-nums text-zinc-800 dark:text-zinc-200">
          {value} u
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        data-testid={testId}
        className="w-full accent-cyan-500"
      />
    </label>
  )
}

export default function StealthSpikePage() {
  const [seed, setSeed] = useState(INITIAL_SEED)
  const system = useMemo(() => generateSystem(seed), [seed])
  const patrol = useMemo(() => makePatrol(system, PATROL_STOPS), [system])
  const clock = useRef<SimClock>({ t: 0, scale: 4, paused: false })
  const [paused, setPaused] = useState(false)
  const [speed, setSpeed] = useState(4)
  const [dials, setDials] = useState<Dials>(DEFAULT_DIALS)
  const [observer, setObserver] = useState<P2>(() => initialObserver(generateSystem(INITIAL_SEED)))
  const [marker, setMarker] = useState<P2 | null>(null)
  const [log, setLog] = useState<StealthEvent[]>([])
  const [, setTick] = useState(0)
  const watchRef = useRef<WatchState>(emptyWatch())
  const lastTickT = useRef(0)
  const arcBodyRef = useRef(PATROL_STOPS[0])
  const dialsRef = useRef(dials)
  dialsRef.current = dials
  const observerRef = useRef(observer)
  observerRef.current = observer

  // The event log ticks at 5 Hz through the pure fold, sweeping the interval
  // since the previous tick so a burn that starts AND ends between ticks is
  // still logged (same requirement the intel spike surfaced).
  useEffect(() => {
    const interval = setInterval(() => {
      setTick((n) => n + 1)
      const t = clock.current.t
      const prevT = lastTickT.current
      lastTickT.current = t
      const { watch, events } = stepWatch(system, patrol, observerRef.current, dialsRef.current, watchRef.current, t, prevT)
      watchRef.current = watch
      if (events.length > 0) setLog((l) => [...events.slice().reverse(), ...l].slice(0, LOG_CAP))
    }, 200)
    return () => clearInterval(interval)
  }, [system, patrol])

  const reseed = () => {
    clock.current.t = 0
    lastTickT.current = 0
    watchRef.current = emptyWatch()
    arcBodyRef.current = PATROL_STOPS[0]
    const next = seed + 1
    setSeed(next)
    setObserver(initialObserver(generateSystem(next)))
    setMarker(null)
    setLog([])
  }

  const togglePause = () => {
    clock.current.paused = !clock.current.paused
    setPaused(clock.current.paused)
  }
  const changeSpeed = (value: number) => {
    clock.current.scale = value
    setSpeed(value)
  }

  const now = clock.current.t
  // The painted arc follows the patrol: its current parking orbit while
  // parked, the last one while it burns.
  const resolved = resolveShip(system, patrolState(patrol, now), now)
  if (resolved.mode === 'idle' && resolved.at.kind === 'orbit') arcBodyRef.current = resolved.at.bodyId
  const arcBodyId = arcBodyRef.current
  const arcBodyName = system.bodies.find((b) => b.id === arcBodyId)?.name ?? arcBodyId

  const con = contact(system, patrol, observer, now, dials)
  const arcs = parkingOrbitVisibility(system, arcBodyId, observer, now)
  const mark = marker ? markerInfo(system, marker, observer, now) : null

  const contactStatus = con.detected
    ? con.viaBubble
      ? 'DETECTED · in bubble'
      : con.mode === 'burn'
        ? 'DETECTED · burn plume'
        : 'DETECTED · trim plume'
    : 'DARK'
  const signatureStatus = `${con.mode.toUpperCase()} · sig ${con.signature.toFixed(0)} u · rng ${con.range.toFixed(0)} u`
  const markerStatus = mark
    ? `${mark.inShadow ? 'IN SHADOW' : 'EXPOSED'} · ${mark.bodyName} frame · ▼${mark.drain.toFixed(1)}/s`
    : '— click the map to place'

  return (
    <div className="flex h-[calc(100dvh-4rem)] min-h-[480px] flex-col gap-3 p-4">
      <header className="flex items-baseline justify-between gap-4">
        <div>
          <Heading>SPIKE — signatures &amp; shadows</Heading>
          <Text>
            System {system.name} · top-down ecliptic. Burns are loud, parked is quiet. Drag the cyan observer;
            click anywhere to price a station-keep hiding spot.
          </Text>
        </div>
        <Button outline onClick={reseed} data-testid="ctl-reseed">
          Reseed
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 gap-4">
        <div
          data-testid="stealth-stage"
          className="relative min-w-0 flex-1 overflow-hidden rounded-lg border border-zinc-300 bg-[#05060a] dark:border-zinc-800"
        >
          <StealthView
            system={system}
            clock={clock}
            patrol={patrol}
            observer={observer}
            marker={marker}
            dials={dials}
            arcBodyId={arcBodyId}
            onObserverMove={setObserver}
            onPlaceMarker={setMarker}
          />
        </div>

        <aside className="w-80 shrink-0 overflow-y-auto">
          <div className="rounded-lg bg-zinc-50 p-3 dark:bg-white/[0.12]">
            <div className="mb-2 flex items-center gap-2">
              <Button outline onClick={togglePause} data-testid="ctl-pause">
                {paused ? 'Resume' : 'Pause'}
              </Button>
              <Select
                value={String(speed)}
                onChange={(e) => changeSpeed(Number(e.target.value))}
                data-testid="ctl-speed"
                aria-label="Time scale"
              >
                {SPEED_STEPS.map((step) => (
                  <option key={step} value={step}>
                    {step}× time
                  </option>
                ))}
              </Select>
            </div>

            <Readout label="Clock" value={`${fmtTime(now)} (T+${now.toFixed(1)}s)`} testId="hud-clock" />
            <Readout label="Contact" value={contactStatus} testId="hud-contact" alert={con.detected} />
            <Readout label="Signature" value={signatureStatus} testId="hud-signature" />
            <Readout label={`Orbit @ ${arcBodyName}`} value={`hidden ${(arcs.eclipsedFraction * 100).toFixed(0)}%`} testId="hud-eclipse" />
            <Readout label="Marker" value={markerStatus} testId="hud-marker" />

            <div className="mt-2">
              <Dial label="Plume range" value={dials.plumeRange} min={0} max={300} step={5} testId="dial-plume" onChange={(v) => setDials((d) => ({ ...d, plumeRange: v }))} />
              <Dial label="Trim range" value={dials.trimRange} min={0} max={40} step={1} testId="dial-trim" onChange={(v) => setDials((d) => ({ ...d, trimRange: v }))} />
              <Dial label="Bubble radius" value={dials.bubbleRadius} min={0} max={100} step={5} testId="dial-bubble" onChange={(v) => setDials((d) => ({ ...d, bubbleRadius: v }))} />
            </div>
          </div>

          <div className="mt-3 rounded-lg bg-zinc-50 p-3 dark:bg-white/[0.12]">
            <p className="font-mono text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Event log
            </p>
            <ul data-testid="event-log" className="mt-1 flex flex-col gap-1">
              {log.length === 0 && (
                <li className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">no events yet</li>
              )}
              {log.map((e, i) => (
                <li
                  key={`${e.at}-${i}`}
                  className="rounded border border-zinc-200 px-2 py-1 font-mono text-[11px] leading-4 text-zinc-700 dark:border-white/10 dark:text-zinc-300"
                >
                  {e.text}
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-3 rounded-lg bg-zinc-50 p-3 text-[12px] leading-5 text-zinc-600 dark:bg-white/[0.12] dark:text-zinc-400">
            <p className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">What this answers</p>
            <p className="mt-1">
              Detection = max(your bubble, their signature): a burn is a beacon, a trim plume a whisper, rails
              near-dark. Wedges are what the observer cannot see; the painted orbit shows the free-but-periodic
              hiding of rails (green = eclipsed) vs the paid-but-constant hiding of a station-keep spot — the Δv
              drain is the price of staying invisible. Tune the three dials until ambush vs telegraph feels right.
            </p>
          </div>
        </aside>
      </div>
    </div>
  )
}
