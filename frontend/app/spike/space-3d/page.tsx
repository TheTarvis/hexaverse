'use client'

// SPIKE — full-3D continuous space, with no cell grid at all. Route: /spike/space-3d
//
// The interaction PoC for the "no board, no cells" question: a seeded system
// of inclined continuous orbits, a ship whose committed burn is a pure
// function of time (the StateAt fold survives), free camera (tilt/pan/zoom),
// and click-to-plot → commit burns against moving targets. Burns fly stored-
// geometry curves (depart prograde, arrive matched, bulge past the star);
// arrivals insert into a rails parking orbit, and station-keeping an exact
// offset costs a continuous fuel drain — the Option B parking economy. The
// sim lives in ./sim (pure, fixture-able); ./SpaceView owns the GL scene.
// The GL world only mounts once the stage measures — so jsdom exercises the
// HUD and command flow without a GL context.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { Button } from '@/components/catalyst/button'
import { Heading } from '@/components/catalyst/heading'
import { Text } from '@/components/catalyst/text'
import { Select } from '@/components/catalyst/select'
import {
  bodyPosition,
  burnDeltaV,
  burnSpeed,
  defaultOrbit,
  dist,
  generateSystem,
  norm,
  orbitFromOffset,
  resolveShip,
  shipPosition,
  shipVelocity,
  solveBurn,
  stationKeepRate,
  sub,
  targetName,
  targetPosition,
} from './sim'
import type { Burn, ShipState, SystemDef, Target } from './sim'
import type { SimClock } from './SpaceView'

// three needs a GL context, so the scene stays off the SSR path entirely.
const SpaceView = dynamic(() => import('./SpaceView').then((m) => m.SpaceView), {
  ssr: false,
  loading: () => <div className="absolute inset-0 grid place-items-center text-xs text-zinc-500">initialising GL…</div>,
})

// The PoC's two dials: the drive's constant acceleration (units/s²) and the
// fuel tank, priced in delta-v (burns cost a·T, station-keeping drains).
const SHIP_ACCEL = 8
const FUEL_MAX = 500
const SPEED_STEPS = [1, 4, 16, 64]
const INITIAL_SEED = 42

const initialShip = (system: SystemDef): ShipState => ({ mode: 'idle', at: defaultOrbit(system, 'p2') })

function Readout({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-zinc-200 py-1.5 dark:border-white/10">
      <span className="shrink-0 font-mono text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        {label}
      </span>
      <span data-testid={testId} className="text-right font-mono text-[12px] tabular-nums text-zinc-800 dark:text-zinc-200">
        {value}
      </span>
    </div>
  )
}

export default function Space3dSpikePage() {
  const [seed, setSeed] = useState(INITIAL_SEED)
  const system = useMemo(() => generateSystem(seed), [seed])
  const clock = useRef<SimClock>({ t: 0, scale: 4, paused: false })
  const [paused, setPaused] = useState(false)
  const [speed, setSpeed] = useState(4)
  const [ship, setShip] = useState<ShipState>(() => initialShip(generateSystem(INITIAL_SEED)))
  const [target, setTarget] = useState<Target | null>(null)
  const [preview, setPreview] = useState<Burn | null>(null)
  const [fuel, setFuel] = useState(FUEL_MAX)
  const [, setTick] = useState(0)
  const fuelRef = useRef(fuel)
  fuelRef.current = fuel
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

  // HUD tick at 5 Hz: re-render the countdowns, drain station-keep upkeep,
  // and re-solve the preview burn against the target's CURRENT orbit — a
  // stale intercept on a moving body is exactly the bug class continuous
  // space introduces.
  useEffect(() => {
    const interval = setInterval(() => {
      // setPreview(null) → null is a React no-op, so the countdowns need
      // their own tick to keep rendering.
      setTick((n) => n + 1)
      const now = clock.current.t
      const dtSim = Math.max(now - lastTickT.current, 0)
      lastTickT.current = now

      const resolved = resolveShip(system, ship, now)
      if (resolved.mode === 'idle' && resolved.at.kind === 'stationkeep') {
        const drained = Math.max(fuelRef.current - stationKeepRate(system, resolved.at.bodyId) * dtSim, 0)
        setFuel(drained)
        // Tank dry: the drive can't hold the frame — fall back to rails.
        if (drained <= 0) {
          setShip({ mode: 'idle', at: orbitFromOffset(resolved.at.bodyId, resolved.at.offset, now) })
        }
      }

      setPreview(
        target && resolved.mode === 'idle'
          ? solveBurn(system, shipPosition(system, ship, now), target, now, SHIP_ACCEL, norm(shipVelocity(system, ship, now)))
          : null
      )
    }, 200)
    return () => clearInterval(interval)
  }, [system, ship, target])

  const handlePick = useCallback((picked: Target) => setTarget(picked), [])
  const handleArrive = useCallback((settled: ShipState) => setShip(settled), [])

  const now = clock.current.t
  const resolved = resolveShip(system, ship, now)
  const burning = resolved.mode === 'burn'
  const parkedAtBody = resolved.mode === 'idle' && (resolved.at.kind === 'orbit' || resolved.at.kind === 'stationkeep')
  const holding = resolved.mode === 'idle' && resolved.at.kind === 'stationkeep'
  const previewFlight = preview ? preview.arrive - preview.depart : 0
  const previewCost = preview ? burnDeltaV(preview) : 0
  const canCommit = !burning && target !== null && preview !== null && previewFlight > 0.05 && previewCost <= fuel

  const commitBurn = () => {
    if (!canCommit || !target) return
    const at = clock.current.t
    const burn = solveBurn(
      system,
      shipPosition(system, ship, at),
      target,
      at,
      SHIP_ACCEL,
      norm(shipVelocity(system, ship, at))
    )
    setFuel((f) => Math.max(f - burnDeltaV(burn), 0))
    setShip({ mode: 'burn', burn })
    setTarget(null)
    setPreview(null)
  }

  // PoC handwave: cancelling zeroes velocity and holds the current point —
  // real cancel semantics (coast? retro-burn?) are a design question for the
  // migration, not this spike.
  const cancelBurn = () => {
    setShip({ mode: 'idle', at: { kind: 'point', point: shipPosition(system, ship, clock.current.t) } })
  }

  // The parking economy: rails orbit is free forever; holding an exact spot
  // in the body's frame runs the drive continuously.
  const toggleHold = () => {
    const at = clock.current.t
    const state = resolveShip(system, ship, at)
    if (state.mode !== 'idle') return
    if (state.at.kind === 'orbit') {
      const offset = sub(shipPosition(system, ship, at), bodyPosition(system, state.at.bodyId, at))
      setShip({ mode: 'idle', at: { kind: 'stationkeep', bodyId: state.at.bodyId, offset } })
    } else if (state.at.kind === 'stationkeep') {
      setShip({ mode: 'idle', at: orbitFromOffset(state.at.bodyId, state.at.offset, at) })
    }
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
    setSeed(next)
    setShip(initialShip(generateSystem(next)))
    setTarget(null)
    setPreview(null)
    setFuel(FUEL_MAX)
  }

  const bodyLabel = (bodyId: string) => targetName(system, { kind: 'body', bodyId })
  const status = burning
    ? `BURN · eta ${Math.max(resolved.burn.arrive - now, 0).toFixed(1)}s · v ${burnSpeed(resolved.burn, now).toFixed(1)}`
    : resolved.at.kind === 'orbit'
      ? `ORBIT · ${bodyLabel(resolved.at.bodyId)}`
      : resolved.at.kind === 'stationkeep'
        ? `HOLD · ${bodyLabel(resolved.at.bodyId)} · ▼${stationKeepRate(system, resolved.at.bodyId).toFixed(1)}/s`
        : 'HOLDING POSITION'

  return (
    <div className="flex h-[calc(100dvh-4rem)] min-h-[480px] flex-col gap-3 p-4">
      <header className="flex items-baseline justify-between gap-4">
        <div>
          <Heading>SPIKE — continuous space</Heading>
          <Text>
            System {system.name} · continuous positions in R³. Drag to tilt/orbit, right-drag to pan, wheel to zoom.
            Click a body or empty space to plot a burn, then commit it.
          </Text>
        </div>
        <Button outline onClick={reseed} data-testid="ctl-reseed">
          Reseed
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 gap-4">
        <div
          ref={stageRef}
          data-testid="space-stage"
          className="relative min-w-0 flex-1 overflow-hidden rounded-lg border border-zinc-300 bg-[#05060a] dark:border-zinc-800"
        >
          {stageReady && (
            <SpaceView
              system={system}
              clock={clock}
              ship={ship}
              preview={preview}
              selected={target}
              onPick={handlePick}
              onArrive={handleArrive}
            />
          )}
        </div>

        <aside className="w-72 shrink-0 overflow-y-auto">
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

            <Readout label="Clock" value={`T+${now.toFixed(1)}s`} testId="hud-clock" />
            <Readout label="Ship" value={status} testId="hud-status" />
            <Readout label="Fuel" value={`${fuel.toFixed(0)} Δv`} testId="hud-fuel" />
            <Readout
              label="Target"
              value={target ? targetName(system, target) : '—'}
              testId="hud-target"
            />
            <Readout
              label="Range"
              value={
                target
                  ? `${dist(shipPosition(system, ship, now), targetPosition(system, target, now)).toFixed(0)} u`
                  : '—'
              }
              testId="hud-range"
            />
            <Readout
              label="Burn ETA"
              value={preview && previewFlight > 0.05 ? `${previewFlight.toFixed(1)}s · Δv ${previewCost.toFixed(0)}` : '—'}
              testId="hud-eta"
            />

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button color="cyan" onClick={commitBurn} disabled={!canCommit} data-testid="ctl-commit">
                Commit burn
              </Button>
              <Button outline onClick={cancelBurn} disabled={!burning} data-testid="ctl-cancel">
                Cancel
              </Button>
              <Button outline onClick={toggleHold} disabled={!parkedAtBody} data-testid="ctl-hold">
                {holding ? 'Resume orbit' : 'Hold here'}
              </Button>
            </div>
          </div>

          <div className="mt-3 rounded-lg bg-zinc-50 p-3 text-[12px] leading-5 text-zinc-600 dark:bg-white/[0.12] dark:text-zinc-400">
            <p className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">What this answers</p>
            <p className="mt-1">
              Burns fly stored-geometry curves — depart prograde, bulge around the star, and wrap into the
              destination&apos;s parking orbit with no kink. Body targets ARE the body: the ghost shows where it will
              be at arrival. Arrival folds into a free rails orbit; <em>Hold here</em> pins your exact spot at a
              continuous fuel drain. Same StateAt contract, no scheduler, no integration.
            </p>
          </div>
        </aside>
      </div>
    </div>
  )
}
