'use client'

// SPIKE — the knowledge game. Route: /spike/intel
//
// The sighting-model visualization from docs/plans/continous_space/
// visualization-spikes.md: your ship parked on rails, a scripted enemy patrol
// riding the same continuous-space sim, and YOUR KNOWLEDGE of it rendered as
// the fog design prescribes — live inside your passive bubble, then a
// timestamped ghost (glimpse = frozen point, its age label carrying the
// staleness; track = the captured motion state extrapolated on its rail
// until their next burn breaks it). Active scan mints tracks; hold Space and
// watch the prediction diverge from reality. No command flow — the enemy is
// scripted, you never move; every bit of knowledge logic is the pure fold in
// ./intel, ticked here. GL mounts only once the stage measures (jsdom-safe).

import { useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { Button } from '@/components/catalyst/button'
import { Heading } from '@/components/catalyst/heading'
import { Text } from '@/components/catalyst/text'
import { Select } from '@/components/catalyst/select'
import { defaultOrbit, generateSystem, shipPosition } from '../space-3d/sim'
import type { ShipState, SystemDef } from '../space-3d/sim'
import type { SimClock } from '../space-3d/SpaceView'
import { emitPulse, emptyKnowledge, fmtTime, makePatrol, stepKnowledge } from './intel'
import type { Knowledge, Patrol } from './intel'

const IntelView = dynamic(() => import('./IntelView').then((m) => m.IntelView), {
  ssr: false,
  loading: () => <div className="absolute inset-0 grid place-items-center text-xs text-zinc-500">initialising GL…</div>,
})

const SPEED_STEPS = [1, 4, 16, 64]
const INITIAL_SEED = 42
// The patrol calls at YOUR planet first — you start with live contact, watch
// it leave, and the whole glimpse→scan→track→divergence loop follows.
const PATROL_STOPS = ['p2', 'p4', 'p1']
const HOME_BODY = 'p2'

// You park opposite the patrol's insertion phase so the two ships aren't
// stacked — still well inside the bubble while it visits your planet.
const initialYou = (system: SystemDef): ShipState => {
  const orbit = defaultOrbit(system, HOME_BODY)
  return orbit.kind === 'orbit' ? { mode: 'idle', at: { ...orbit, phase: Math.PI } } : { mode: 'idle', at: orbit }
}

const initialKnowledge = (system: SystemDef, patrol: Patrol, you: ShipState): Knowledge =>
  stepKnowledge(system, patrol, you, emptyKnowledge(), 0).knowledge

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

const LOG_LABEL = { contact: 'CONTACT', departure: 'LOST', scan: 'TRACK' } as const
const LOG_LABEL_CLASS = {
  contact: 'text-red-600 dark:text-red-400',
  departure: '',
  scan: 'text-amber-600 dark:text-amber-400',
} as const

export default function IntelSpikePage() {
  const [seed, setSeed] = useState(INITIAL_SEED)
  const system = useMemo(() => generateSystem(seed), [seed])
  const patrol = useMemo(() => makePatrol(system, PATROL_STOPS), [system])
  const you = useMemo(() => initialYou(system), [system])
  const clock = useRef<SimClock>({ t: 0, scale: 4, paused: false })
  const [paused, setPaused] = useState(false)
  const [speed, setSpeed] = useState(4)
  const [knowledge, setKnowledge] = useState<Knowledge>(() => {
    const s = generateSystem(INITIAL_SEED)
    return initialKnowledge(s, makePatrol(s, PATROL_STOPS), initialYou(s))
  })
  const [godSticky, setGodSticky] = useState(false)
  const [godHeld, setGodHeld] = useState(false)
  const [, setTick] = useState(0)
  const knowledgeRef = useRef(knowledge)
  knowledgeRef.current = knowledge
  const lastTickT = useRef(0)

  // The GL world mounts only once the stage measures — never in jsdom.
  const stageRef = useRef<HTMLDivElement>(null)
  const [stageReady, setStageReady] = useState(false)
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const check = () => {
      if (el.clientWidth > 0) setStageReady(true)
    }
    check()
    const observer = new ResizeObserver(check)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Knowledge ticks at 5 Hz through the pure fold, sweeping the interval
  // since the previous tick so a fast bubble transit between ticks is still
  // flagged. Ghost/pulse RENDERING is per-frame in the view — only the
  // record-keeping is sampled here.
  useEffect(() => {
    const interval = setInterval(() => {
      setTick((n) => n + 1)
      const t = clock.current.t
      const prevT = lastTickT.current
      lastTickT.current = t
      setKnowledge((k) => stepKnowledge(system, patrol, you, k, t, prevT).knowledge)
    }, 200)
    return () => clearInterval(interval)
  }, [system, patrol, you])

  // Hold Space for the truth view (buttons keep their own click-space, so
  // only intercept when nothing focused would consume it).
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return
      if (e.target === document.body) {
        e.preventDefault()
        setGodHeld(true)
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') setGodHeld(false)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  const godMode = godSticky || godHeld
  const now = clock.current.t

  const scan = () => {
    if (knowledgeRef.current.pulse) return
    const t = clock.current.t
    setKnowledge((k) => (k.pulse ? k : { ...k, pulse: emitPulse(system, patrol, shipPosition(system, you, t), t) }))
  }

  const togglePause = () => {
    clock.current.paused = !clock.current.paused
    setPaused(clock.current.paused)
  }

  const changeSpeed = (value: number) => {
    clock.current.scale = value
    setSpeed(value)
  }

  const reseed = () => {
    clock.current.t = 0
    lastTickT.current = 0
    const next = seed + 1
    const nextSystem = generateSystem(next)
    setSeed(next)
    setKnowledge(initialKnowledge(nextSystem, makePatrol(nextSystem, PATROL_STOPS), initialYou(nextSystem)))
  }

  const sighting = knowledge.latest
  const contactStatus = knowledge.live ? 'LIVE CONTACT' : sighting ? 'CONTACT LOST' : 'NO CONTACT'
  const sightingStatus = sighting
    ? `${sighting.quality.toUpperCase()} · seen ${fmtTime(sighting.asOf)} · Δ${Math.max(now - sighting.asOf, 0).toFixed(0)}s`
    : '—'
  const scanStatus = knowledge.pulse
    ? knowledge.pulse.echo
      ? `ECHO INBOUND · rcv ${fmtTime(knowledge.pulse.echo.receivedAt)}`
      : `SWEEPING · clear ${fmtTime(knowledge.pulse.clearAt)}`
    : 'READY'

  return (
    <div className="flex h-[calc(100dvh-4rem)] min-h-[480px] flex-col gap-3 p-4">
      <header className="flex items-baseline justify-between gap-4">
        <div>
          <Heading>SPIKE — intel &amp; sightings</Heading>
          <Text>
            System {system.name} · a scripted patrol, and what you actually KNOW about it. Drag to orbit the camera,
            wheel to zoom. Hold <kbd className="font-mono">Space</kbd> for the truth.
          </Text>
        </div>
        <Button outline onClick={reseed} data-testid="ctl-reseed">
          Reseed
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 gap-4">
        <div
          ref={stageRef}
          data-testid="intel-stage"
          className="relative min-w-0 flex-1 overflow-hidden rounded-lg border border-zinc-300 bg-[#05060a] dark:border-zinc-800"
        >
          {stageReady && (
            <IntelView
              system={system}
              clock={clock}
              you={you}
              patrol={patrol}
              knowledge={knowledgeRef}
              godMode={godMode}
            />
          )}
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
            <Readout label="Contact" value={contactStatus} testId="hud-contact" alert={knowledge.live} />
            <Readout label="Sighting" value={sightingStatus} testId="hud-sighting" />
            <Readout label="Scan" value={scanStatus} testId="hud-scan" />

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button color="cyan" onClick={scan} disabled={knowledge.pulse !== null} data-testid="ctl-scan">
                Active scan
              </Button>
              <Button
                outline
                onClick={() => setGodSticky((g) => !g)}
                aria-pressed={godMode}
                data-testid="ctl-truth"
              >
                {godMode ? 'Truth: ON' : 'Truth view'}
              </Button>
            </div>
          </div>

          <div className="mt-3 rounded-lg bg-zinc-50 p-3 dark:bg-white/[0.12]">
            <p className="font-mono text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Sighting log
            </p>
            <ul data-testid="sighting-log" className="mt-1 flex flex-col gap-1">
              {knowledge.log.length === 0 && (
                <li className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">no records yet</li>
              )}
              {knowledge.log.map((s, i) => (
                <li
                  key={`${s.receivedAt}-${i}`}
                  className="rounded border border-zinc-200 px-2 py-1 font-mono text-[11px] leading-4 text-zinc-700 dark:border-white/10 dark:text-zinc-300"
                >
                  <span className={LOG_LABEL_CLASS[s.origin]}>{LOG_LABEL[s.origin]}</span>
                  {` · seen ${fmtTime(s.asOf)} at (${s.pos.x.toFixed(0)}, ${s.pos.y.toFixed(0)}, ${s.pos.z.toFixed(0)})`}
                  {s.receivedAt - s.asOf > 0.05 ? ` · rcvd ${fmtTime(s.receivedAt)}` : ''}
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-3 rounded-lg bg-zinc-50 p-3 text-[12px] leading-5 text-zinc-600 dark:bg-white/[0.12] dark:text-zinc-400">
            <p className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">What this answers</p>
            <p className="mt-1">
              &ldquo;I saw that fleet parked at x,y,z at 0:50:30&rdquo; — the sighting IS the intel system. Live
              inside your bubble; a frozen timestamped glimpse once it leaves; an active-scan track that
              predicts their rail <em>perfectly</em> until their next burn breaks it. Hold Space and watch the
              divorce.
            </p>
          </div>
        </aside>
      </div>
    </div>
  )
}
